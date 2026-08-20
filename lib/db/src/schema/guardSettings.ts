import { pgTable, text, integer, boolean } from "drizzle-orm/pg-core";

export const guardSettingsTable = pgTable("guard_settings", {
  guildId:         text("guild_id").primaryKey(),
  spamEnabled:     boolean("spam_enabled").notNull().default(false),
  spamThreshold:   integer("spam_threshold").notNull().default(5),
  spamAction:      text("spam_action").notNull().default("delete"),
  linkEnabled:     boolean("link_enabled").notNull().default(false),
  linkAction:      text("link_action").notNull().default("delete"),
  linkWhitelist:   text("link_whitelist").notNull().default("[]"),
  botEnabled:      boolean("bot_enabled").notNull().default(false),
  botAction:       text("bot_action").notNull().default("kick"),
  emojiEnabled:    boolean("emoji_enabled").notNull().default(false),
  emojiMax:        integer("emoji_max").notNull().default(5),
  emojiAction:     text("emoji_action").notNull().default("delete"),
  roleEnabled:     boolean("role_enabled").notNull().default(false),
  channelEnabled:  boolean("channel_enabled").notNull().default(false),
  logChannelId:    text("log_channel_id"),
});

export type GuardSettings = typeof guardSettingsTable.$inferSelect;
