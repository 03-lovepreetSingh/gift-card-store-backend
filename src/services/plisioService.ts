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

interface CreateInvoiceParams {
  order_number: string;
  order_name: string;
  amount: number;
  currency: string;
  source_currency: string;
  source_rate: number;
  callback_url: string;
  success_url: string;
  cancel_url: string;
  email: string;
  [key: string]: any;
}

export const createInvoice = async (params: Partial<CreateInvoiceParams>) => {
  try {
    const response = await axios.get<PlisioResponse<InvoiceData>>(
      `${PLISIO_BASE_URL}/invoices/new`,
      {
        params: {
          api_key: PLISIO_API_KEY,
          ...params,
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
        error: response.data.message || 'Failed to create invoice',
      };
    }
  } catch (error: any) {
    console.error('Error creating Plisio invoice:', error);
    return {
      success: false,
      error: error.response?.data?.message || 'Failed to create invoice',
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
