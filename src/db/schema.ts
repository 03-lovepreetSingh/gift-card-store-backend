import { pgTable, uuid, text, timestamp, varchar, integer, jsonb, numeric } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export const clientToken = pgTable("clientToken", {
  id: integer("id").primaryKey(),
  token: varchar("token", { length: 256 })
});

// Orders table
export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  partnerOrderId: varchar("partner_order_id").notNull(),
  referenceId: varchar("reference_id").notNull(),
  status: varchar("status").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  rawResponse: jsonb("raw_response").notNull(),
});

// Vouchers table
export const vouchers = pgTable("vouchers", {
  id: uuid("id").primaryKey().defaultRandom(),
  partnerVoucherId: varchar("partner_voucher_id").notNull(),
  orderId:varchar("order_id").notNull(),
  cardType: varchar("card_type").notNull(),
  cardPin: varchar("card_pin"),
  cardNumber: varchar("card_number"),
  validTill: varchar("valid_till"),
  amount: varchar("amount"),
  rawResponse: jsonb("raw_response").notNull(),
});

// Payments table - Fixed inconsistencies
export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(), // Changed from varchar to uuid
  userId: varchar("user_id"),
  shopId: varchar("shop_id").notNull(),
  type: varchar("type").notNull(),
  status: varchar("status").notNull(),
  orderId: varchar("order_id").notNull().unique(),
  amount: numeric("amount", { precision: 18, scale: 8 }).notNull(),
  inr_amount: numeric("inr_amount", { precision: 18, scale: 8 }).notNull(),
  currency: varchar("currency").default('USD').notNull(),
  invoiceId: varchar("invoice_id"),
  invoiceUrl: text("invoice_url"),
  txUrls: jsonb("tx_urls").$type<string[]>(),
  voucherDetails: jsonb("voucher_details").$type<Array<{
    id: string;
    cardType: string;
    cardPin: string;
    cardNumber: string;
    validTill: string;
    amount: number;
  }>>(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});