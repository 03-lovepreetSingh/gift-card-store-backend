import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import { createPayment, getPaymentStatus } from './paymentService';
import axios from 'axios';
import { convertCurrency } from '../utils/currency';
import { CallbackQuery, InlineKeyboardMarkup } from 'node-telegram-bot-api';
import { db } from '../db';
import { payments } from '../db/schema';
import { eq } from 'drizzle-orm';

// Interface for CoinGecko API response
interface CoinGeckoResponse {
  ethereum?: {
    inr: number;
  };
}
// added a comment
// Function to get current ETH to INR rate
async function getEthToInrRate(): Promise<number> {
  try {
    const response = await axios.get<CoinGeckoResponse>('https://api.coingecko.com/api/v3/simple/price', {
      params: {
        ids: 'ethereum',
        vs_currencies: 'inr',
        precision: 2
      }
    });
    
    const rate = response.data.ethereum?.inr;
    if (rate) {
      return rate;
    }
    
    console.warn('Could not fetch ETH to INR rate, using fallback rate');
    return 250000; // Fallback rate (1 ETH = 250,000 INR)
  } catch (error) {
    console.error('Error fetching ETH to INR rate:', error);
    return 250000; // Fallback rate in case of error
  }
}

// Define interfaces for brand data
interface AmountRestrictions {
  minAmount: number;
  maxAmount: number;
  minOrderAmount?: number;
  maxOrderAmount?: number;
  minVoucherAmount?: number;
  maxVoucherAmount?: number;
  maxVouchersPerOrder?: number;
  maxVouchersPerDenomination?: number | null;
  maxDenominationsPerOrder?: number | null;
  denominations: number[];
}

interface HowToUseInstruction {
  retailMode: string;
  retailModeName: string;
  instructions: string[];
}

interface Brand {
  id: string;
  status: string;
  title: string;
  brandDescription?: string;
  category: string[];
  tags: string[];
  denominationType: string;
  cardType: string;
  redemptionType: string;
  amountRestrictions: AmountRestrictions;
  iconImageUrl?: string;
  thumbnailUrl?: string;
  logoUrl?: string;
  tncUrl?: string;
  termsAndConditions?: string[];
  usageInstructions?: Record<string, string[]>;
  howToUseInstructions?: HowToUseInstruction[];
  canBalanceBeFetched?: boolean;
  voucherExpiryInMonths?: number;
  variantDetails?: any[];
  discountPercentage?: number;
}

dotenv.config();
const API_BASE_URL = process.env.API_URL;
let currentPage = 1;
const ITEMS_PER_PAGE = 10;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!TELEGRAM_BOT_TOKEN) {
  throw new Error('TELEGRAM_BOT_TOKEN is not defined in environment variables');
}

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

// Define keyboard button type for TypeScript
type KeyboardButton = {
  text: string;
  callback_data: string;
};

// Define user session interface
interface UserSession {
  currentBrandId?: string;
  awaitingAmount?: boolean;
  // Add other session properties as needed
}

// Store user sessions
const userSessions: {[key: number]: UserSession} = {};

// Store active commands and their handlers
const commands: {[key: string]: (chatId: number, match?: RegExpExecArray | null) => void} = {};

// Register a command handler
const registerCommand = (command: string, handler: (chatId: number, match?: RegExpExecArray | null) => void) => {
  commands[command] = handler;
  
  // Set up the listener for the command
  const regex = new RegExp(`^\/${command}(?:@[\w_]+)?(?:\s+(.*))?$`);
  bot.onText(regex, (msg, match) => {
    const chatId = msg.chat.id;
    handler(chatId, match);
  });
};

// Send a message to a specific chat
const sendMessage = (chatId: number | string, text: string, options?: any) => {
  return bot.sendMessage(chatId, text, options);
};

