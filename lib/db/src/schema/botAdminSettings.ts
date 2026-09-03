import { pgTable, integer, boolean, text, timestamp } from "drizzle-orm/pg-core";

/** Bot genelinde tam yetkili kullanıcılar için singleton ayar. */
export const botAdminSettingsTable = pgTable("bot_admin_settings", {
  id:        integer("id").primaryKey().default(1),
  enabled:   boolean("enabled").notNull().default(false),
  adminIds:  text("admin_ids").notNull().default("[]"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type BotAdminSettings = typeof botAdminSettingsTable.$inferSelect;