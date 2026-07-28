import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const statChannelsTable = sqliteTable("stat_channels", {
  guildId:          text("guild_id").primaryKey(),
  categoryId:       text("category_id"),
  totalChannelId:   text("total_channel_id"),   // toplam üye
  onlineChannelId:  text("online_channel_id"),  // çevrimiçi üye
  botsChannelId:    text("bots_channel_id"),    // bot sayısı
  chCountChannelId: text("ch_count_channel_id"),// kanal sayısı
  roleCountChannelId: text("role_count_channel_id"), // rol sayısı
});

export type StatChannels = typeof statChannelsTable.$inferSelect;
