import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import { createPayment, getPaymentStatus } from './paymentService';
import { getBrands, getBrandById } from '../controllers/brandControllers';
import { Request, Response } from 'express';
import axios from 'axios';
import { 
  transformApiDataToGiftCards, 
  getUniqueCategories,
  type GiftCard
} from '../utils/giftCardUtils';

dotenv.config();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!TELEGRAM_BOT_TOKEN) {
  throw new Error('TELEGRAM_BOT_TOKEN is not defined in environment variables');
}

// Create bot instance
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

interface BrandMessage {
  message_id: number;
  chat?: {
    id: number | string;
    [key: string]: any;
  };
  [key: string]: any;
}

interface Brand {
  id: string;
  status: string;
  title: string;
  brandDescription: string | null;
  category: string[];
  tags: string[];
  denominationType: string;
  cardType: string;
  redemptionType: string;
  amountRestrictions: {
    minAmount: number;
    maxAmount: number;
    minOrderAmount: number;
    maxOrderAmount: number;
    minVoucherAmount: number;
    maxVoucherAmount: number;
    maxVouchersPerOrder: number;
    maxVouchersPerDenomination: number | null;
    maxDenominationsPerOrder: number | null;
    denominations: number[];
  };
  iconImageUrl: string;
  thumbnailUrl: string;
  logoUrl: string;
  tncUrl: string;
  termsAndConditions: string[];
  usageInstructions: {
    ONLINE: string[];
  };
  howToUseInstructions: Array<{
    retailMode: string;
    retailModeName: string;
    instructions: string[];
  }>;
  canBalanceBeFetched: boolean;
  voucherExpiryInMonths: number | null;
  variantDetails: any[];
  discountPercentage: number | null;
}

interface BrandResponse extends Brand {
  // Add any additional fields from the API response if needed
}

// Store active commands and their handlers
const commands: {[key: string]: (chatId: number, match?: RegExpExecArray | null) => void} = {};

// Mock Express response object for use with existing controllers
const mockResponse = (chatId: number) => ({
  json: (data: any) => {
    if (Array.isArray(data)) {
      // Format brands list
      const message = data.map((brand: any) => 
        `🎁 *${brand.name}* (${brand.id})\n${brand.description || 'No description'}\n`
      ).join('\n');
      bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    } else {
      // Format single brand
      const brand = data;
      const message = `*${brand.name}* (${brand.id})\n\n${brand.description || 'No description'}\n\n` +
        `💵 *Price:* $${brand.price || 'N/A'}\n` +
        `📦 *In Stock:* ${brand.inStock ? '✅' : '❌'}\n` +
        `🔗 *More Info:* ${brand.url || 'N/A'}`;
      
      bot.sendMessage(chatId, message, { 
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🛒 Buy Now', callback_data: `buy_${brand.id}` }],
            [{ text: '🔙 Back to List', callback_data: 'list_brands' }]
          ]
        }
      });
    }
  },
  status: (code: number) => ({
    json: (error: { error: string }) => {
      bot.sendMessage(chatId, `❌ Error: ${error.error}`);
    }
  })
});

// Define a type for command handlers that can return various types
interface CommandHandler {
  (chatId: number, match?: RegExpExecArray | null): Promise<any> | any;
}

