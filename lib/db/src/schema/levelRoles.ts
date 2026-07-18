import { pgTable, text, integer, primaryKey } from "drizzle-orm/pg-core";

export const levelRolesTable = pgTable(
  "level_roles",
  {
    guildId: text("guild_id").notNull(),
    level: integer("level").notNull(),
    roleId: text("role_id").notNull(),
  },
  (table) => [primaryKey({ columns: [table.guildId, table.level] })],
);

export type LevelRole = typeof levelRolesTable.$inferSelect;
