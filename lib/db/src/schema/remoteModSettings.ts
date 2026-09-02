import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** Uzak moderasyon log kanalı ayarları (sunucu başına bir kayıt) */
export const remoteModSettingsTable = pgTable("remote_mod_settings", {
  guildId:    text("guild_id").primaryKey(),
  logChannelId: text("log_channel_id").notNull(),
  updatedAt:  timestamp("updated_at").notNull().defaultNow(),
});

export type RemoteModSettings = typeof remoteModSettingsTable.$inferSelect;