// Function to fetch and display brand details - MOVED UP BEFORE USAGE
const fetchBrandDetails = async (chatId: number, brandId: string, messageId?: number) => {
  try {
    const loadingMsg: BrandMessage = messageId 
      ? { message_id: messageId }
      : await bot.sendMessage(chatId, '🔍 Fetching brand details...');

    try {
      // Fetch brand details from the API with type safety
      const response = await axios.get<Brand>(`https://gift-card-store-backend.onrender.com/brand/${brandId}`);
      const brand = response.data;

      if (!brand) {
        return bot.editMessageText(
          '❌ Brand not found. Please check the brand ID and try again.',
          { chat_id: chatId, message_id: loadingMsg.message_id }
        );
      }

      // Format brand details with type safety
      const defaultDenomination = brand.amountRestrictions?.denominations?.[0] || 0;
      const priceInEth = (defaultDenomination / 3500).toFixed(6);
      const categories = Array.isArray(brand.category) 
        ? brand.category.join(', ')
        : brand.category || 'General';
      const tags = Array.isArray(brand.tags) ? brand.tags.join(', ') : '';
      
      // Build the message
      let message = `🎁 *${brand.title || 'Unnamed Brand'}*\n\n`;
      
      // Add images if available
      const imageUrl = brand.thumbnailUrl || brand.iconImageUrl || brand.logoUrl;
      if (imageUrl) {
        message += `🖼 [View Image](${imageUrl})\n\n`;
      }

      // Add description
      if (brand.brandDescription) {
        message += `📝 *Description:*\n${brand.brandDescription}\n\n`;
      }

      // Add pricing information
      message += `💰 *Pricing:*\n`;
      message += `• $${defaultDenomination.toFixed(2)} USD (${priceInEth} ETH)\n\n`;
      
      // Add categories and tags if available
      if (categories) {
        message += `🏷 *Categories:* ${categories}\n`;
      }
      if (tags) {
        message += `🔖 *Tags:* ${tags}\n\n`;
      }

      // Add terms and conditions if available
      if (brand.termsAndConditions?.length) {
        message += `📜 *Terms & Conditions:*\n`;
        brand.termsAndConditions.slice(0, 3).forEach((term, index) => {
          message += `${index + 1}. ${term}\n`;
        });
        if (brand.termsAndConditions.length > 3) {
          message += `_+ ${brand.termsAndConditions.length - 3} more terms_\n`;
        }
        message += '\n';
      }

      if (brand.tncUrl) {
        message += `[📄 Full Terms & Conditions](${brand.tncUrl})\n\n`;
      }

      // Add usage instructions if available
      const onlineInstructions = brand.usageInstructions?.ONLINE || 
        brand.howToUseInstructions?.find((inst) => inst.retailMode === 'ONLINE')?.instructions || [];
      
      if (onlineInstructions.length > 0) {
        message += `ℹ️ *How to use:*\n${onlineInstructions[0]}\n`;
        if (onlineInstructions.length > 1) {
          message += `_+ ${onlineInstructions.length - 1} more steps_\n`;
        }
      }

      // Send the formatted message
      await bot.editMessageText(message, {
        chat_id: chatId,
        message_id: loadingMsg.message_id,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '🛒 Add to Cart',
                callback_data: `add_to_cart_${brandId}`
              },
              {
                text: '🔙 Back to Brands',
                callback_data: 'show_brands'
              }
            ]
          ]
        }
      });
    } catch (error: any) {
      console.error('Error fetching brand details:', error);
      let errorMessage = '❌ An error occurred while fetching brand details.';
      
      if (error.response) {
        if (error.response.status === 404) {
          errorMessage = '❌ Brand not found. Please check the brand ID and try again.';
        } else {
          errorMessage += `\n\n*Status Code:* ${error.response.status}`;
          if (error.response.data?.message) {
            errorMessage += `\n*Error:* ${error.response.data.message}`;
          }
        }
      } else if (error.request) {
        errorMessage += '\n\n*Error:* No response received from the server.';
      } else {
        errorMessage += `\n\n*Error:* ${error.message}`;
      }
      
      if (messageId) {
        await bot.editMessageText(errorMessage, {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown'
        });
      } else {
        await bot.sendMessage(chatId, errorMessage, { parse_mode: 'Markdown' });
      }
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    console.error('Error in fetchBrandDetails:', errorMessage);
    await bot.sendMessage(
      chatId,
      '❌ An error occurred while processing your request. Please try again.',
      { parse_mode: 'Markdown' }
    );
  }
};

// Register a command handler
const registerCommand = (
  command: string, 
  handler: CommandHandler
) => {
  commands[command] = handler;
  
  // Set up the listener for the command
  const regex = new RegExp(`^\/${command}(?:@[\w_]+)?(?:\s+(.*))?$`);
  bot.onText(regex, async (msg, match) => {
    const chatId = msg.chat.id;
    try {
      // Handle the promise returned by the handler, but don't care about the result
      await Promise.resolve(handler(chatId, match));
    } catch (error) {
      console.error(`Error in command handler for /${command}:`, error);
      try {
        await bot.sendMessage(
          chatId,
          '❌ An error occurred while processing your command. Please try again.',
          { parse_mode: 'Markdown' }
        );
      } catch (sendError) {
        console.error('Failed to send error message:', sendError);
      }
    }
  });
};

// Send a message to a specific chat
const sendMessage = (chatId: number | string, text: string, options: any = {}) => {
  return bot.sendMessage(chatId, text, { parse_mode: 'Markdown', ...options });
};

