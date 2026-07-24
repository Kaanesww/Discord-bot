import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const giveawaysTable = sqliteTable("giveaways", {
  id:           integer("id").primaryKey({ autoIncrement: true }),
  guildId:      text("guild_id").notNull(),
  channelId:    text("channel_id").notNull(),
  messageId:    text("message_id"),               // İlk mesaj gönderildikten sonra dolu
  hostId:       text("host_id").notNull(),
  prize:        text("prize").notNull(),
  participants: text("participants").notNull().default("[]"), // JSON dizi
  endsAt:       integer("ends_at", { mode: "timestamp" }).notNull(),
  active:       integer("active", { mode: "boolean" }).notNull().default(true),
  winnerId:     text("winner_id"),
  createdAt:    integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export type Giveaway = typeof giveawaysTable.$inferSelect;
