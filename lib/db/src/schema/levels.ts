import { pgTable, text, integer, timestamp, primaryKey } from "drizzle-orm/pg-core";

export const levelsTable = pgTable(
  "levels",
  {
    userId: text("user_id").notNull(),
    guildId: text("guild_id").notNull(),
    xp: integer("xp").notNull().default(0),
    level: integer("level").notNull().default(0),
    messageCount: integer("message_count").notNull().default(0),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.guildId] })],
);

export type Level = typeof levelsTable.$inferSelect;
