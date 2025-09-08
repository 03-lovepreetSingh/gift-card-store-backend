import { pgTable, serial, text, timestamp , varchar,integer,jsonb} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export const clientToken = pgTable("clientToken",{
    id: serial("id").primaryKey(),
    token: varchar("token",{length:256})
})
// Orders table
export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  partnerOrderId: varchar("partner_order_id").notNull(), // from API response
  referenceId: varchar("reference_id").notNull(), // idempotency key
  status: varchar("status").notNull(), // SUCCESS, PROCESSING, etc.
  createdAt: timestamp("created_at").defaultNow(),
  rawResponse: jsonb("raw_response").notNull(), // store entire API response
});

// Vouchers table
export const vouchers = pgTable("vouchers", {
  id: serial("id").primaryKey(),
  partnerVoucherId: varchar("partner_voucher_id").notNull(),
  orderId: integer("order_id").notNull().references(() => orders.id),
  cardType: varchar("card_type").notNull(),
  cardPin: varchar("card_pin"),
  cardNumber: varchar("card_number"),
  validTill: varchar("valid_till"),
  amount: varchar("amount"),
  rawResponse: jsonb("raw_response").notNull(),
});