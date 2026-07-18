import { pgTable, text, integer, boolean, timestamp, serial } from "drizzle-orm/pg-core";

export const moderationLogsTable = pgTable("moderation_logs", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  userId: text("user_id").notNull(),
  moderatorId: text("moderator_id").notNull(),
  action: text("action").notNull(), // warn | kick | ban | unban | timeout | untimeout
  reason: text("reason"),
  duration: integer("duration"), // dakika (timeout için)
  active: boolean("active").notNull().default(true), // uyarılar için
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ModerationLog = typeof moderationLogsTable.$inferSelect;
