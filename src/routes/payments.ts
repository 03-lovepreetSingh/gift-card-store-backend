import { Router } from 'express';
import * as paymentController from '../controllers/paymentController';

const router = Router();

// Create a new payment
router.post('/', paymentController.createPaymentHandler);

// Handle Plisio webhook callback
router.post('/callback', paymentController.paymentCallbackHandler);

// Get payment status
router.get('/status/:orderId', paymentController.getPaymentStatusHandler);

export default router;
