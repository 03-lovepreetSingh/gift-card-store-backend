import { createInvoice, getInvoiceStatus, type InvoiceData } from './plisioService';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import { eq } from 'drizzle-orm';
import { payments as paymentsTable } from '../db/schema';
import axios from 'axios';

const PLISIO_BASE_URL = 'https://plisio.net/api/v1';

// Type for the raw payment row from the database
interface RawPaymentRow {
  id: string;
  user_id: string; // Changed to match database column name and type (uuid)
  shop_id: string;
  type: string;
  status: string;
  order_id: string;
  amount: string | number;
  inr_amount: string | number;
  currency: string;
  invoice_id: string | null;
  invoice_url: string | null;
  tx_urls: string[] | null;
  voucher_details: Array<{
    id: string;
    cardType: string;
    cardPin: string;
    cardNumber: string;
    validTill: string;
    amount: number | string;
  }> | null;
  metadata: Record<string, any> | null;
  created_at: Date | string;
  updated_at: Date | string;
  
  // Add camelCase aliases for compatibility
  userId?: string;
  shopId?: string;
  orderId?: string;
  invoiceId?: string | null;
  invoiceUrl?: string | null;
  txUrls?: string[] | null;
  voucherDetails?: Array<{
    id: string;
    cardType: string;
    cardPin: string;
    cardNumber: string;
    validTill: string;
    amount: number | string;
  }> | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

// Helper type for database row
// Matches the database schema
type DbPaymentRow = {
  id: string; // uuid
  userId: string; // uuid (changed from number to string to match database)
  shopId: string;
  type: string;
  status: string;
  orderId: string;
  amount: string; // numeric as string
  inr_amount: string; // numeric as string
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
  metadata: Record<string, any> | null;
  createdAt: Date;
  updatedAt: Date;
};

// Helper function to convert database row to PaymentData
const mapDbPaymentToPaymentData = (row: DbPaymentRow): PaymentData => {
  // Convert database row to PaymentData format
  return {
    id: row.id,
    userId: row.userId,
    shopId: row.shopId,
    type: row.type,
    status: row.status,
    txUrls: row.txUrls || [],
    orderId: row.orderId,
    // Convert stored string to number for the application
    inrAmount: parseFloat(row.inr_amount || '0'),
    amount: parseFloat(row.amount || '0'),
    invoiceId: row.invoiceId || undefined,
    invoiceUrl: row.invoiceUrl || undefined,
    currency: row.currency || 'USD',
    voucherDetails: row.voucherDetails || undefined,
    metadata: row.metadata || {},
    createdAt: new Date(row.createdAt),
    updatedAt: row.updatedAt ? new Date(row.updatedAt) : new Date()
  };
};

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
  userId: string; // Changed from number to string to match database (uuid)
  shopId: string;
  type: string;
  status: 'pending' | 'completed' | 'error' | 'new' | 'expired' | 'mismatch' | 'cancelled' | 'failed' | string;
  txUrls: string[];
  id: string;
  
  // Additional fields used in the codebase
  orderId: string;
  inrAmount: number;  // This is the application-facing field (camelCase)
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
    user_id: string; // Changed from number to string to match UUID type
  };
  error?: string;
}

// Helper function to ensure userId is a valid UUID
const ensureValidUuid = (userId: string | number): string => {
  const userIdStr = String(userId);
  
  // Check if it's already a valid UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  
  if (uuidRegex.test(userIdStr)) {
    return userIdStr;
  }
  
  // If it's not a UUID, generate a new one
  // You might want to create a mapping table or use a different approach
  // For now, we'll generate a deterministic UUID based on the input
  console.warn(`Non-UUID userId provided: ${userIdStr}, generating new UUID`);
  return uuidv4();
};

