import { db } from "@workspace/db";
import { remoteModAuthorizedTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/** Yetkili kullanıcı ekle */
export async function addRemoteModAuth(userId: string, addedBy: string): Promise<void> {
  await db
    .insert(remoteModAuthorizedTable)
    .values({ userId, addedBy, createdAt: new Date() })
    .onConflictDoNothing();
}

/** Yetkili kullanıcı kaldır */
export async function removeRemoteModAuth(userId: string): Promise<boolean> {
  const result = await db
    .delete(remoteModAuthorizedTable)
    .where(eq(remoteModAuthorizedTable.userId, userId))
    .returning();
  return result.length > 0;
}

/** Kullanıcı yetkili mi? */
export async function isRemoteModAuthorized(userId: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(remoteModAuthorizedTable)
    .where(eq(remoteModAuthorizedTable.userId, userId))
    .limit(1);
  return rows.length > 0;
}

/** Tüm yetkili kullanıcıları getir */
export async function listRemoteModAuth(): Promise<{ userId: string; addedBy: string; createdAt: Date }[]> {
  return db.select().from(remoteModAuthorizedTable);
}
