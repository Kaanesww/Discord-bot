import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const guildSettingsTable = pgTable("guild_settings", {
  guildId: text("guild_id").primaryKey(),
  prefix: text("prefix").notNull().default("v!"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type GuildSettings = typeof guildSettingsTable.$inferSelect;
