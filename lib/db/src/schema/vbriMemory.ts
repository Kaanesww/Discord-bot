import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const vbriMemoriesTable = sqliteTable("vbri_memories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  guildId: text("guild_id").notNull(),
  userId: text("user_id"),
  type: text("type").notNull().default("fact"), // "fact" | "preference" | "correction"
  content: text("content").notNull(),
  keywords: text("keywords").default(""),
  importance: integer("importance").default(1),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  accessCount: integer("access_count").default(0),
});

export const vbriConversationsTable = sqliteTable("vbri_conversations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  channelId: text("channel_id").notNull(),
  userId: text("user_id").notNull(),
  role: text("role").notNull(), // "user" | "bot"
  content: text("content").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export type VbriMemory = typeof vbriMemoriesTable.$inferSelect;
export type VbriConversation = typeof vbriConversationsTable.$inferSelect;
