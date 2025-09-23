import { console } from 'inspector';
import { createInvoice, getInvoiceStatus, type InvoiceData } from './plisioService';
import { v4 as uuidv4 } from 'uuid';

// In-memory store for demo purposes
// In production, use a database like MongoDB or PostgreSQL
const payments = new Map<string, PaymentData>();

export interface PaymentData {
  orderId: string;
  userId: number;
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'expired' | 'cancelled' | 'failed';
  invoiceId?: string;
  invoiceUrl?: string;
  createdAt: Date;
  updatedAt?: Date;
  metadata?: Record<string, any>;
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
    // Create payment record
    const paymentData: PaymentData = {
      orderId,
      userId,
      amount,
      currency,
      status: 'pending',
      createdAt: new Date(),
      metadata: {
        ...metadata,
        source: 'gift-card-store',
      },
    };

    // Create Plisio invoice with required fields only
    // All other fields are now handled in plisioService
    const invoice = await createInvoice({
      order_number: orderId,
       amount:amount, 
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

    // Update payment data with invoice info
    const payment: PaymentData = {
      ...paymentData,
      invoiceId: invoiceData.txn_id, // Using txn_id from response
      invoiceUrl: invoiceData.invoice_url,
      amount: parseFloat(invoiceData.invoice_total_sum) || amount, // Use the actual amount from Plisio if available
      status: 'pending',
      updatedAt: new Date(),
    };

    // Save the payment with the updated amount from Plisio
    paymentData.amount = payment.amount;

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

export const getPaymentStatus = async (orderId: string) => {
  try {
    const payment = payments.get(orderId);
    if (!payment) {
      return {
        success: false,
        error: 'Payment not found',
      };
    }

    // In a real app, you would check the status in your database
    // For demo, we'll check with Plisio if we have an invoice ID
    if (payment.invoiceId) {
      const invoice = await getInvoiceStatus(payment.invoiceId);
      if (invoice.success && invoice.data) {
        // Update payment status based on Plisio status
        payment.status = invoice.data.status as PaymentData['status'] || payment.status;
        payment.updatedAt = new Date();
        // In a real application, save to database here
      }
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
