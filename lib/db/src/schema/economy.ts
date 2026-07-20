import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const economyTable = sqliteTable("economy", {
  userId:        text("user_id").primaryKey(),
  coins:         integer("coins").notNull().default(0),
  lastDaily:     integer("last_daily", { mode: "timestamp" }),
  streak:        integer("streak").notNull().default(0),
  luck:          integer("luck").notNull().default(0),
  luckExpiresAt: integer("luck_expires_at", { mode: "timestamp" }),
  prayUsedAt:    integer("pray_used_at", { mode: "timestamp" }),
  econXp:        integer("econ_xp").notNull().default(0),
  econLevel:     integer("econ_level").notNull().default(0),
});

export type Economy = typeof economyTable.$inferSelect;
