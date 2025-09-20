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

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

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
      
      // Log the raw API response for debugging
      console.log('Raw API Response:', JSON.stringify(response?.data, null, 2));
      
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
      
      // Log the processed gift cards for debugging
      console.log('Processed Gift Cards:', JSON.stringify(giftCards, null, 2));
      
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

  // Brand command handler
  registerCommand('brand', async (chatId, match) => {
    if (!match || !match[1]) {
      return bot.sendMessage(chatId, 'Please provide a brand ID. Example: /brand 123');
    }
    const brandId = match[1].trim();
    const req = {
      params: { productId: brandId },
      query: {},
      body: {},
      headers: {},
      // Add other required Request properties as needed
    } as unknown as Request;
    const res = mockResponse(chatId);
    await getBrandById(req, res as Response);
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
