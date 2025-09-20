import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import { createPayment, getPaymentStatus } from './paymentService';
import { getBrands, getBrandById } from '../controllers/brandControllers';
import { Request, Response } from 'express';

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
      console.log('Fetching brands...');
      const res = mockResponse(chatId);
      const brands = await getBrands({ 
        query: {},
        params: {},
        body: {},
        headers: {}
      } as unknown as Request, res as Response);
      console.log('Brands response:', brands);
    } catch (error) {
      console.error('Error in brands command:', error);
      bot.sendMessage(chatId, '❌ Failed to fetch brands. Please try again later.');
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
