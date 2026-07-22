import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/**
 * Bot sahibinin "kod yazma" kanalını saklar.
 * id=1 tek satırlık singleton tablo.
 */
export const codeChannelTable = sqliteTable("code_channel", {
  id:        integer("id").primaryKey().default(1),
  channelId: text("channel_id"),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export type CodeChannel = typeof codeChannelTable.$inferSelect;
