import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const moderationSettingsTable = pgTable("moderation_settings", {
  guildId:           text("guild_id").primaryKey(),
  enabled:           boolean("enabled").notNull().default(false),
  logChannelId:      text("log_channel_id"),
  banRoles:          text("ban_roles").notNull().default("[]"),
  kickRoles:         text("kick_roles").notNull().default("[]"),
  warnRoles:         text("warn_roles").notNull().default("[]"),
  timeoutRoles:      text("timeout_roles").notNull().default("[]"),
  muteRoles:         text("mute_roles").notNull().default("[]"),
  temizleRoles:      text("temizle_roles").notNull().default("[]"),
  modRoles:          text("mod_roles").notNull().default("[]"),
  seniorModRoles:    text("senior_mod_roles").notNull().default("[]"),
  approvalChannelId: text("approval_channel_id"),
  updatedAt:         timestamp("updated_at").notNull().defaultNow(),
});

export type ModerationSettings = typeof moderationSettingsTable.$inferSelect;