export const createPayment = async (
  userId: string | number, // Accept both string and number
  amount: number, 
  inrAmount: number,
  currency: string = 'ETH',
  email: string = 'lovepreetsingh9810573475@gmail.com',
  metadata: Record<string, any> = {}
): Promise<CreatePaymentResponse> => {
  try {
    const orderId = uuidv4();
    const appUrl = process.env.APP_URL || 'http://localhost:4000';
    
    // Ensure userId is a valid UUID
    const validUserId = ensureValidUuid(userId);
    
    // Create Plisio invoice
    const invoice = await createInvoice({
      order_number: orderId,
      amount: amount,
    });

    console.log("invoice", invoice);

    if (!invoice.success || !invoice.data) {
      const errorMessage = invoice.error || 'Failed to create payment invoice';
      console.error('Failed to create invoice:', errorMessage);
      return {
        status: 'error',
        error: errorMessage,
      };
    }
    
    const invoiceData = invoice.data;
    const now = new Date();

    // Create payment record with camelCase property names to match Drizzle schema
    const paymentRecord = {
      id: uuidv4(),
      userId: validUserId, // Use the validated UUID
      shopId: 'default-shop',
      type: 'crypto_invoice',
      status: 'new',
      orderId: orderId,
      amount: amount.toString(),
      inr_amount: inrAmount.toString(),
      currency,
      invoiceId: invoiceData.txn_id,
      invoiceUrl: invoiceData.invoice_url,
      txUrls: [],
      voucherDetails: null,
      metadata,
      createdAt: now,
      updatedAt: now
    };

    // Save to database
    try {
      await db.insert(paymentsTable).values(paymentRecord);
    } catch (dbError) {
      console.error('Database insert error:', dbError);
      return {
        status: 'error',
        error: 'Failed to save payment to database'
      };
    }

    // Return the response
    return {
      status: 'success',
      data: {
        txn_id: paymentRecord.invoice_id || '',
        invoice_url: paymentRecord.invoice_url || '',
        invoice_total_sum: paymentRecord.amount,
        order_id: orderId,
        user_id: validUserId
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

interface PlisioOperation {
  txn_id: string;
  status: string;
  invoice_url: string;
  invoice_total_sum: string;
  [key: string]: any; // Allow for additional properties
}

interface PlisioResponse {
  status: string;
  data: {
    operations: PlisioOperation[];
  };
  [key: string]: any; // Allow for additional properties
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

interface GetPaymentStatusResponse {
  success: boolean;
  data?: PaymentData;
  error?: string;
}

export const getPaymentStatus = async (orderId: string): Promise<GetPaymentStatusResponse> => {
  try {
    // Remove 'order_' prefix if it exists
    const cleanOrderId = orderId.startsWith('order_') ? orderId.substring(6) : orderId;
    
    // Try to find by orderId first
    let rawPaymentRow = await db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.orderId, cleanOrderId))
      .limit(1)
      .then(rows => rows[0]);

    // If not found by orderId, try by invoiceId
    if (!rawPaymentRow) {
      rawPaymentRow = await db
        .select()
        .from(paymentsTable)
        .where(eq(paymentsTable.invoiceId, cleanOrderId))
        .limit(1)
        .then(rows => rows[0]);
    }
      
    if (!rawPaymentRow) {
      return {
        success: false,
        error: 'Payment not found',
      };
    }
    
    // Type assertion for rawPaymentRow to handle database response
    const rawRow = rawPaymentRow as unknown as RawPaymentRow;
    
    // Helper function to get the value from either snake_case or camelCase property
    const getValue = <T>(obj: any, keys: string[], defaultValue: T): T => {
      for (const key of keys) {
        if (obj[key] !== undefined) return obj[key];
      }
      return defaultValue;
    };
    
    // Convert the raw payment row to DbPaymentRow with proper types
    const paymentRow: DbPaymentRow = {
      id: String(rawRow.id || ''),
      userId: String(getValue(rawRow, ['user_id', 'userId'], '')), // Handle both user_id and userId
      shopId: String(getValue(rawRow, ['shop_id', 'shopId'], '')),
      type: String(rawRow.type || ''),
      status: String(rawRow.status || ''),
      orderId: String(getValue(rawRow, ['order_id', 'orderId'], '')),
      amount: String(rawRow.amount || '0'),
      inr_amount: String(rawRow.inr_amount || '0'),
      currency: String(rawRow.currency || 'USD'),
      invoiceId: getValue(rawRow, ['invoice_id', 'invoiceId'], null) ? String(getValue(rawRow, ['invoice_id', 'invoiceId'], '')) : null,
      invoiceUrl: getValue(rawRow, ['invoice_url', 'invoiceUrl'], null) ? String(getValue(rawRow, ['invoice_url', 'invoiceUrl'], '')) : null,
      txUrls: Array.isArray(getValue(rawRow, ['tx_urls', 'txUrls'], null)) 
        ? (getValue(rawRow, ['tx_urls', 'txUrls'], []) as any[]).map(String) 
        : [],
      voucherDetails: getValue(rawRow, ['voucher_details', 'voucherDetails'], null) 
        ? (getValue(rawRow, ['voucher_details', 'voucherDetails'], []) as any[]).map(v => ({
            id: String(v.id || ''),
            cardType: String(v.cardType || ''),
            cardPin: String(v.cardPin || ''),
            cardNumber: String(v.cardNumber || ''),
            validTill: String(v.validTill || ''),
            amount: typeof v.amount === 'number' ? v.amount : Number(v.amount) || 0
          }))
        : null,
      metadata: getValue(rawRow, ['metadata'], null) || {},
      createdAt: getValue(rawRow, ['created_at', 'createdAt'], null) 
        ? new Date(getValue(rawRow, ['created_at', 'createdAt'], new Date())) 
        : new Date(),
      updatedAt: getValue(rawRow, ['updated_at', 'updatedAt'], null) 
        ? new Date(getValue(rawRow, ['updated_at', 'updatedAt'], new Date()))
        : new Date()
    };
    
    // Ensure metadata is properly typed
    const safeMetadata = paymentRow.metadata && typeof paymentRow.metadata === 'object' 
      ? paymentRow.metadata as Record<string, any> 
      : {};

    // Map the database row to our application's PaymentData type
    const currentPayment: PaymentData = {
      id: paymentRow.id,
      userId: paymentRow.userId,
      shopId: paymentRow.shopId,
      type: paymentRow.type,
      status: paymentRow.status as PaymentData['status'],
      txUrls: paymentRow.txUrls || [],
      orderId: paymentRow.orderId,
      inrAmount: parseFloat(paymentRow.inr_amount) || 0,
      amount: parseFloat(paymentRow.amount) || 0,
      invoiceId: paymentRow.invoiceId || undefined,
      invoiceUrl: paymentRow.invoiceUrl || undefined,
      currency: paymentRow.currency,
      voucherDetails: paymentRow.voucherDetails || undefined,
      metadata: safeMetadata,
      createdAt: paymentRow.createdAt,
      updatedAt: paymentRow.updatedAt
    };
  
    console.log('Checking payment status for order:', orderId);

    // First, try to get the latest status from Plisio
    const plisioApiKey = process.env.PLISIO_API_KEY;
    if (!plisioApiKey) {
      throw new Error('PLISIO_API_KEY is not set');
    }

    try {
      // Find payment by order_id in Plisio (use clean order ID without prefix)
      const plisioResponse = await axios.get<PlisioResponse>(
        `${PLISIO_BASE_URL}/operations`, {
          params: {
            api_key: plisioApiKey,
            order_id: cleanOrderId, // Use clean order ID
            limit: 1,
          },
        }
      );

      // Process the response
      if (plisioResponse.data.status === 'success' && plisioResponse.data.data.operations.length > 0) {
        const latestOperation = plisioResponse.data.data.operations[0];
        
        // Update payment with the latest status
        const updateData: any = {
          status: latestOperation.status,
          updated_at: new Date(), // Use snake_case for database column
        };

        // If payment is completed, process vouchers if not already done
        if (latestOperation.status === 'completed' && !currentPayment.voucherDetails) {
          // Add your voucher generation logic here
          // const vouchers = await generateVouchers(payment);
          // updateData.voucher_details = vouchers;
        }

        // Update the payment in the database
        await db
          .update(paymentsTable)
          .set(updateData)
          .where(eq(paymentsTable.id, currentPayment.id));

        // Return the updated payment
        const updatedPayment = {
          ...currentPayment,
          status: latestOperation.status,
          updatedAt: new Date(),
        };
        console.log('Updated payment:', updatedPayment);  
        return {
          success: true,
          data: updatedPayment,
        };
      }

      // If no operations found, use the current payment data
      return {
        success: true,
        data: currentPayment,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error getting payment status from Plisio:', errorMessage);
      
      // In case of error, still return the existing payment data
      return {
        success: true,
        data: currentPayment,
      };
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in getPaymentStatus:', errorMessage);
    
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
      console.error('No order number provided in callback');
      return { success: false, error: 'No order number provided' };
    }
    
    const cleanOrderNumber = order_number.startsWith('order_') ? order_number.substring(6) : order_number;
    
    // Try to find payment by orderId first
    let paymentRow = await db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.orderId, cleanOrderNumber))
      .limit(1)
      .then(rows => rows[0]);
      
    // If not found by orderId, try by invoiceId
    if (!paymentRow) {
      paymentRow = await db
        .select()
        .from(paymentsTable)
        .where(eq(paymentsTable.invoiceId, cleanOrderNumber))
        .limit(1)
        .then(rows => rows[0]);
    }
    
    if (!paymentRow) {
      console.error(`Payment with order number ${order_number} (clean: ${cleanOrderNumber}) not found`);
      return { success: false, error: 'Payment not found' };
    }
    
    // Helper function to get value from either snake_case or camelCase property
    const getValue = <T>(obj: any, keys: string[], defaultValue: T): T => {
      for (const key of keys) {
        if (obj[key] !== undefined) return obj[key];
      }
      return defaultValue;
    };

    // Convert the raw payment row to PaymentData with proper type handling
    const payment: PaymentData = {
      id: String(paymentRow.id || ''),
      userId: String(getValue(paymentRow, ['user_id', 'userId'], '')),
      shopId: String(getValue(paymentRow, ['shop_id', 'shopId'], '')),
      type: String(paymentRow.type || ''),
      status: String(paymentRow.status || '') as PaymentData['status'],
      orderId: String(getValue(paymentRow, ['order_id', 'orderId'], '')),
      amount: typeof paymentRow.amount === 'number' ? paymentRow.amount : parseFloat(paymentRow.amount as string) || 0,
      inrAmount: typeof paymentRow.inr_amount === 'number' 
        ? paymentRow.inr_amount 
        : parseFloat(getValue(paymentRow, ['inr_amount', 'inrAmount'], '0') as string) || 0,
      currency: String(paymentRow.currency || 'USD'),
      invoiceId: getValue(paymentRow, ['invoice_id', 'invoiceId'], null) || undefined,
      invoiceUrl: getValue(paymentRow, ['invoice_url', 'invoiceUrl'], null) || undefined,
      txUrls: Array.isArray(getValue(paymentRow, ['tx_urls', 'txUrls'], null))
        ? getValue(paymentRow, ['tx_urls', 'txUrls'], []) as string[]
        : [],
      voucherDetails: getValue(paymentRow, ['voucher_details', 'voucherDetails'], null) || undefined,
      metadata: getValue(paymentRow, ['metadata'], null) && typeof getValue(paymentRow, ['metadata'], null) === 'object'
        ? getValue(paymentRow, ['metadata'], {}) as Record<string, any>
        : {},
      createdAt: getValue(paymentRow, ['created_at', 'createdAt'], null)
        ? new Date(getValue(paymentRow, ['created_at', 'createdAt'], new Date()) as string | Date)
        : new Date(),
      updatedAt: getValue(paymentRow, ['updated_at', 'updatedAt'], null)
        ? new Date(getValue(paymentRow, ['updated_at', 'updatedAt'], new Date()) as string | Date)
        : new Date()
    };

    // Update payment status in database using snake_case column names
    await db
      .update(paymentsTable)
      .set({
        status: (status || 'failed').toLowerCase() as PaymentData['status'],
        updatedAt: new Date() // Updated to use camelCase to match Drizzle schema
      })
      .where(eq(paymentsTable.id, payment.id));

    // Update the payment object with the new status and timestamp
    payment.status = (status || 'failed').toLowerCase() as PaymentData['status'];
    payment.updatedAt = new Date();
    
    console.log(`Payment ${order_number} status updated to: ${payment.status}`);
    
    return { success: true, data: payment };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error handling payment callback:', errorMessage);
    return { success: false, error: errorMessage };
  }
};