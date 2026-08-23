import { pgTable, text, integer, boolean, timestamp, serial } from "drizzle-orm/pg-core";

export const giveawaysTable = pgTable("giveaways", {
  id:           serial("id").primaryKey(),
  guildId:      text("guild_id").notNull(),
  channelId:    text("channel_id").notNull(),
  messageId:    text("message_id"),
  hostId:       text("host_id").notNull(),
  prize:        text("prize").notNull(),
  participants: text("participants").notNull().default("[]"),
  endsAt:       timestamp("ends_at").notNull(),
  active:       boolean("active").notNull().default(true),
  winnerId:     text("winner_id"),
  createdAt:    timestamp("created_at").notNull().defaultNow(),
});

export type Giveaway = typeof giveawaysTable.$inferSelect;
