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

export const createPayment = async (
  userId: number, 
  amount: number, 
  currency: string = 'USDT',
  email?: string,
  metadata: Record<string, any> = {}
): Promise<{ success: boolean; data?: PaymentData; error?: string }> => {
  try {
    const orderId = `order_${uuidv4()}`;
    const appUrl = process.env.APP_URL || 'http://localhost:4000';
    
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

    // Create Plisio invoice
    const invoice = await createInvoice({
      order_number: orderId,
      order_name: `Gift Card Purchase - ${orderId}`,
      amount: amount,
      currency: currency,
      source_currency: 'USD',
      source_rate: 1, // 1 USDT = 1 USD (adjust as needed)
      callback_url: `${appUrl}/api/payments/callback`,
      success_url: `${appUrl}/payment/success?orderId=${orderId}`,
      cancel_url: `${appUrl}/payment/cancel?orderId=${orderId}`,
      email: email || `user-${userId}@giftcardstore.com`,
      description: `Gift Card Purchase - $${amount} ${currency}`,
      timeout: 1440, // 24 hours
      allow_anonymous: false, // Require email for all payments
      language: 'en',
      plisio_fee_to_user: false, // We'll cover the fees
      metadata: {
        userId,
        orderId,
        type: 'gift-card-purchase',
      },
    });

    if (!invoice.success || !invoice.data) {
      console.error('Failed to create invoice:', invoice.error);
      return {
        success: false,
        error: invoice.error || 'Failed to create payment invoice',
      };
    }
    
    const invoiceData = invoice.data;

    // Update payment data with invoice info
    const payment: PaymentData = {
      ...paymentData,
      invoiceId: invoiceData.id,
      invoiceUrl: invoiceData.invoice_url,
      status: 'pending',
      updatedAt: new Date(),
    };

    payments.set(orderId, payment);
    return {
      success: true,
      data: payment,
    };
  } catch (error: any) {
    console.error('Error creating payment:', error);
    return {
      success: false,
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
