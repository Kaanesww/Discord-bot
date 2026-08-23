import { pgTable, text, timestamp, boolean, serial, uniqueIndex } from "drizzle-orm/pg-core";

export const anonymousChatTable = pgTable("anonymous_chat", {
  guildId: text("guild_id").primaryKey(),
  channelId: text("channel_id").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const anonymousAccountsTable = pgTable("anonymous_accounts", {
  id: text("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  userId: text("user_id").notNull(),
  displayName: text("display_name").notNull(),
  webhookId: text("webhook_id").notNull(),
  webhookToken: text("webhook_token").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const anonymousPendingTable = pgTable("anonymous_pending", {
  id: text("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  channelId: text("channel_id").notNull(),
  userId: text("user_id").notNull(),
  content: text("content").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const anonymousBlocksTable = pgTable("anonymous_blocks", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  blockedAccountId: text("blocked_account_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  uniqueBlock: uniqueIndex("anonymous_blocks_user_account_unique")
    .on(table.userId, table.blockedAccountId),
}));

export type AnonymousChat = typeof anonymousChatTable.$inferSelect;
export type AnonymousAccount = typeof anonymousAccountsTable.$inferSelect;
export type AnonymousPending = typeof anonymousPendingTable.$inferSelect;
export type AnonymousBlock = typeof anonymousBlocksTable.$inferSelect;