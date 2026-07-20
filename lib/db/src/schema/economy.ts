import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";

export const economyTable = pgTable("economy", {
  userId:        text("user_id").primaryKey(),
  coins:         integer("coins").notNull().default(0),
  lastDaily:     timestamp("last_daily"),
  streak:        integer("streak").notNull().default(0),
  luck:          integer("luck").notNull().default(0),
  luckExpiresAt: timestamp("luck_expires_at"),
  prayUsedAt:    timestamp("pray_used_at"),
  econXp:        integer("econ_xp").notNull().default(0),
  econLevel:     integer("econ_level").notNull().default(0),
});

export type Economy = typeof economyTable.$inferSelect;
