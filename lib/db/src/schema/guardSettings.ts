import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const guardSettingsTable = sqliteTable("guard_settings", {
  guildId:         text("guild_id").primaryKey(),
  // Spam koruma
  spamEnabled:     integer("spam_enabled",  { mode: "boolean" }).notNull().default(false),
  spamThreshold:   integer("spam_threshold").notNull().default(5),   // mesaj/5sn
  spamAction:      text("spam_action").notNull().default("delete"),  // delete|warn|mute|kick
  // Link koruma
  linkEnabled:     integer("link_enabled",  { mode: "boolean" }).notNull().default(false),
  linkAction:      text("link_action").notNull().default("delete"),  // delete|warn|kick
  linkWhitelist:   text("link_whitelist").notNull().default("[]"),   // JSON string[]
  // Bot koruma
  botEnabled:      integer("bot_enabled",   { mode: "boolean" }).notNull().default(false),
  botAction:       text("bot_action").notNull().default("kick"),     // kick|ban
  // Emoji koruma
  emojiEnabled:    integer("emoji_enabled", { mode: "boolean" }).notNull().default(false),
  emojiMax:        integer("emoji_max").notNull().default(5),
  emojiAction:     text("emoji_action").notNull().default("delete"), // delete|warn
  // Rol koruma (mass role update)
  roleEnabled:     integer("role_enabled",  { mode: "boolean" }).notNull().default(false),
  // Kanal koruma (mass channel create/delete)
  channelEnabled:  integer("channel_enabled", { mode: "boolean" }).notNull().default(false),
  // Log kanalı
  logChannelId:    text("log_channel_id"),
});

export type GuardSettings = typeof guardSettingsTable.$inferSelect;
