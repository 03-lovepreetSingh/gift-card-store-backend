import { Router } from 'express';
import * as telegramController from '../controllers/telegramController';

const router = Router();

// Webhook setup routes
router.post('/webhook', telegramController.handleWebhook);
router.get('/set-webhook', telegramController.setWebhook);
router.get('/webhook-info', telegramController.getWebhookInfo);

// Send message API (for internal use)
router.post('/send-message', telegramController.sendMessageToUser);

export default router;