// Initialize the bot with default commands
const initializeBot = () => {
  // Set bot commands
  bot.setMyCommands([
    { command: 'start', description: 'Start the bot' },
    { command: 'help', description: 'Show help information' },
    { command: 'balance', description: 'Check your balance' },
    { command: 'orders', description: 'View your orders' },
    { command: 'checkout', description: 'Pay  USDT for a gift card'},
  ]);

  // Start command handler
  registerCommand('start', (chatId) => {
    const welcomeMessage = `👋 Welcome to Gift Card Store Bot!\n\n` +
      `*Available commands:*\n` +
      `/start - Show this welcome message\n` +
      `/help - Show help information\n` +
      `/balance - Check your balance\n` +
      `/orders - View your orders\n` +
      `/checkout - Pay  USDT for a gift card`;
    
    sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
  });

  // Help command handler
  registerCommand('help', (chatId) => {
    const helpMessage = `🤖 *Gift Card Store Bot Help*\n\n` +
      `*Available Commands:*\n` +
      `/start - Show welcome message\n` +
      `/help - Show this help message\n` +
      `/balance - Check your account balance\n` +
      `/orders - View your recent orders\n` +
      `/checkout - Pay 1 USDT for a gift card\n` +
      `/brands - Browse available gift card brands\n\n` +
      `Need more help? Contact support.`;
    
    sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
  });
  registerCommand('brands', async (chatId) => {
    try {
      const loadingMessage = await sendMessage(chatId, '🔄 Fetching available brands...');
      
      // Make the API call to get brands
      console.log('Fetching brands from API...');
      const response = await axios.get(`${API_BASE_URL}/brand/`);
      console.log('API Response:', JSON.stringify(response.data.data, null, 2));
      
      const allBrands = Array.isArray(response.data.data) ? response.data.data : [];
      const totalPages = Math.ceil(allBrands.length / ITEMS_PER_PAGE) || 1;
      
      // Reset page if it's out of bounds
      if (currentPage > totalPages) {
        currentPage = 1;
      }
  
      const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
      const paginatedBrands = allBrands.slice(startIdx, startIdx + ITEMS_PER_PAGE);
  
      // Initialize keyboard and message
      const keyboard = {
        reply_markup: {
          inline_keyboard: [] as KeyboardButton[][]
        }
      };
      
      let message = `🎁 *Available Gift Card Brands* (Page ${currentPage}/${totalPages || 1})\n\n`;
      
      if (paginatedBrands.length === 0) {
        message += "No brands found. Please check back later.\n";
      } else {
        
        // Create an array to hold inline keyboard buttons
        const brandButtons: KeyboardButton[][] = [];
        
        paginatedBrands.forEach((brand: Brand, index: number) => {
       
          // Add a button for each brand with view action
          brandButtons.push([
            {
              text: `🔍 View ${brand.title || 'Details'}`,
              callback_data: `view_brand:${brand.id}`
            }
          ]);
          
   
      
        });
        
        // Add the brand buttons to the message options
        if (brandButtons.length > 0) {
          keyboard.reply_markup.inline_keyboard = [
            ...brandButtons,
            ...keyboard.reply_markup.inline_keyboard
          ];
        }
      }
  
  
      // Add navigation buttons if needed
      if (totalPages > 1) {
        const navButtons: KeyboardButton[] = [];
        if (currentPage > 1) {
          navButtons.push({ 
            text: '⬅️ Previous', 
            callback_data: `brands_${currentPage - 1}` 
          });
        }
        if (currentPage < totalPages) {
          navButtons.push({ 
            text: 'Next ➡️', 
            callback_data: `brands_${currentPage + 1}` 
          });
        }
        if (navButtons.length > 0) {
          keyboard.reply_markup.inline_keyboard.push(navButtons);
        }
      }
  
      // Add a refresh button
      keyboard.reply_markup.inline_keyboard.push([
        { text: '🔄 Refresh', callback_data: 'brands_refresh' }
      ]);
  
      // Edit the loading message with the brands
      await bot.editMessageText(message, {
        chat_id: chatId,
        message_id: loadingMessage.message_id,
        parse_mode: 'Markdown',
        ...keyboard
      });
  
    } catch (error: any) {
      console.error('Error fetching brands:', error);
      let errorMessage = 'Failed to fetch brands. Please try again later.';
      
      if (error.response) {
        errorMessage = `API Error: ${error.response.status} - ${error.response.data?.message || 'Unknown error'}`;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      console.error('Error details:', errorMessage);
      
      try {
        await sendMessage(
          chatId,
          `❌ ${errorMessage}`,
          { parse_mode: 'Markdown' }
        );
      } catch (sendError) {
        console.error('Failed to send error message:', sendError);
      }
    }
  });
  
  // Update the callback_query handler (add this inside initializeBot, after other handlers)
  bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message?.chat.id;
    const data = callbackQuery.data;
    const messageId = callbackQuery.message?.message_id;
  
    if (!chatId || !data || !messageId) return;
  
    try {
      // Handle view brand details
      if (data.startsWith('view_brand:')) {
        const brandId = data.split(':')[1];
        if (brandId) {
          // Show loading message
          await bot.editMessageText('🔄 Fetching brand details...', {
            chat_id: chatId,
            message_id: messageId
          });
          
          try {
            // Fetch brand details
            const response = await axios.get<Brand>(`${API_BASE_URL}/brand/${brandId}`);
            const brand = response.data;
            
            if (!brand) {
              throw new Error('Brand not found');
            }
            
            // Build the caption with all brand details
            let caption = `*${brand.title || 'Brand Details'}*\n\n`;
            caption += `🆔 *ID:* ${brand.id}\n`;
            caption += `🟢 *Status:* ${brand.status === 'ACTIVE' ? '✅ Available' : '⏳ Coming Soon'}\n\n`;
            
            // Denomination Info
            if (brand.amountRestrictions) {
              const { minAmount, maxAmount, denominations } = brand.amountRestrictions;
              caption += `💰 *Price Range:* ₹${minAmount} - ₹${maxAmount}\n`;
              
              if (denominations?.length > 0) {
                caption += `📋 *Available Denominations:* ${denominations.map(d => `₹${d}`).join(', ')}\n`;
              }
              caption += '\n';
            }
            
            // Validity
            if (brand.voucherExpiryInMonths) {
              caption += `⏳ *Validity:* ${brand.voucherExpiryInMonths} months\n`;
            }
            
            // Discount
            if (brand.discountPercentage) {
              caption += `🏷️ *Discount:* ${brand.discountPercentage}% OFF\n\n`;
            }
            
            // Description
            caption += `📝 *Description:*\n${brand.brandDescription || 'No description available.'}`;
            
            // Create keyboard with action buttons (defined here to be accessible in both try and catch blocks)
            const keyboard = {
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🛒 Buy Now', callback_data: `buy_${brand.id}` }],
                  [{ text: '🔙 Back to Brands', callback_data: 'brands_1' }]  // Go back to first page
                ]
              }
            };

            // Send the image with the detailed caption
            if (brand.iconImageUrl) {
              try {                
                await bot.sendPhoto(chatId, brand.iconImageUrl, {
                  caption: caption,
                  parse_mode: 'Markdown',
                  ...keyboard
                });
                // No need for a separate message if we have an image
                return;
              } catch (error) {
                console.error('Error sending brand image:', error);
                // If image fails to send, send a new text message with the brand details
                await bot.sendMessage(chatId, caption, {
                  parse_mode: 'Markdown',
                  ...keyboard
                });
              }
            }
            
          } catch (error) {
            console.error('Error fetching brand details:', error);
            await bot.editMessageText('❌ Failed to load brand details. Please try again.', {
              chat_id: chatId,
              message_id: messageId
            });
          }
        }
        return;
      }
      
      // Handle payment status callbacks
      if (data.startsWith('payment_status:')) {
        const orderId = data.split(':')[1];
        const paymentResponse = await getPaymentStatus(orderId);
        
        if (paymentResponse.success && paymentResponse.data) {
          const payment = paymentResponse.data;
          
          try {
            // Get user details from the message
            const user = callbackQuery.from;
            const amountEth = typeof payment.amount === 'string' 
              ? parseFloat(payment.amount) 
              : typeof payment.amount === 'number' 
                ? payment.amount 
                : 0;
            
            if (isNaN(amountEth)) {
              throw new Error('Invalid payment amount');
            }
            
            // Get current ETH to INR rate and convert
            const ethToInrRate = await getEthToInrRate();
            const amountInr = Math.round(amountEth * ethToInrRate);
            
            console.log(`Converting ${amountEth} ETH to INR at rate: 1 ETH = ${ethToInrRate} INR`);
            console.log(`Amount in INR: ${amountInr}`);
            // Prepare the order data according to the expected format
            const orderData = {
              productId: userSessions[chatId]?.currentBrandId || '',
              referenceId: `TEL-${Date.now()}-${user.id}`, // Unique reference ID
              amount: amountInr.toString(), // Converted to INR and ensure it's a string
              denominationDetails: [
                {
                  denomination: amountInr.toString(), // Converted to INR and ensure it's a string
                  quantity: 1
                }
              ],
              customerDetails: {
                name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Telegram User',
                phoneNumber: user.id.toString(),
                email: `${user.username || user.id}@telegram.org`
              },
              recipientDetails: {
                name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Telegram User',
                phoneNumber: user.id.toString()
              }
            };
            
            console.log('Order Data:', JSON.stringify(orderData, null, 2));
            
            // Make the POST request to create the order
            const response = await axios.post<{
              id: string;
              referenceId: string;
              status: string;
              vouchers: Array<{
                id: string;
                cardType: 'PIN_SECURED' | 'CARD_NO_AND_PIN';
                cardPin?: string;
                cardNumber?: string;
                validTill: string;
                amount: string;
              }>;
              failureReason: string | null;
            }>(
              'https://gift-card-store-backend-1.onrender.com/api/orders',
              orderData,
              {
                headers: {
                  'Content-Type': 'application/json'
                }
              }
            );

            // Build the success message with voucher details
            let message = '✅ *Order Confirmation*\n\n' +
              `Order ID: ${response.data.id || 'N/A'}\n` +
              `Reference ID: ${response.data.referenceId || 'N/A'}\n` +
              `Status: ${response.data.status || 'N/A'}\n\n`;

            // Add voucher details if available
            if (response.data.vouchers && response.data.vouchers.length > 0) {
              message += '*🎫 Voucher Details:*\n';
              response.data.vouchers.forEach((voucher, index) => {
                message += `\n*Voucher ${index + 1}:*\n`;
                message += `Card Number: ${voucher.cardNumber || 'N/A'}\n`;
                message += `PIN: ${voucher.cardPin || 'N/A'}\n`;
                message += `Amount: ₹${voucher.amount || '0'}\n`;
                message += `Valid Till: ${voucher.validTill || 'N/A'}\n`;
                message += `Type: ${voucher.cardType || 'N/A'}\n`;
              });
            }

            message += '\nThank you for your purchase! 🎉';

            // Send the message with voucher details
            await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });

          } catch (error) {
            console.error('Error creating order:', error);
            await bot.sendMessage(
              chatId,
              '❌ Failed to create order. Please contact support with your order ID: ' + orderId,
              { parse_mode: 'Markdown' }
            );
          }
        }
        return;
      }
  
      // Handle brands pagination
      if (data.startsWith('brands_')) {
        const page = parseInt(data.split('_')[1]);
        if (!isNaN(page)) {
          currentPage = page;
        }
  
        // Acknowledge the callback
        await bot.answerCallbackQuery(callbackQuery.id);
        
        // Show typing action
        await bot.sendChatAction(chatId, 'typing');
        
        // Trigger the brands command again with the updated page
        // @ts-ignore - We know the command exists
        commands['brands'](chatId);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error handling callback query:', errorMessage);
      try {
        await bot.answerCallbackQuery(callbackQuery.id, {
          text: '❌ An error occurred. Please try again.',
          show_alert: true
        });
      } catch (err) {
        console.error('Failed to send error message:', err);
      }
    }
  });
  
 

  // Update the setMyCommands to include the new commands
  bot.setMyCommands([
    { command: 'start', description: 'Start the bot' },
    { command: 'help', description: 'Show help information' },
    { command: 'balance', description: 'Check your balance' },
    { command: 'orders', description: 'View your orders' },
    { command: 'checkout', description: 'Pay USDT for a gift card' },
    { command: 'brands', description: 'Browse available gift card brands' },
    { command: 'brand', description: 'Get details of a specific brand by ID' }
  ]);
  
  // Update the help message to include the new command
  const helpMessage = `🤖 *Gift Card Store Bot Help*\n\n` +
    `*Available Commands:*\n` +
    `/start - Show welcome message\n` +
    `/help - Show this help message\n` +
    `/balance - Check your account balance\n` +
    `/orders - View your recent orders\n` +
    `/checkout - Pay 1 USDT for a gift card\n` +
    `/brands - Browse available gift card brands\n` +
    `/brand <id> - Get details of a specific brand\n\n` +
    `Need more help? Contact support.`;
  
  // Update the help command handler
  registerCommand('help', (chatId) => {
    sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
  });
  

  // Handle buy button click
  bot.on('callback_query', async (callbackQuery) => {
    if (!callbackQuery.data || !callbackQuery.message) return;
    
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const data = callbackQuery.data;

    // Handle buy button click
    if (data.startsWith('buy_')) {
      const brandId = data.split('_')[1];
      
      try {
        // Store the brand ID in the user's session
        userSessions[chatId] = {
          ...userSessions[chatId],
          currentBrandId: brandId,
          awaitingAmount: true
        };
        
        // Get brand details to show amount range
        const response = await axios.get<Brand>(`${API_BASE_URL}/brand/${brandId}`);
        const brand = response.data;
        
        if (!brand || !brand.amountRestrictions) {
          throw new Error('Could not retrieve brand details');
        }
        
        const { minAmount, maxAmount } = brand.amountRestrictions;
        const messageText = `💳 *Enter Amount*\n\n` +
          `Please enter the amount for ${brand.title} (between ₹${minAmount} and ₹${maxAmount}):`;
        
        const keyboard = {
          reply_markup: {
            inline_keyboard: [
              [{ text: '❌ Cancel', callback_data: 'cancel_amount' }]
            ]
          }
        };
        
        try {
          // First try to edit the existing message
          await bot.editMessageText(messageText, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown',
            ...keyboard
          });
        } catch (editError: unknown) {
          const errorMessage = editError instanceof Error ? editError.message : 'Unknown error';
          console.log('Could not edit message, sending new one:', errorMessage);
          // If editing fails (e.g., it's a photo message), send a new message
          await bot.sendMessage(chatId, messageText, {
            parse_mode: 'Markdown',
            ...keyboard
          });
        }
        
      } catch (error) {
        console.error('Error in buy flow:', error);
        await bot.editMessageText('❌ Failed to start purchase. Please try again.', {
          chat_id: chatId,
          message_id: messageId
        });
      }
      return;
    }
    
    // Handle amount input (text message)
    if (userSessions[chatId]?.awaitingAmount) {
      const amount = parseFloat(callbackQuery.data);
      const brandId = userSessions[chatId].currentBrandId;
      
      try {
        // Get brand details to validate amount
        const response = await axios.get<Brand>(`${API_BASE_URL}/brand/${brandId}`);
        const brand = response.data;
        
        if (!brand || !brand.amountRestrictions) {
          throw new Error('Could not retrieve brand details');
        }
        
        const { minAmount, maxAmount } = brand.amountRestrictions;
        
        if (isNaN(amount) || amount < minAmount || amount > maxAmount) {
          await bot.sendMessage(
            chatId,
            `❌ Invalid amount. Please enter a value between ₹${minAmount} and ₹${maxAmount}.`,
            { parse_mode: 'Markdown' }
          );
          return;
        }
        
        // Clear the awaiting state
        userSessions[chatId].awaitingAmount = false;
        
        // Create payment with the entered amount
        const loadingMessage = await sendMessage(chatId, '🔄 Creating payment link...');
      // put the amount in the payment response
        const paymentResponse = await createPayment(chatId, amount, 'USDT');
      
        
        if (paymentResponse.status !== 'success' || !paymentResponse.data) {
          throw new Error(paymentResponse.error || 'Failed to create payment');
        }
        
        const { data: payment } = paymentResponse;
        
        // Show payment link
        const paymentMessage = `💳 *Payment Request*\n\n` +
          `Brand: *${brand.title}*\n` +
          `Amount: *${amount} USDT*\n` +
          `Status: *Pending*\n\n` +
          `[Click here to pay](${payment.invoice_url})`;
        
        await bot.editMessageText(paymentMessage, {
          chat_id: chatId,
          message_id: loadingMessage.message_id,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '💳 Pay Now', url: payment.invoice_url }],
              [{ text: '✅ Check Status', callback_data: `payment_status:${payment.order_id}` }]
            ]
          }
        });
        
      } catch (error) {
        console.error('Error in payment flow:', error);
        await bot.sendMessage(
          chatId,
          '❌ An error occurred while processing your payment. Please try again.',
          { parse_mode: 'Markdown' }
        );
      }
      return;
    }
    
    // Handle cancel button
    if (data === 'cancel_amount') {
      if (userSessions[chatId]) {
        userSessions[chatId].awaitingAmount = false;
      }
      await bot.editMessageText('❌ Purchase cancelled.', {
        chat_id: chatId,
        message_id: messageId
      });
      return;
    }
  });
  
  // Handle text messages for amount input
  bot.on('message', async (msg) => {
    if (!msg.text || !msg.chat) return;
    
    const chatId = msg.chat.id;
    
    // Only process if we're expecting an amount
    if (userSessions[chatId]?.awaitingAmount) {
      const amount = parseFloat(msg.text);
      const brandId = userSessions[chatId].currentBrandId;
      
      try {
        // Get brand details to validate amount
        const response = await axios.get<Brand>(`${API_BASE_URL}/brand/${brandId}`);
        const brand = response.data;
        
        if (!brand || !brand.amountRestrictions) {
          throw new Error('Could not retrieve brand details');
        }
        
        const { minAmount, maxAmount } = brand.amountRestrictions;
        
        if (isNaN(amount) || amount < minAmount || amount > maxAmount) {
          await bot.sendMessage(
            chatId,
            `❌ Invalid amount. Please enter a value between ₹${minAmount} and ₹${maxAmount}.`,
            { parse_mode: 'Markdown' }
          );
          return;
        }
        
        // Clear the awaiting state
        userSessions[chatId].awaitingAmount = false;
        
        // Create payment with the entered amount
        const loadingMessage = await sendMessage(chatId, '🔄 Creating payment link...');
        
        try {
          const inrAmount = amount;
          // Convert INR to USD (assuming amount is in INR)
          const usdAmount = await convertCurrency(amount, 'INR', 'USD');
          
          // Create payment with the converted amount
          const paymentResponse = await createPayment(chatId, usdAmount, inrAmount.toString(), 'USDT');
          
          if (paymentResponse.status !== 'success' || !paymentResponse.data) {
            throw new Error(paymentResponse.error || 'Failed to create payment');
          }
          
          const { data: payment } = paymentResponse;
          
          // Show payment link
          const paymentMessage = `💳 *Payment Request*\n\n` +
            `Brand: *${brand.title}*\n` +
            `Amount: *${amount} USDT*\n` +
            `Status: *Pending*\n\n` +
            `[Click here to pay](${payment.invoice_url})`;
          
          await bot.editMessageText(paymentMessage, {
            chat_id: chatId,
            message_id: loadingMessage.message_id,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '💳 Pay Now', url: payment.invoice_url }],
                [{ text: '✅ Check Status', callback_data: `payment_status:${payment.txn_id}` }]
              ]
            }
          });
          
        } catch (error) {
          console.error('Error in payment creation:', error);
          try {
            await bot.editMessageText('❌ Error creating payment. Please try again.', {
              chat_id: chatId,
              message_id: loadingMessage.message_id,
              parse_mode: 'Markdown'
            });
          } catch (editError: unknown) {
            const errorMessage = editError instanceof Error ? editError.message : 'Unknown error';
            console.error('Failed to update error message:', errorMessage);
            await sendMessage(chatId, '❌ Error creating payment. Please try again.', { parse_mode: 'Markdown' });
          }
          return;
        }
        
      } catch (error) {
        console.error('Error in payment flow:', error);
        await bot.sendMessage(
          chatId,
          '❌ An error occurred while processing your payment. Please try again.',
          { parse_mode: 'Markdown' }
        );
      }
    }
  });
      
  // Set up a listener for payment status checks
  bot.on('callback_query', async (callbackQuery) => {
    if (!callbackQuery.data?.startsWith('payment_status:')) return;
    if (!callbackQuery.message) return;
    
    const chatId = callbackQuery.message.chat.id;
    const orderId = callbackQuery.data.split(':')[1];
    
    try {
      // Show typing indicator
      await bot.sendChatAction(chatId, 'typing');
      console.log('Checking payment status for order:', orderId);
      const paymentResponse = await getPaymentStatus(orderId);
      
      if (!paymentResponse.success || !paymentResponse.data) {
        throw new Error(paymentResponse.error || 'Failed to get payment status');
      }
      
      const payment = paymentResponse.data;
      const paymentStatus = (payment.status || 'pending').toLowerCase();
      
      // Handle completed or mismatched payments by creating an order
      if (paymentStatus === 'completed' || paymentStatus === 'completed_' || paymentStatus === 'mismatch') {
        try {
          // Get user details from the message
          const user = callbackQuery.from;
          const amount = payment.amount || 0;
          
          // Prepare the order data
          const orderData = {
            productId: userSessions[chatId]?.currentBrandId || '',
            referenceId: orderId, // Use the payment order ID as reference
            amount: amount,
            denominationDetails: [
              {
                denomination: amount,
                quantity: 1
              }
            ],
            customerDetails: {
              name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Telegram User',
              phoneNumber: user.id.toString(),
              email: `${user.username || user.id}@telegram.org`
            },
            recipientDetails: {
              name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Telegram User',
              phoneNumber: user.id.toString()
            }
          };

          // Make the POST request to create the order
          const response = await axios.post<{
            id: string;
            referenceId: string;
            status: string;
            vouchers: Array<{
              id: string;
              cardType: string;
              cardPin: string;
              cardNumber: string;
              validTill: string;
              amount: number;
            }>;
            failureReason: string | null;
          }>(
            'https://gift-card-store-backend-1.onrender.com/order',
            orderData,
            {
              headers: {
                'Content-Type': 'application/json'
              }
            }
          );

          // If order creation was successful, update the payment status and show voucher details
          if (response.data && response.data.status === 'success' && response.data.vouchers && response.data.vouchers.length > 0) {
            payment.status = 'completed';
            payment.updatedAt = new Date();
            
            // Store voucher details in the payment object
            payment.voucherDetails = response.data.vouchers;
            
            // Send voucher details to the user
            let voucherMessage = '🎉 *Your Voucher Details* 🎉\n\n';
            
            response.data.vouchers.forEach((voucher, index) => {
              voucherMessage += `*Voucher ${index + 1}:*\n`;
              voucherMessage += `🔹 *Card Number:* \`${voucher.cardNumber || 'N/A'}\`\n`;
              voucherMessage += `🔹 *PIN:* \`${voucher.cardPin || 'N/A'}\`\n`;
              voucherMessage += `🔹 *Amount:* ₹${voucher.amount || '0'}\n`;
              voucherMessage += `🔹 *Valid Till:* ${voucher.validTill || 'N/A'}\n`;
              voucherMessage += `🔹 *Type:* ${voucher.cardType || 'N/A'}\n\n`;
            });
            
            voucherMessage += '💡 *Important:* Keep this information safe and do not share it with anyone.';
            
            // Send the voucher details in a separate message
            await bot.sendMessage(chatId, voucherMessage, {
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [{ text: '✅ I have saved my voucher', callback_data: 'voucher_saved' }],
                  [{ text: '📞 Need help? Contact support', url: 'https://t.me/your_support_username' }]
                ]
              }
            });
            
            // In a real app, save the updated status and voucher details to your database
          }
        } catch (orderError) {
          console.error('Error creating order:', orderError);
          // Continue to show payment status even if order creation fails
        }
      }
      
      let statusText = '';
      let statusEmoji = '';
      let additionalMessage = '';
      
      // Map Plisio statuses to user-friendly messages
      switch (paymentStatus) {
        case 'completed':
        case 'completed_':
          statusText = 'Payment Successful!';
          statusEmoji = '✅';
          additionalMessage = '✅ Your order has been processed successfully!';
          break;
        case 'mismatch':
          statusText = 'Payment amount mismatch';
          statusEmoji = '⚠️';
          additionalMessage = '⚠️ We detected a payment amount mismatch. Please contact support with your payment details.';
          break;
        case 'pending':
        case 'new':
          statusText = 'Waiting for confirmation';
          statusEmoji = '⏳';
          additionalMessage = '⏳ Please wait while we confirm your payment. This may take a few minutes.';
          break;
        case 'failed':
        case 'error':
          statusText = 'Payment Failed';
          statusEmoji = '❌';
          additionalMessage = '❌ Your payment failed. Please try again or contact support.';
          break;
        case 'expired':
          statusText = 'Payment Expired';
          statusEmoji = '⌛';
          additionalMessage = '⌛ Your payment session has expired. Please initiate a new payment.';
          break;
        case 'cancelled':
          statusText = 'Payment Cancelled';
          statusEmoji = '❌';
          additionalMessage = '❌ Your payment was cancelled. Please try again if you wish to complete your purchase.';
          break;
        default:
          statusText = payment.status;
          statusEmoji = 'ℹ️';
          additionalMessage = 'Please contact support for assistance with your payment.';
      }
      
      const message = `💳 *Payment Status*\n\n` +
        `Order ID: *${payment.orderId || orderId}*\n` +
        `Amount: *${payment.amount || 'N/A'} USDT*\n` +
        `Status: ${statusEmoji} *${statusText}*\n\n${additionalMessage}`;
      
      // Prepare reply markup based on status
      const replyMarkup = {
        inline_keyboard: [
          [{ text: '🔄 Refresh Status', callback_data: `payment_status:${orderId}` }],
          [{ text: '📞 Contact Support', url: 'https://t.me/your_support_username' }]
        ]
      };
      
      // Add voucher details button if payment is completed
      if ((paymentStatus === 'completed' || paymentStatus === 'completed_') && payment.voucherDetails) {
        replyMarkup.inline_keyboard.unshift([
          { text: '📝 View Voucher', callback_data: `view_voucher:${orderId}` }
        ]);
      }
      
      // Update the message with the payment status
      await bot.editMessageText(message, {
        chat_id: chatId,
        message_id: callbackQuery.message.message_id,
        parse_mode: 'Markdown',
        reply_markup: replyMarkup
      });
      
      // Acknowledge the callback
      await bot.answerCallbackQuery(callbackQuery.id);
      
    } catch (error) {
      console.error('Error checking payment status:', error);
      
      // Try to send an error message
      try {
        await bot.answerCallbackQuery(callbackQuery.id, {
          text: '❌ Failed to get payment status. Please try again.',
          show_alert: true
        });
        
        // Update the message with an error
        await bot.editMessageText(
          '❌ *Error*\n\n' +
          'We encountered an error while checking your payment status.\n' +
          'Please try again in a few moments.',
          {
            chat_id: chatId,
            message_id: callbackQuery.message.message_id,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔄 Try Again', callback_data: `payment_status:${orderId}` }],
                [{ text: '📞 Contact Support', url: 'https://t.me/your_support_username' }]
              ]
            }
          }
        );
      } catch (editError: unknown) {
        const errorMessage = editError instanceof Error ? editError.message : 'Unknown error';
        console.error('Failed to update error message:', errorMessage);
      }
    }
  });

  // Error handling
  bot.on('polling_error', (error) => {
    console.error('Polling error:', error);
  });

  console.log('🤖 Telegram bot is running...');
};

export { bot, registerCommand, sendMessage, initializeBot };
