import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const tagRoleSettingsTable = pgTable("tag_role_settings", {
  guildId:   text("guild_id").primaryKey(),
  tag:       text("tag").notNull(),
  roleId:    text("role_id").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type TagRoleSettings = typeof tagRoleSettingsTable.$inferSelect;