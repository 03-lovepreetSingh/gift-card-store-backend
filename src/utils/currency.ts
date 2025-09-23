interface ExchangeRates {
  [key: string]: number;
}

// Cache for exchange rates
let exchangeRates: ExchangeRates = {
  'USD': 83.5, // 1 USD = 83.5 INR (example rate, replace with actual)
  'INR': 1
};

/**
 * Convert amount from one currency to another
 * @param amount - Amount to convert
 * @param from - Source currency (e.g., 'INR')
 * @param to - Target currency (e.g., 'USD')
 * @returns Converted amount
 */
export const convertCurrency = async (amount: number, from: string, to: string): Promise<number> => {
  try {
    // If same currency, return the amount as is
    if (from === to) return amount;
    
    // Convert both currencies to uppercase for consistency
    from = from.toUpperCase();
    to = to.toUpperCase();
    
    // Try to get rates from cache first
    if (exchangeRates[from] && exchangeRates[to]) {
      const inrAmount = from === 'INR' ? amount : amount * exchangeRates[from];
      return to === 'INR' ? inrAmount : inrAmount / exchangeRates[to];
    }
    
    // If not in cache, try to fetch from API (you'll need to sign up for an API key)
    // const response = await axios.get(`https://v6.exchangerate-api.com/v6/YOUR_API_KEY/latest/${from}`);
    // exchangeRates = response.data.conversion_rates;
    // return amount * (exchangeRates[to] || 1);
    
    // Fallback to hardcoded rate if API is not available
    if (from === 'INR' && to === 'USD') {
      return amount / exchangeRates['USD'];
    } else if (from === 'USD' && to === 'INR') {
      return amount * exchangeRates['USD'];
    }
    
    // Default fallback (1:1)
    return amount;
    
  } catch (error) {
    console.error('Error converting currency:', error);
    // Fallback to a default conversion rate
    if (from === 'INR' && to === 'USD') {
      return amount / 83.5;
    }
    return amount;
  }
};
