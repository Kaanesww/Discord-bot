import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";

export const levelsTable = sqliteTable(
  "levels",
  {
    userId:       text("user_id").notNull(),
    guildId:      text("guild_id").notNull(),
    xp:           integer("xp").notNull().default(0),
    level:        integer("level").notNull().default(0),
    messageCount: integer("message_count").notNull().default(0),
    updatedAt:    integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [primaryKey({ columns: [table.userId, table.guildId] })],
);

export type Level = typeof levelsTable.$inferSelect;
