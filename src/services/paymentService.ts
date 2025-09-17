import { createInvoice, getInvoiceStatus, type InvoiceData } from './plisioService';
import { v4 as uuidv4 } from 'uuid';

// In-memory store for demo purposes
// In production, use a database
const payments = new Map<string, any>();

export const createPayment = async (userId: number, amount: number, currency: string = 'USDT') => {
  const orderId = `order_${uuidv4()}`;
  const amountInCrypto = amount; // 1 USDT
  
  // In a real app, you would save this to a database
  const paymentData = {
    orderId,
    userId,
    amount,
    currency,
    status: 'pending',
    createdAt: new Date(),
  };

  // Create Plisio invoice
  const invoice = await createInvoice({
    order_number: orderId,
    order_name: `Gift Card Purchase - ${orderId}`,
    amount: amountInCrypto,
    currency: 'USDT',
    source_currency: 'USD',
    source_rate: 1, // 1 USDT = 1 USD
    callback_url: `${process.env.APP_URL || 'http://localhost:4000'}/api/payments/callback`,
    success_url: `${process.env.APP_URL || 'http://localhost:4000'}/payment/success?orderId=${orderId}`,
    cancel_url: `${process.env.APP_URL || 'http://localhost:4000'}/payment/cancel?orderId=${orderId}`,
    email: `user-${userId}@giftcardstore.com`,
  });

  if (!invoice.success || !invoice.data) {
    throw new Error(invoice.error || 'Failed to create payment');
  }
  
  const invoiceData = invoice.data;

  // Save payment data with invoice info
  const payment = {
    ...paymentData,
    invoiceId: invoiceData.id,
    invoiceUrl: invoiceData.invoice_url,
    status: 'pending', // Ensure status is set
    orderId,           // Ensure orderId is included
    userId,            // Ensure userId is included
    amount,            // Ensure amount is included
    currency,          // Ensure currency is included
  };

  payments.set(orderId, payment);
  return payment;
};

export const getPaymentStatus = async (orderId: string) => {
  const payment = payments.get(orderId);
  if (!payment) {
    return null;
  }

  // In a real app, you would check the status in your database
  // For demo, we'll check with Plisio
  const invoice = await getInvoiceStatus(payment.invoiceId);
  
  if (invoice.success) {
    // Update payment status
    payment.status = invoice?.data?.status;
    payments.set(orderId, payment);
  }

  return payment;
};

export const handlePaymentCallback = async (data: any) => {
  // Verify the callback data
  const { order_number, status } = data;
  
  // In a real app, you would:
  // 1. Verify the callback signature
  // 2. Update the payment status in your database
  // 3. Fulfill the order if payment is successful
  
  console.log(`Payment callback for order ${order_number}: ${status}`);
  
  return { success: true };
};
