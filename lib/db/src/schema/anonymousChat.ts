import { pgTable, text, timestamp, boolean, serial, uniqueIndex, integer } from "drizzle-orm/pg-core";

export const anonymousChatTable = pgTable("anonymous_chat", {
  guildId: text("guild_id").primaryKey(),
  channelId: text("channel_id").notNull(),
  approvalChannelId: text("approval_channel_id"),
  categoryId: text("category_id"),
  generalWebhookId: text("general_webhook_id"),
  generalWebhookToken: text("general_webhook_token"),
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
  anonymousNumber: integer("anonymous_number"),
  /** Kullanıcının seçtiği, diğer tüm anonim hesaplarda benzersiz görünen kimlik. */
  anonymousId: text("anonymous_id"),
  points: integer("points").notNull().default(0),
  avatarUrl: text("avatar_url"),
  privateChannelId: text("private_channel_id"),
  privateWebhookId: text("private_webhook_id"),
  privateWebhookToken: text("private_webhook_token"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  guildUserUnique: uniqueIndex("anonymous_accounts_guild_user_unique").on(table.guildId, table.userId),
  guildNumberUnique: uniqueIndex("anonymous_accounts_guild_number_unique").on(table.guildId, table.anonymousNumber),
  anonymousIdUnique: uniqueIndex("anonymous_accounts_anonymous_id_unique").on(table.anonymousId),
}));

export const anonymousIdRequestsTable = pgTable("anonymous_id_requests", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  userId: text("user_id").notNull(),
  requestedId: text("requested_id").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const anonymousMessagesTable = pgTable("anonymous_messages", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  senderAccountId: text("sender_account_id").notNull(),
  sourceMessageId: text("source_message_id").notNull().unique(),
  generalMessageId: text("general_message_id").notNull(),
  recipientMessageIds: text("recipient_message_ids").notNull().default("{}"),
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

export const anonymousSessionsTable = pgTable("anonymous_sessions", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id"),
  userAId: text("user_a_id").notNull(),
  userAAccountId: text("user_a_account_id").notNull(),
  userBId: text("user_b_id").notNull(),
  userBAccountId: text("user_b_account_id").notNull(),
  channelAId: text("channel_a_id"),
  channelBId: text("channel_b_id"),
  relayChannelId: text("relay_channel_id"),
  active: boolean("active").notNull().default(true),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const anonymousConversationRequestsTable = pgTable("anonymous_conversation_requests", {
  id: text("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  requesterId: text("requester_id").notNull(),
  requesterAccountId: text("requester_account_id").notNull(),
  targetId: text("target_id").notNull(),
  targetAccountId: text("target_account_id").notNull(),
  requesterChannelId: text("requester_channel_id").notNull(),
  approvalChannelId: text("approval_channel_id"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type AnonymousChat = typeof anonymousChatTable.$inferSelect;
export type AnonymousAccount = typeof anonymousAccountsTable.$inferSelect;
export type AnonymousIdRequest = typeof anonymousIdRequestsTable.$inferSelect;
export type AnonymousMessage = typeof anonymousMessagesTable.$inferSelect;
export type AnonymousPending = typeof anonymousPendingTable.$inferSelect;
export type AnonymousBlock = typeof anonymousBlocksTable.$inferSelect;
export type AnonymousSession = typeof anonymousSessionsTable.$inferSelect;
export type AnonymousConversationRequest = typeof anonymousConversationRequestsTable.$inferSelect;