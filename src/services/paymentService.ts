import { createInvoice, getInvoiceStatus, type InvoiceData } from './plisioService';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import { eq } from 'drizzle-orm';
import { payments as paymentsTable } from '../db/schema';
import type { InferInsertModel } from 'drizzle-orm';

// Helper type for database row
interface DbPaymentRow {
  id: string;
  userId: number;
  shopId: string;
  type: string;
  status: string;
  orderId: string;
  amount: string;
  currency: string;
  invoiceId: string | null;
  invoiceUrl: string | null;
  txUrls: string[] | null;
  voucherDetails: Array<{
    id: string;
    cardType: string;
    cardPin: string;
    cardNumber: string;
    validTill: string;
    amount: number;
  }> | null;
  metadata: any;
  createdAt: Date;
  updatedAt: Date | null;
}

// Helper function to convert database row to PaymentData
const mapDbPaymentToPaymentData = (row: DbPaymentRow): PaymentData => ({
  id: row.id,
  userId: row.userId,
  shopId: row.shopId,
  type: row.type,
  status: row.status,
  txUrls: row.txUrls || [],
  orderId: row.orderId,
  amount: parseFloat(row.amount),
  invoiceId: row.invoiceId || undefined,
  invoiceUrl: row.invoiceUrl || undefined,
  currency: row.currency || 'USD',
  voucherDetails: row.voucherDetails || undefined,
  metadata: row.metadata || {},
  createdAt: new Date(row.createdAt),
  updatedAt: row.updatedAt ? new Date(row.updatedAt) : new Date()
});

export interface VoucherDetail {
  id: string;
  cardType: string;
  cardPin: string;
  cardNumber: string;
  validTill: string;
  amount: number;
}

export interface PaymentData {
  // From operations data
  userId: number;
  shopId: string;
  type: string;
  status: 'pending' | 'completed' | 'error' | 'new' | 'expired' | 'mismatch' | 'cancelled' | 'failed' | string;
  txUrls: string[];
  id: string;
  
  // Additional fields used in the codebase
  orderId: string;
  amount: number;
  invoiceId?: string;
  invoiceUrl?: string;
  currency?: string;
  voucherDetails?: VoucherDetail[];
  createdAt?: Date;
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
      // Required fields from operations data
      id: orderId, // Using orderId as id since it's unique
      shopId: 'gift-card-shop', // Default shop ID
      type: 'invoice', // Default type
      txUrls: [], // Initialize empty array for transaction URLs
      
      // Existing fields
      orderId: orderId,
      userId: userId,
      amount: parseFloat(invoiceData.invoice_total_sum) || amount,
      status: 'pending',
      invoiceId: invoiceData.txn_id,
      invoiceUrl: invoiceData.invoice_url,
      currency: currency || 'USD', // Default currency
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        ...metadata,
        source: 'gift-card-store',
      },
    };

    // Save payment to database
    await db.insert(paymentsTable).values({
      id: payment.id,
      userId: payment.userId,
      shopId: payment.shopId,
      type: payment.type,
      status: payment.status,
      orderId: payment.orderId,
      amount: payment.amount.toString(),
      currency: payment.currency || 'USD',
      invoiceId: payment.invoiceId || null,
      invoiceUrl: payment.invoiceUrl || null,
      txUrls: payment.txUrls || null,
      voucherDetails: payment.voucherDetails || null,
      metadata: payment.metadata || null,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt || new Date()
    });
    
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
    // Get payment from database
    const [paymentRow] = await db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.orderId, orderId))
      .limit(1);
    
    if (!paymentRow) {
      return {
        success: false,
        error: 'Payment not found',
      };
    }
    
    const payment = mapDbPaymentToPaymentData(paymentRow);

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

    // Create updated payment object
    const updatedPayment: PaymentData = {
      ...payment,
      status: plisioStatus.status as PaymentData['status'],
      updatedAt: new Date(),
    };

    // Update payment status in database if it's different
    if (payment.status !== updatedPayment.status) {
      const updateData: any = {
        status: updatedPayment.status,
        updatedAt: new Date(),
      };
      
      // If payment is completed, process vouchers if not already done
      if (updatedPayment.status === 'completed' && !updatedPayment.voucherDetails) {
        // Add your voucher generation logic here
        // const vouchers = await generateVouchers(updatedPayment);
        // updateData.voucherDetails = vouchers;
        // updatedPayment.voucherDetails = vouchers;
      }
      
      await db
        .update(paymentsTable)
        .set(updateData)
        .where(eq(paymentsTable.id, updatedPayment.id));
    }
    
    return {
      success: true,
      data: updatedPayment,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error getting payment status:', errorMessage);
    return {
      success: false,
      error: errorMessage,
    };
  }
};

interface PaymentCallbackData {
  order_number: string;
  status: string;
  [key: string]: any;
}

export const handlePaymentCallback = async (data: PaymentCallbackData) => {
  try {
    // Verify the callback data
    const { order_number, status } = data;
    
    if (!order_number) {
      console.error('Invalid callback data: missing order_number');
      return { success: false, error: 'Invalid callback data' };
    }
    
    // Find the payment in our database
    const [paymentRow] = await db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.orderId, order_number))
      .limit(1);
    
    if (!paymentRow) {
      console.error('Payment not found for order:', order_number);
      return { success: false, error: 'Payment not found' };
    }
    
    const payment = mapDbPaymentToPaymentData(paymentRow);

    // Update payment status in database
    await db
      .update(paymentsTable)
      .set({
        status: (status || 'failed').toLowerCase() as PaymentData['status'],
        updatedAt: new Date()
      })
      .where(eq(paymentsTable.id, payment.id));

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
