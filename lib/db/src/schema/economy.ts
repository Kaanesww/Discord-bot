import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";

export const economyTable = pgTable("economy", {
  userId:    text("user_id").primaryKey(),
  coins:     integer("coins").notNull().default(0),
  lastDaily: timestamp("last_daily"),
  streak:    integer("streak").notNull().default(0),
});

export type Economy = typeof economyTable.$inferSelect;
