import { pgTable, serial, text, timestamp , varchar} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

export const clientToken = pgTable("clientToken",{
    id: serial("id").primaryKey(),
    token: varchar("token",{length:256})
})
