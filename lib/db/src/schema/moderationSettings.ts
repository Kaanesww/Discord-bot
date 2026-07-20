import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// Sunucu başına moderasyon yapılandırması.
// Roller JSON dizisi olarak saklanır: '["roleId1","roleId2"]'
// Boş dizi = Discord native permission kontrolü yapılır.
export const moderationSettingsTable = sqliteTable("moderation_settings", {
  guildId:       text("guild_id").primaryKey(),
  enabled:       integer("enabled", { mode: "boolean" }).notNull().default(false),
  logChannelId:  text("log_channel_id"),       // mod işlem logu kanalı
  banRoles:      text("ban_roles").notNull().default("[]"),
  kickRoles:     text("kick_roles").notNull().default("[]"),
  warnRoles:     text("warn_roles").notNull().default("[]"),
  timeoutRoles:  text("timeout_roles").notNull().default("[]"),
  muteRoles:     text("mute_roles").notNull().default("[]"),   // kilitle / ac
  temizleRoles:  text("temizle_roles").notNull().default("[]"), // temizle / nuke
  updatedAt:     integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export type ModerationSettings = typeof moderationSettingsTable.$inferSelect;
