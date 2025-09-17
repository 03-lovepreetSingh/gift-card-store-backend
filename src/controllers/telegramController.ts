import { Request, Response } from 'express';
import { bot } from '../services/telegramBot';

export const setWebhook = async (req: Request, res: Response) => {
  try {
    const webhookUrl = `${process.env.APP_URL}/api/telegram/webhook`;
    await bot.setWebHook(webhookUrl);
    res.status(200).json({ success: true, message: 'Webhook set successfully' });
  } catch (error) {
    console.error('Error setting webhook:', error);
    res.status(500).json({ success: false, message: 'Failed to set webhook' });
  }
};

export const getWebhookInfo = async (req: Request, res: Response) => {
  try {
    const webhookInfo = await bot.getWebHookInfo();
    res.status(200).json({ success: true, data: webhookInfo });
  } catch (error) {
    console.error('Error getting webhook info:', error);
    res.status(500).json({ success: false, message: 'Failed to get webhook info' });
  }
};

export const handleWebhook = (req: Request, res: Response) => {
  // The actual webhook handling is done by the bot instance
  // This is just a placeholder to acknowledge the webhook
  bot.processUpdate(req.body);
  res.status(200).send('OK');
};

export const sendMessageToUser = async (req: Request, res: Response) => {
  try {
    const { chatId, message } = req.body;
    
    if (!chatId || !message) {
      return res.status(400).json({ 
        success: false, 
        message: 'chatId and message are required' 
      });
    }

    await bot.sendMessage(chatId, message);
    res.status(200).json({ success: true, message: 'Message sent successfully' });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ success: false, message: 'Failed to send message' });
  }
};
