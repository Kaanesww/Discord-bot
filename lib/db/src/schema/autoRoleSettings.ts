import { pgTable, text, integer, boolean, timestamp, primaryKey } from "drizzle-orm/pg-core";

export const autoRoleSettingsTable = pgTable(
  "auto_role_settings",
  {
    guildId:           text("guild_id").notNull(),
    roleId:            text("role_id").notNull(),
    /** "all" | "human" | "bot" */
    target:            text("target").notNull().default("all"),
    /** Hesap en az kaç günlük olmalı (0 = sınır yok) */
    minAccountAgeDays: integer("min_account_age_days").notNull().default(0),
    enabled:           boolean("enabled").notNull().default(true),
    createdAt:         timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.guildId, t.roleId] })],
);

export type AutoRoleSetting = typeof autoRoleSettingsTable.$inferSelect;
