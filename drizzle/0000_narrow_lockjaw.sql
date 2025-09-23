CREATE TABLE "clientToken" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" varchar(256)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_order_id" varchar NOT NULL,
	"reference_id" varchar NOT NULL,
	"status" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"raw_response" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"shop_id" varchar NOT NULL,
	"type" varchar NOT NULL,
	"status" varchar NOT NULL,
	"order_id" varchar NOT NULL,
	"amount" numeric(18, 8) NOT NULL,
	"inr_amount" numeric(18, 8) NOT NULL,
	"currency" varchar DEFAULT 'USD' NOT NULL,
	"invoice_id" varchar,
	"invoice_url" text,
	"tx_urls" jsonb,
	"voucher_details" jsonb,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payments_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vouchers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_voucher_id" varchar NOT NULL,
	"order_id" uuid NOT NULL,
	"card_type" varchar NOT NULL,
	"card_pin" varchar,
	"card_number" varchar,
	"valid_till" varchar,
	"amount" varchar,
	"raw_response" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;