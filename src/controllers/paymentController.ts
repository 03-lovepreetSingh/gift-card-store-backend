import { Request, Response } from 'express';
import { createPayment, getPaymentStatus, handlePaymentCallback, type PaymentData } from '../services/paymentService';

export const createPaymentHandler = async (req: Request, res: Response) => {
  try {
    const { userId, amount = 1, currency = 'USDT', email, metadata } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required',
      });
    }

    const paymentResult = await createPayment(
      userId, 
      Number(amount), 
      currency,
      email,
      metadata
    );
    
    if (!paymentResult.success) {
      return res.status(400).json({
        success: false,
        error: paymentResult.error || 'Failed to create payment',
      });
    }
    
    res.status(201).json({
      success: true,
      data: paymentResult.data,
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
    const result = await handlePaymentCallback(req.body);
    
    if (!result.success) {
      console.error('Payment callback failed:', result.error);
      return res.status(400).json({
        success: false,
        error: result.error || 'Failed to process payment callback',
      });
    }
    
    res.status(200).json({
      success: true,
      data: result.data,
    });
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

    const result = await getPaymentStatus(orderId);
    
    if (!result.success) {
      return res.status(404).json({
        success: false,
        error: result.error || 'Payment not found',
      });
    }

    res.status(200).json({
      success: true,
      data: result.data,
    });
  } catch (error: any) {
    console.error('Error getting payment status:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get payment status',
    });
  }
};
