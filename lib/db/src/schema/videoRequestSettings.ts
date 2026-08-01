import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const videoRequestSettingsTable = pgTable("video_request_settings", {
  guildId:              text("guild_id").primaryKey(),
  moderationChannelId:  text("moderation_channel_id"),
  updatedAt:            timestamp("updated_at").notNull().defaultNow(),
});

export type VideoRequestSettings = typeof videoRequestSettingsTable.$inferSelect;
