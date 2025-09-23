import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import { createPayment, getPaymentStatus } from './paymentService';
import axios from 'axios';

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
const API_BASE_URL = 'https://gift-card-store-backend-1.onrender.com';
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
          const brandNumber = startIdx + index + 1;
          // Add just the brand title and a view button
          message += `*${brandNumber}. ${brand.title || 'Unnamed Brand'}*`;
          
          // Add a button for each brand with view action
          brandButtons.push([
            {
              text: `🔍 View ${brand.title || 'Details'}`,
              callback_data: `view_brand:${brand.id}`
            }
          ]);
          
          // Add a separator between brands
          message += '\n━━━━━━━━━━━━━━━━━━━━\n\n';
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
            
            // Format brand details message with image and description
            let message = '';
            
            // Add brand image if available
            if (brand.iconImageUrl) {
              // Send the image first
              try {
                await bot.sendPhoto(chatId, brand.iconImageUrl, {
                  caption: `*${brand.title || 'Brand Details'}*`,
                  parse_mode: 'Markdown'
                });
              } catch (error) {
                console.error('Error sending brand image:', error);
              }
            }
            
            // Start building the details message
            message = `*${brand.title || 'Brand Details'}*\n\n`;
            
            // Basic Info
            message += `🆔 *ID:* ${brand.id}\n`;
            message += `🟢 *Status:* ${brand.status === 'ACTIVE' ? '✅ Available' : '⏳ Coming Soon'}\n\n`;
            
            // Denomination Info
            if (brand.amountRestrictions) {
              const { minAmount, maxAmount, denominations } = brand.amountRestrictions;
              message += `💰 *Price Range:* ₹${minAmount} - ₹${maxAmount}\n`;
              
              if (denominations?.length > 0) {
                message += `📋 *Available Denominations:* ${denominations.map(d => `₹${d}`).join(', ')}\n`;
              }
              message += '\n';
            }
            
            // Validity
            if (brand.voucherExpiryInMonths) {
              message += `⏳ *Validity:* ${brand.voucherExpiryInMonths} months\n`;
            }
            
            // Discount
            if (brand.discountPercentage) {
              message += `🏷️ *Discount:* ${brand.discountPercentage}% OFF\n`;
            }
            
            // Description - Always show description in detailed view
            message += `\n📝 *Description:*\n${brand.brandDescription || 'No description available.'}\n`;
            
            // Create keyboard with action buttons
            const keyboard = {
              reply_markup: {
                inline_keyboard: [
                  [{ text: '🛒 Buy Now', callback_data: `buy_${brand.id}` }],
                  [{ text: '🔙 Back to Brands', callback_data: 'brands_1' }]  // Go back to first page
                ]
              }
            };
            
            // Update the message with brand details
            await bot.editMessageText(message, {
              chat_id: chatId,
              message_id: messageId,
              parse_mode: 'Markdown',
              ...keyboard
            });
            
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
        const payment = await getPaymentStatus(orderId);
        // ... existing payment status handling code ...
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
    } catch (error) {
      console.error('Error handling callback query:', error);
      await bot.answerCallbackQuery(callbackQuery.id, {
        text: '❌ An error occurred. Please try again.',
        show_alert: true
      });
    }
  });
  
  // Command to get brand details by ID
  registerCommand('brand', async (chatId, match) => {
    try {
      console.log('Match:', match);
      const brandId = match?.[1]?.trim();
      console.log('Brand ID:', brandId);
      
      if (!brandId) {
        await sendMessage(chatId, '❌ Please provide a brand ID. Usage: `/brand <id>`', {
          parse_mode: 'Markdown'
        });
        return;
      }

      const loadingMessage = await sendMessage(chatId, '🔄 Fetching brand details...');
      
      try {
        const response = await axios.get<Brand>(`${API_BASE_URL}/brand/${brandId}`);
        const brand: Brand = response.data;
        
        if (!brand) {
          await bot.editMessageText('❌ Brand not found.', {
            chat_id: chatId,
            message_id: loadingMessage.message_id,
            parse_mode: 'Markdown'
          });
          return;
        }

        let message = `*${brand.title || 'Brand Details'}*\n\n`;
        
        // Basic Info
        message += `🆔 *ID:* ${brand.id}\n`;
        message += `🟢 *Status:* ${brand.status === 'ACTIVE' ? '✅ Available' : '⏳ Coming Soon'}\n\n`;
        
        // Denomination Info
        if (brand.amountRestrictions) {
          const { minAmount, maxAmount, denominations } = brand.amountRestrictions as AmountRestrictions;
          message += `💰 *Price Range:* ₹${minAmount} - ₹${maxAmount}\n`;
          
          if (denominations?.length > 0) {
            message += `📋 *Available Denominations:* ${denominations.map((d: number) => `₹${d}`).join(', ')}\n`;
          }
          message += '\n';
        }
        
        // Validity
        if (brand.voucherExpiryInMonths) {
          message += `⏳ *Validity:* ${brand.voucherExpiryInMonths} months\n`;
        }
        
        // Discount
        if (brand.discountPercentage) {
          message += `🏷️ *Discount:* ${brand.discountPercentage}% OFF\n`;
        }
        
        // Description
        if (brand.brandDescription) {
          message += `\n📝 *Description:*\n${brand.brandDescription}\n`;
        }
        
        // Terms and Conditions
        if (brand.termsAndConditions?.length) {
          message += '\n📜 *Terms & Conditions:*\n';
          brand.termsAndConditions.forEach((term, index) => {
            message += `${index + 1}. ${term}\n`;
          });
        }
        
        // How to Use
        if (brand.howToUseInstructions?.length) {
          message += '\nℹ️ *How to Use:*\n';
          brand.howToUseInstructions.forEach((instruction: HowToUseInstruction) => {
            message += `*${instruction.retailModeName || 'Usage'}:*\n`;
            instruction.instructions.forEach((step, i) => {
              message += `${i + 1}. ${step}\n`;
            });
          });
        }
        
        // Create keyboard with action buttons
        const keyboard = {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🛒 Buy Now', callback_data: `buy_${brand.id}` }],
              [{ text: '🔙 Back to Brands', callback_data: 'back_to_brands' }]
            ]
          }
        };
        
        // Send the detailed brand information
        await bot.editMessageText(message, {
          chat_id: chatId,
          message_id: loadingMessage.message_id,
          parse_mode: 'Markdown',
          ...keyboard
        });
        
      } catch (error: any) {
        console.error('Error fetching brand details:', error);
        const errorMessage = error.response?.data?.message || 'Failed to fetch brand details';
        await bot.editMessageText(`❌ Error: ${errorMessage}`, {
          chat_id: chatId,
          message_id: loadingMessage.message_id,
          parse_mode: 'Markdown'
        });
      }
      
    } catch (error) {
      console.error('Error in brand command:', error);
      sendMessage(chatId, '❌ An error occurred while processing your request.');
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
  

  // Checkout command handler
  registerCommand('checkout', async (chatId) => {
    try {
      // Send a loading message
      const loadingMessage = await sendMessage(chatId, '🔄 Creating payment link...');
      
      // Create a payment
      const paymentResponse = await createPayment(chatId, 1, 'USDT');
      
      if (paymentResponse.status !== 'success' || !paymentResponse.data) {
        throw new Error(paymentResponse.error || 'Failed to create payment');
      }
      
      const { data: payment } = paymentResponse;
      
      // Edit the loading message with the payment link
      const paymentMessage = `💳 *Payment Request*\n\n` +
        `Amount: * USDT*\n` +
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
      
      // Set up a listener for payment status checks
      bot.on('callback_query', async (callbackQuery) => {
        if (!callbackQuery.data?.startsWith('payment_status:')) return;
        
        const orderId = callbackQuery.data.split(':')[1];
        const payment = await getPaymentStatus(orderId);
        
        if (!payment) {
          await bot.answerCallbackQuery(callbackQuery.id, {
            text: 'Payment not found',
            show_alert: true
          });
          return;
        }
        
        let statusMessage = '';
        
        switch (payment.status) {
          case 'completed':
            statusMessage = '✅ Payment completed! Your gift card has been sent to your account.';
            break;
          case 'pending':
            statusMessage = '⏳ Payment is still pending. Please complete the payment.';
            break;
          case 'expired':
            statusMessage = '❌ Payment link has expired. Please try again.';
            break;
          case 'cancelled':
            statusMessage = '❌ Payment was cancelled. Please try again.';
            break;
          default:
            statusMessage = 'ℹ️ Payment status: ' + payment.status;
        }
        
        await bot.answerCallbackQuery(callbackQuery.id, {
          text: statusMessage,
          show_alert: true
        });
      });
      
    } catch (error: any) {
      console.error('Error in checkout command:', error);
      sendMessage(chatId, '❌ An error occurred while processing your request. Please try again later.');
    }
  });

  // Error handling
  bot.on('polling_error', (error) => {
    console.error('Polling error:', error);
  });

  console.log('🤖 Telegram bot is running...');
};

export { bot, registerCommand, sendMessage, initializeBot };
