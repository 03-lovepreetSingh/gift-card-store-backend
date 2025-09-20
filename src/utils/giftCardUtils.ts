// Current ETH to USD rate (you might want to fetch this from an API in production)
const ETH_TO_USD_RATE = 3500; // Example rate, 1 ETH = $3500

export interface GiftCard {
  id: string;
  brand: string;
  description: string;
  price: number; // Original price in USD
  denomination: number; // Same as price, kept for backward compatibility
  priceInEth: string; // Price in ETH (6 decimals)
  priceInUsd: string; // Formatted price in USD
  category: string;
  image?: string;
  isPopular: boolean;
  inStock: boolean;
  cryptoPrice: string; // Kept for backward compatibility
  discountPercentage?: number;
  discountedPriceInUsd?: string; // Price after discount in USD
  termsAndConditions?: string;
  usageInstructions: string[];
  availableDenominations: number[];
}

export interface ApiGiftCard {
  id: string;
  title: string;
  status: string;
  amountRestrictions?: {
    denominations: number[];
  };
  category?: string[];
  brandDescription?: string;
  tags?: string[];
  discountPercentage?: number;
  thumbnailUrl?: string;
  iconImageUrl?: string;
  termsAndConditions?: string;
  usageInstructions?: {
    ONLINE?: string[];
  };
  howToUseInstructions?: Array<{
    retailMode: string;
    instructions: string[];
  }>;
}

export function transformApiDataToGiftCards(apiData: ApiGiftCard[]): GiftCard[] {
  return apiData
    .filter(item => item.status === 'ACTIVE')
    .map((item) => {
      const denominations = item.amountRestrictions?.denominations || [];
      const defaultDenomination = denominations.length > 0 ? denominations[0] : 0;
      const categories = Array.isArray(item.category) ? item.category : [];
      const category = categories.length > 0 ? categories[0] : "General";
      const description = item.brandDescription || `${item.title} gift card - Perfect for shopping and gifting`;
      const tags = Array.isArray(item.tags) ? item.tags : [];
      const isPopular = (item.discountPercentage && item.discountPercentage > 0) || tags.includes("popular") || false;
      const inStock = item.status === "ACTIVE";
      
      // Calculate prices
      const priceInEth = (defaultDenomination / ETH_TO_USD_RATE).toFixed(6);
      const priceInUsd = defaultDenomination.toFixed(2);
      const cryptoPrice = `≈ ${priceInEth} ETH`; // For backward compatibility
      
      // Calculate discounted price if applicable
      let discountedPriceInUsd = '';
      if (item.discountPercentage && item.discountPercentage > 0) {
        const discountMultiplier = 1 - (item.discountPercentage / 100);
        const discountedPrice = defaultDenomination * discountMultiplier;
        discountedPriceInUsd = discountedPrice.toFixed(2);
      }
      
      const usageInstructions = item.usageInstructions?.ONLINE ||
        item.howToUseInstructions?.find((inst) => inst.retailMode === "ONLINE")?.instructions || [];

      return {
        id: item.id,
        brand: item.title,
        description,
        price: defaultDenomination, // Original price in USD (number)
        denomination: defaultDenomination, // Same as price, kept for backward compatibility
        priceInEth,
        priceInUsd,
        category,
        image: item.thumbnailUrl || item.iconImageUrl,
        isPopular,
        inStock,
        cryptoPrice, // Kept for backward compatibility
        discountPercentage: item.discountPercentage,
        discountedPriceInUsd,
        termsAndConditions: item.termsAndConditions,
        usageInstructions,
        availableDenominations: denominations,
      };
    });
}

export function getUniqueCategories(giftCards: GiftCard[]): string[] {
  const categories = new Set<string>();
  giftCards.forEach(card => {
    if (card.category) {
      categories.add(card.category);
    }
  });
  return ["All", ...Array.from(categories)];
}

export function getUniqueBrands(giftCards: GiftCard[]): string[] {
  const brands = new Set<string>();
  giftCards.forEach(card => {
    if (card.brand) {
      brands.add(card.brand);
    }
  });
  return ["All", ...Array.from(brands)];
}
