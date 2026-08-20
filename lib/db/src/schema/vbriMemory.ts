import { pgTable, text, integer, timestamp, serial } from "drizzle-orm/pg-core";

export const vbriMemoriesTable = pgTable("vbri_memories", {
  id:          serial("id").primaryKey(),
  guildId:     text("guild_id").notNull(),
  userId:      text("user_id"),
  type:        text("type").notNull().default("fact"),
  content:     text("content").notNull(),
  keywords:    text("keywords").default(""),
  importance:  integer("importance").default(1),
  createdAt:   timestamp("created_at").defaultNow(),
  accessCount: integer("access_count").default(0),
});

export const vbriConversationsTable = pgTable("vbri_conversations", {
  id:        serial("id").primaryKey(),
  channelId: text("channel_id").notNull(),
  userId:    text("user_id").notNull(),
  role:      text("role").notNull(),
  content:   text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type VbriMemory = typeof vbriMemoriesTable.$inferSelect;
export type VbriConversation = typeof vbriConversationsTable.$inferSelect;
