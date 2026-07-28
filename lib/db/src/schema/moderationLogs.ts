import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const moderationLogsTable = sqliteTable("moderation_logs", {
  id:          integer("id").primaryKey({ autoIncrement: true }),
  guildId:     text("guild_id").notNull(),
  userId:      text("user_id").notNull(),
  moderatorId: text("moderator_id").notNull(),
  action:      text("action").notNull(), // warn | kick | ban | unban | timeout | untimeout
  reason:      text("reason"),
  duration:    integer("duration"),      // dakika (timeout için)
  active:      integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt:   integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export type ModerationLog = typeof moderationLogsTable.$inferSelect;
