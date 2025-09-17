import { Request, Response } from 'express';
import { createPayment, getPaymentStatus, handlePaymentCallback } from '../services/paymentService';

export const createPaymentHandler = async (req: Request, res: Response) => {
  try {
    const { userId, amount = 1, currency = 'USDT' } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required',
      });
    }

    const payment = await createPayment(userId, amount, currency);
    
    res.status(201).json({
      success: true,
      data: payment,
    });
  } catch (error: any) {
    console.error('Error creating payment:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create payment',
    });
  }
};

export const paymentCallbackHandler = async (req: Request, res: Response) => {
  try {
    await handlePaymentCallback(req.body);
    res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('Error handling payment callback:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to process payment callback',
    });
  }
};

export const getPaymentStatusHandler = async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    
    if (!orderId) {
      return res.status(400).json({
        success: false,
        error: 'Order ID is required',
      });
    }

    const payment = await getPaymentStatus(orderId);
    
    if (!payment) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found',
      });
    }

    res.status(200).json({
      success: true,
      data: payment,
    });
  } catch (error: any) {
    console.error('Error getting payment status:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get payment status',
    });
  }
};