// Initialize the bot with default commands
const initializeBot = () => {
  // Set bot commands
  bot.setMyCommands([
    { command: 'start', description: 'Start the bot' },
    { command: 'help', description: 'Show help information' },
    { command: 'balance', description: 'Check your balance' },
    { command: 'orders', description: 'View your orders' },
    { command: 'checkout', description: 'Pay USDT for a gift card'},
    { command: 'brands', description: 'List all available brands' },
    { command: 'brand', description: 'View brand details' },
  ]);

  // Start command handler
  registerCommand('start', (chatId) => {
    const welcomeMessage = `👋 Welcome to Gift Card Store Bot!\n\n` +
      `*Available commands:*\n` +
      `/start - Show this welcome message\n` +
      `/help - Show help information\n` +
      `/balance - Check your balance\n` +
      `/orders - View your orders\n` +
      `/brands - List all available brands\n` +
      `/brand [id] - View brand details\n` +
      `/checkout - Pay USDT for a gift card`;
    
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
      `/brands - List all available brands\n` +
      `/brand [id] - View brand details\n` +
      `/checkout - Pay 1 USDT for a gift card\n\n` +
      `Need more help? Contact support.`;
    
    sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
  });

  // Brands command handler
  registerCommand('brands', async (chatId) => {
    try {
      const loadingMsg = await bot.sendMessage(chatId, '🔄 Fetching brands...');
      
      // Fetch brands from the API
      const response = await axios.get('https://gift-card-store-backend.onrender.com/brand');
      
      // Log the raw API response for debugging (first 2 items only to avoid large logs)
      const sampleData = Array.isArray(response?.data) ? response.data.slice(0, 2) : response?.data;
      console.log('Sample API Response (first 2 items):', JSON.stringify(sampleData, null, 2));
      
      // Send a summary instead of the full response
      if (Array.isArray(response?.data)) {
        await bot.sendMessage(
          chatId, 
          `📊 Found ${response.data.length} brands\n` +
          `🔍 Sample IDs: ${response.data.slice(0, 3).map(b => b.id).join(', ')}`
        );
      }
      
      // Ensure response.data is an array before processing
      if (!Array.isArray(response?.data)) {
        console.error('Invalid API response format:', response?.data);
        throw new Error('Invalid response format from server');
      }
      
      // Process the API response directly
      const giftCards = response.data.map((brand: any) => {   
        const defaultDenomination = brand.amountRestrictions?.denominations?.[0] || 0;
        const categories = Array.isArray(brand.category) ? brand.category : [];
        const category = categories[0] || 'General';
        const tags = Array.isArray(brand.tags) ? brand.tags : [];
        const isPopular = (brand.discountPercentage > 0) || tags.includes('popular') || false;
        
        // Format price in ETH (using the same conversion as before)
        const priceInEth = (defaultDenomination / 3500).toFixed(6);
     
        return {
          id: brand.id,
          title: brand.title,
          brand: brand.title,
          brandDescription: brand.brandDescription || `${brand.title} gift card`,
          description: brand.brandDescription || `${brand.title} gift card - Perfect for shopping and gifting`,
          price: defaultDenomination,
          denomination: defaultDenomination,
          priceInEth,
          priceInUsd: defaultDenomination.toFixed(2),
          category,
          image: brand.thumbnailUrl || brand.iconImageUrl,
          iconImageUrl: brand.iconImageUrl,
          thumbnailUrl: brand.thumbnailUrl,
          logoUrl: brand.logoUrl,
          termsAndConditions: brand.termsAndConditions,
          tncUrl: brand.tncUrl,
          isPopular,
          inStock: brand.status === 'ACTIVE',
          cryptoPrice: `≈ ${priceInEth} ETH`,
          discountPercentage: brand.discountPercentage,
          availableDenominations: brand.amountRestrictions?.denominations || [],
          usageInstructions: brand.usageInstructions?.ONLINE || 
                           brand.howToUseInstructions?.find((inst: any) => inst.retailMode === 'ONLINE')?.instructions || []
        };
      });
      
      // Log a summary of processed gift cards for debugging
      console.log(`Processed ${giftCards.length} gift cards`);
      if (giftCards.length > 0) {
        console.log('Sample processed card:', JSON.stringify({
          id: giftCards[0].id,
          brand: giftCards[0].brand,
          price: giftCards[0].price,
          category: giftCards[0].category
        }, null, 2));
      }
      
      if (giftCards.length === 0) {
        return bot.editMessageText('No active brands found.', { 
          chat_id: chatId, 
          message_id: loadingMsg.message_id 
        });
      }
      
      // Format gift cards list with emojis and details
      const brandsList = giftCards.map((card: any) => {
        // Use the first image available in this order: thumbnail, icon, logo
        const imageUrl = card.thumbnailUrl || card.iconImageUrl || card.logoUrl || '';
        
        // Format price with discount if available
        let priceText = `💰 *$${parseFloat(card.priceInUsd).toFixed(2)}*`;
        if (card.discountPercentage > 0) {
          const discountedPrice = (card.price * (1 - (card.discountPercentage / 100))).toFixed(2);
          priceText = `💰 ~~$${card.priceInUsd}~~ *$${discountedPrice}* ` +
                     `(${card.discountPercentage}% off! 🎉)`;
        }
        
        // Truncate description if too long
        const shortDescription = card.brandDescription && card.brandDescription.length > 100 
          ? card.brandDescription.substring(0, 100) + '...' 
          : card.brandDescription || '';
        
        return (
          `🎁 *${card.title || 'Unnamed Brand'}*\n` +
          (imageUrl ? `🖼 [View Image](${imageUrl})\n` : '') +
          (shortDescription ? `📝 ${shortDescription}\n` : '') +
          `${priceText}\n` +
          `🪙 ${card.priceInEth} ETH (≈ $${card.priceInUsd})\n` +
          (card.inStock ? '✅ In Stock' : '❌ Out of Stock') + '\n' +
          (card.tncUrl ? `📄 [Terms & Conditions](${card.tncUrl})\n` : '') +
          `---------------------`
        );
      }).join('\n\n');
      
      // Get unique categories for filtering
      const categories = getUniqueCategories(giftCards);
      
      const messageContent = `*Available Gift Cards (${giftCards.length})*:\n\n${brandsList}`;
      
      // Log the final message content that will be sent to Telegram
      console.log('Message content to be sent to Telegram:', messageContent);
      
      // Create inline keyboard with pagination (10 items per page)
      const itemsPerPage = 10;
      const totalPages = Math.ceil(giftCards.length / itemsPerPage);
      
      // Get current page items (first page by default)
      const currentPage = 1;
      const startIdx = (currentPage - 1) * itemsPerPage;
      const endIdx = startIdx + itemsPerPage;
      const currentItems = giftCards.slice(startIdx, endIdx);
      
      // Create buttons for current page items
      const itemButtons = currentItems.map((card: any) => [
        { 
          text: `🛒 ${card.title} - $${card.priceInUsd}`,
          callback_data: `view_${card.id}`
        }
      ]);
      
      // Add pagination buttons if needed
      const paginationButtons = [];
      if (totalPages > 1) {
        const row = [];
        if (currentPage > 1) {
          row.push({
            text: '⬅️ Previous',
            callback_data: `page_${currentPage - 1}`
          });
        }
        if (currentPage < totalPages) {
          row.push({
            text: 'Next ➡️',
            callback_data: `page_${currentPage + 1}`
          });
        }
        if (row.length > 0) {
          paginationButtons.push(row);
        }
      }
      
      await bot.editMessageText(messageContent, {
        chat_id: chatId,
        message_id: loadingMsg.message_id,
        parse_mode: 'Markdown',
        disable_web_page_preview: true, // Disable link previews to make messages cleaner
        reply_markup: {
          inline_keyboard: [
            ...itemButtons,
            ...paginationButtons,
            // Category filter buttons (first 3 categories)
            categories.slice(0, 3).map(category => ({
              text: `#${category}`,
              callback_data: `filter_category_${category}`
            }))
          ]
        }
      });
      
    } catch (error: unknown) {
      console.error('Error in brands command:');
      
      // Handle different types of errors
      if (error instanceof Error) {
        console.error('Error details:', {
          message: error.message,
          stack: error.stack
        });
      } else if (typeof error === 'object' && error !== null) {
        // Handle axios errors
        const axiosError = error as { response?: { data?: unknown } };
        console.error('API Error:', {
          response: axiosError.response?.data,
          raw: error
        });
      } else {
        console.error('Unknown error:', error);
      }
      bot.sendMessage(
        chatId, 
        '❌ Failed to fetch brands. Please try again later.',
        { parse_mode: 'Markdown' }
      );
    }
  });

  // Brand command handler - Step 1: Ask for brand ID
  registerCommand('brand', async (chatId) => {
    try {
      // Send a message asking for the brand ID
      const sentMessage = await bot.sendMessage(
        chatId,
        '🔍 *Please enter the Brand ID*\n\n' +
        'You can find Brand IDs using the `/brands` command.\n\n' +
        'Example: `123`',
        {
          parse_mode: 'Markdown',
          reply_markup: {
            force_reply: true
          }
        }
      );

      // Define reply listener function
      const replyListener = async (msg: any) => {
        if (msg.reply_to_message?.message_id === sentMessage.message_id) {
          // Remove the listener
          bot.removeListener('message', replyListener);
          
          const brandId = msg.text?.trim();
          if (!brandId) {
            await bot.sendMessage(chatId, '❌ Please provide a valid Brand ID.');
            return;
          }
          
          try {
            // Show loading message and fetch brand details
            const loadingMsg = await bot.sendMessage(chatId, '🔍 Fetching brand details...');
            await fetchBrandDetails(chatId, brandId, loadingMsg.message_id);
          } catch (error) {
            console.error('Error in reply listener:', error);
            await bot.sendMessage(chatId, '❌ An error occurred while processing your request.');
          }
        }
      };
      
      // Add the listener
      bot.on('message', replyListener);
      
      // Set timeout to remove listener after 5 minutes
      setTimeout(() => {
        bot.removeListener('message', replyListener);
      }, 5 * 60 * 1000);
      
    } catch (error) {
      console.error('Error in brand command:', error);
      await bot.sendMessage(chatId, '❌ An error occurred while processing your request.');
    }
  });

  // Checkout command handler
  registerCommand('checkout', async (chatId: number) => {
    try {
      // Send a loading message
      const loadingMessage = await sendMessage(chatId, '🔄 Creating payment link...');
      
      // Create a payment
      const paymentResponse = await createPayment(chatId, 1, 'USDT');
      let payment: any = paymentResponse.data;

      if (paymentResponse.status !== 'success' || !paymentResponse.data) {
        throw new Error(paymentResponse.error || 'Failed to create payment');
      }
      
      // Edit the loading message with the payment link
      let paymentMessage = await bot.sendMessage(
        chatId,
        `💳 *Payment Request*\n\n` +
          `🔹 *Amount:* ${payment.amount} ${payment.currency}\n` +
          `🔹 *Status:* ${payment.status}\n\n` +
          `Please send ${payment.amount} ${payment.currency} to the following address:\n` +
          `\`${payment.paymentAddress}\`\n\n` +
          `*Payment ID:* \`${payment.id}\`\n` +
          `*Expires in:* 15 minutes\n\n` +
          `Click the button below when you've sent the payment.`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: '✅ I\'ve sent the payment',
                  callback_data: `confirm_payment_${payment.id}`,
                },
              ],
            ],
          },
        }
      ) as any;

      // Set up a listener for payment status checks
      const paymentListener = async (callbackQuery: any) => {
        if (!callbackQuery.data?.startsWith('payment_status:')) return;
        
        const orderId = callbackQuery.data.split(':')[1];
        const paymentStatus = await getPaymentStatus(orderId);
        
        if (!paymentStatus) {
          if (!payment) {
            await bot.answerCallbackQuery(callbackQuery.id, {
              text: 'Payment not found',
              show_alert: true
            });
            return;
          }
          
          let statusMessage = '';
          const paymentStatus = payment.status as 'completed' | 'pending' | 'expired' | 'cancelled' | 'failed';
          
          switch (paymentStatus) {
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
            case 'failed':
              statusMessage = '❌ Payment failed. Please try again.';
              break;
            default:
              statusMessage = `ℹ️ Payment status: ${paymentStatus}`;
          }
          
          await bot.answerCallbackQuery(callbackQuery.id, {
            text: statusMessage,
            show_alert: true
          });
        }
      };
      
      // Add the listener
      bot.on('callback_query', paymentListener);
      
      // Remove listener after 15 minutes
      setTimeout(() => {
        bot.removeListener('callback_query', paymentListener);
      }, 15 * 60 * 1000);
      
    } catch (error: unknown) {
      console.error('Error in checkout command:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      await sendMessage(chatId, `❌ An error occurred: ${errorMessage}`);
    }
  });

  // Set up error handling
  bot.on('polling_error', (error: Error) => {
    console.error('Polling error:', error);
  });

  console.log('🤖 Telegram bot is running...');
};

// Auto-initialize the bot when the module is imported
initializeBot();

// Export the bot instance and related functions
export { registerCommand, sendMessage, initializeBot };

export default bot;