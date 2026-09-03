import { pgTable, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const serverProtectionSettingsTable = pgTable("server_protection_settings", {
  guildId:          text("guild_id").primaryKey(),
  enabled:          boolean("enabled").notNull().default(false),
  locked:           boolean("locked").notNull().default(false),
  joinEnabled:      boolean("join_enabled").notNull().default(true),
  leaveEnabled:     boolean("leave_enabled").notNull().default(true),
  channelEnabled:   boolean("channel_enabled").notNull().default(false),
  roleEnabled:      boolean("role_enabled").notNull().default(false),
  joinThreshold:    integer("join_threshold").notNull().default(5),
  leaveThreshold:   integer("leave_threshold").notNull().default(5),
  changeThreshold:  integer("change_threshold").notNull().default(4),
  windowSeconds:    integer("window_seconds").notNull().default(60),
  infoChannelId:    text("info_channel_id"),
  lockReason:       text("lock_reason"),
  channelSnapshot:  text("channel_snapshot"),
  roleSnapshot:     text("role_snapshot"),
  memberSnapshot:   text("member_snapshot"),
  lockedAt:         timestamp("locked_at"),
  updatedAt:        timestamp("updated_at").notNull().defaultNow(),
});

export type ServerProtectionSettings = typeof serverProtectionSettingsTable.$inferSelect;