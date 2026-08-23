import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** Uzak moderasyon yetkili kullanıcılar */
export const remoteModAuthorizedTable = pgTable("remote_mod_authorized", {
  userId:    text("user_id").primaryKey(),
  addedBy:   text("added_by").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type RemoteModAuthorized = typeof remoteModAuthorizedTable.$inferSelect;
