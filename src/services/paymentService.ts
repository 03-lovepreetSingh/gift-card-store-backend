import { console } from 'inspector';
import { createInvoice, getInvoiceStatus, type InvoiceData } from './plisioService';
import { v4 as uuidv4 } from 'uuid';

// In-memory store for demo purposes
// In production, use a database like MongoDB or PostgreSQL
const payments = new Map<string, PaymentData>();

export interface VoucherDetail {
  id: string;
  cardType: string;
  cardPin: string;
  cardNumber: string;
  validTill: string;
  amount: number;
}

export interface PaymentData {
  orderId: string;
  userId: number;
  amount: number;
  status: 'pending' | 'completed' | 'expired' | 'cancelled' | 'failed' | string;
  invoiceId?: string;
  invoiceUrl?: string;
  currency: string;
  createdAt: Date;
  updatedAt?: Date;
  metadata?: Record<string, any>;
  voucherDetails?: VoucherDetail[];
}

export interface CreatePaymentResponse {
  status: 'success' | 'error';
  data?: {
    txn_id: string;
    invoice_url: string;
    invoice_total_sum: string;
    order_id: string;
    user_id: number;
  };
  error?: string;
}

export const createPayment = async (
  userId: number, 
  amount: number, 
  currency: string = 'ETH',
  email: string = 'lovepreetsingh9810573475@gmail.com',
  metadata: Record<string, any> = {}
): Promise<CreatePaymentResponse> => {
  try {
    const orderId = `order_${uuidv4()}`;
    const appUrl = process.env.APP_URL || 'http://localhost:4000';
console.log(amount);
    // Create Plisio invoice with required fields only
    // All other fields are now handled in plisioService
    const invoice = await createInvoice({
      order_number: orderId,
      amount: amount,
      // All other fields are now hardcoded in plisioService
    });

    if (!invoice.success || !invoice.data) {
      const errorMessage = invoice.error || 'Failed to create payment invoice';
      console.error('Failed to create invoice:', errorMessage);
      return {
        status: 'error',
        error: errorMessage,
      };
    }
    
    const invoiceData = invoice.data;

    // Create payment record with invoice info
    const payment: PaymentData = {
      orderId: orderId,
      userId: userId,
      amount: parseFloat(invoiceData.invoice_total_sum) || amount,
      status: 'pending',
      invoiceId: invoiceData.txn_id,
      invoiceUrl: invoiceData.invoice_url,
      currency: currency,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        ...metadata,
        source: 'gift-card-store',
      },
    };

    // Save payment to in-memory store (replace with database in production)
    payments.set(orderId, payment);
    
    // Return the response in the format matching Plisio's response
    return {
      status: 'success',
      data: {
        txn_id: payment.invoiceId || '',
        invoice_url: payment.invoiceUrl || '',
        invoice_total_sum: payment.amount.toString(),
        order_id: orderId,
        user_id: userId
      }
    };
  } catch (error: any) {
    console.error('Error creating payment:', error);
    return {
      status: 'error',
      error: error.message || 'Failed to create payment',
    };
  }
};

import axios from 'axios';

interface PlisioOperation {
  txn_id: string;
  status: string;
  invoice_url: string;
  invoice_total_sum: string;
  // Add other fields as needed
}

interface PlisioResponse {
  status: string;
  data: {
    operations: PlisioOperation[];
  };
}

const getPaymentStatusFromPlisio = async (txnId: string): Promise<{ success: boolean; status?: string; error?: string }> => {
  try {
    const apiKey = process.env.PLISIO_API_KEY;
    if (!apiKey) {
      throw new Error('PLISIO_API_KEY is not set in environment variables');
    }

    const response = await axios.get<PlisioResponse>(
      'https://api.plisio.net/api/v1/operations',
      {
        params: {
          api_key: apiKey,
        },
      }
    );

    if (response.data.status !== 'success') {
      throw new Error('Failed to fetch operations from Plisio');
    }

    const operation = response.data.data.operations.find(
      (op: PlisioOperation) => op.txn_id === txnId
    );

    if (!operation) {
      return {
        success: false,
        error: 'Transaction not found in Plisio',
      };
    }

    return {
      success: true,
      status: operation.status,
    };
  } catch (error: any) {
    console.error('Error fetching payment status from Plisio:', error);
    return {
      success: false,
      error: error.message || 'Failed to fetch payment status',
    };
  }
};

export const getPaymentStatus = async (orderId: string) => {
  try {
    const payment = payments.get(orderId);
    if (!payment) {
      return {
        success: false,
        error: 'Payment not found in local store',
      };
    }

    console.log('Checking payment status for order:', orderId);
    
    // Check with Plisio API
    const plisioStatus = await getPaymentStatusFromPlisio(orderId);
    
    if (!plisioStatus.success) {
      console.warn('Failed to get status from Plisio, using local status');
      return {
        success: true,
        data: payment,
      };
    }

    // Update local payment status if it's different
    if (plisioStatus.status && payment.status !== plisioStatus.status) {
      payment.status = plisioStatus.status as PaymentData['status'];
      payment.updatedAt = new Date();
      // In a real application, save to database here
    }
    
    return {
      success: true,
      data: payment,
    };
  } catch (error: any) {
    console.error('Error getting payment status:', error);
    return {
      success: false,
      error: error.message || 'Failed to get payment status',
    };
  }
};

export const handlePaymentCallback = async (data: any) => {
  try {
    // Verify the callback data
    const { order_number, status } = data;
    
    if (!order_number) {
      console.error('Invalid callback data: missing order_number');
      return { success: false, error: 'Invalid callback data' };
    }
    
    // In a real app, you would:
    // 1. Verify the callback signature
    // 2. Update the payment status in your database
    const payment = payments.get(order_number);
    if (!payment) {
      console.error(`Payment not found for order: ${order_number}`);
      return { success: false, error: 'Payment not found' };
    }
    
    // Update payment status based on Plisio status
    payment.status = (status || 'failed').toLowerCase() as PaymentData['status'];
    payment.updatedAt = new Date();
    
    // In a real application, save to database here
    console.log(`Payment ${order_number} status updated to: ${payment.status}`);
    
    return { success: true, data: payment };
  } catch (error: any) {
    console.error('Error handling payment callback:', error);
    return { success: false, error: error.message || 'Failed to process callback' };
  }
};
