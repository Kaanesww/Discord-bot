import { pgTable, text, integer, timestamp, primaryKey } from "drizzle-orm/pg-core";

export const economyTable = pgTable(
  "economy",
  {
    userId: text("user_id").notNull(),
    guildId: text("guild_id").notNull(),
    coins: integer("coins").notNull().default(0),
    lastDaily: timestamp("last_daily"),
    streak: integer("streak").notNull().default(0),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.guildId] }) }),
);

export type Economy = typeof economyTable.$inferSelect;
