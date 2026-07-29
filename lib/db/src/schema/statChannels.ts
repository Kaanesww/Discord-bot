import { pgTable, text } from "drizzle-orm/pg-core";

export const statChannelsTable = pgTable("stat_channels", {
  guildId:            text("guild_id").primaryKey(),
  categoryId:         text("category_id"),
  totalChannelId:     text("total_channel_id"),
  onlineChannelId:    text("online_channel_id"),
  botsChannelId:      text("bots_channel_id"),
  chCountChannelId:   text("ch_count_channel_id"),
  roleCountChannelId: text("role_count_channel_id"),
});

export type StatChannels = typeof statChannelsTable.$inferSelect;
