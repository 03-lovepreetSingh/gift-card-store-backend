import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const PLISIO_API_KEY = process.env.PLISIO_API_KEY;
const PLISIO_BASE_URL = 'https://plisio.net/api/v1';

if (!PLISIO_API_KEY) {
  throw new Error('PLISIO_API_KEY is not defined in environment variables');
}

interface PlisioResponse<T> {
  status: string;
  data?: T;
  message?: string;
}

export interface InvoiceData {
  id: string;
  invoice_url: string;
  status: string;
  [key: string]: any;
}

export interface CreateInvoiceParams {
  // Required parameters
  order_number: string;  // Your order reference ID
  order_name?: string;   // Order name shown to customer
  currency: string;      // Currency to receive (e.g., 'BTC', 'ETH', 'USDT')
  amount: number;        // Amount in the specified currency
  
  // Optional parameters
  source_currency?: string;  // Fiat currency (e.g., 'USD', 'EUR')
  source_rate?: number;      // Exchange rate if source_currency is different
  
  // URL callbacks
  callback_url?: string;     // Server-side notification URL
  success_url?: string;      // Redirect after successful payment
  cancel_url?: string;       // Redirect if user cancels
  
  // Customer information
  email?: string;            // Customer email
  phone?: string;            // Customer phone number
  
  // Payment settings
  timeout?: number;          // Invoice expiration in minutes (default: 1440)
  allow_anonymous?: boolean; // Allow anonymous payments (default: true)
  language?: string;         // UI language (e.g., 'en', 'es', 'ru')
  
  // Additional data
  description?: string;      // Order description
  order_items?: Array<{
    name: string;
    description?: string;
    price: number;
    qty: number;
    subtotal: number;
    sku?: string;
  }>;
  
  // Custom fields
  name?: string;            // Customer name
  api_key?: string;         // Will be added automatically
  
  // Advanced options
  plisio_fee_to_user?: boolean; // Charge Plisio fee to customer (default: false)
  fee_rate?: number;           // Custom fee percentage (0-100)
  
  [key: string]: any; // For any additional parameters
}

export const createInvoice = async (params: CreateInvoiceParams) => {
  try {
    // Validate required parameters
    if (!params.order_number || !params.currency || !params.amount) {
      throw new Error('Missing required parameters: order_number, currency, and amount are required');
    }

    // Prepare request parameters
    const requestParams: Record<string, any> = {
      api_key: PLISIO_API_KEY,
      ...params,
    };

    // Remove any undefined values
    Object.keys(requestParams).forEach(key => 
      requestParams[key] === undefined && delete requestParams[key]
    );

    // Make the API request
    const response = await axios.get<PlisioResponse<InvoiceData>>(
      `${PLISIO_BASE_URL}/invoices/new`,
      { params: requestParams }
    );

    if (response.data.status !== 'success') {
      throw new Error(response.data.message || 'Failed to create invoice');
    }

    return {
      success: true,
      data: response.data.data,
    };
  } catch (error: any) {
    console.error('Error creating Plisio invoice:', error);
    const errorMessage = error.response?.data?.message || 
                        error.response?.data?.data?.message || 
                        error.message || 
                        'Failed to create invoice';
    
    return {
      success: false,
      error: errorMessage,
    };
  }
};

export const getInvoiceStatus = async (invoiceId: string) => {
  try {
    const response = await axios.get<PlisioResponse<InvoiceData>>(
      `${PLISIO_BASE_URL}/invoices/${invoiceId}`,
      {
        params: {
          api_key: PLISIO_API_KEY,
        },
      }
    );

    if (response.data.status === 'success' && response.data.data) {
      return {
        success: true as const,
        data: response.data.data,
      };
    } else {
      return {
        success: false as const,
        error: response.data.message || 'Failed to get invoice status',
      };
    }
  } catch (error: any) {
    console.error('Error getting invoice status:', error);
    return {
      success: false,
      error: error.response?.data?.message || 'Failed to get invoice status',
    };
  }
};
