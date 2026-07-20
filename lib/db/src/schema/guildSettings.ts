import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const guildSettingsTable = sqliteTable("guild_settings", {
  guildId:   text("guild_id").primaryKey(),
  prefix:    text("prefix").notNull().default("v!"),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export type GuildSettings = typeof guildSettingsTable.$inferSelect;
