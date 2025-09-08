export interface Voucher {
  id: string;
  cardType: "PIN_SECURED" | "CARD_NO_AND_PIN";
  cardPin?: string;
  cardNumber?: string;
  validTill: string;
  amount: string;
}

export type OrderStatus = "SUCCESS" | "FAILED" | "PROCESSING" | "REVERSED";

export interface OrderResponse {
  id: string; // partner order ID
  referenceId: string; // idempotency key
  status: OrderStatus;
  vouchers: Voucher[];
}
