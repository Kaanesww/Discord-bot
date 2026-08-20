import { pgTable, text, integer, boolean, timestamp, serial } from "drizzle-orm/pg-core";

export const moderationLogsTable = pgTable("moderation_logs", {
  id:          serial("id").primaryKey(),
  guildId:     text("guild_id").notNull(),
  userId:      text("user_id").notNull(),
  moderatorId: text("moderator_id").notNull(),
  action:      text("action").notNull(),
  reason:      text("reason"),
  duration:    integer("duration"),
  active:      boolean("active").notNull().default(true),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
});

export type ModerationLog = typeof moderationLogsTable.$inferSelect;
