import { db } from "@workspace/db";
import { remoteModSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/** Log kanalı ayarını getir */
export async function getRemoteModChannel(guildId: string): Promise<string | null> {
  const row = await db
    .select()
    .from(remoteModSettingsTable)
    .where(eq(remoteModSettingsTable.guildId, guildId))
    .limit(1);
  return row[0]?.logChannelId ?? null;
}

/** Log kanalı ayarla */
export async function setRemoteModChannel(guildId: string, channelId: string): Promise<void> {
  await db
    .insert(remoteModSettingsTable)
    .values({ guildId, logChannelId: channelId, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: remoteModSettingsTable.guildId,
      set: { logChannelId: channelId, updatedAt: new Date() },
    });
}

/** Log kanalı ayarını sil */
export async function removeRemoteModChannel(guildId: string): Promise<void> {
  await db
    .delete(remoteModSettingsTable)
    .where(eq(remoteModSettingsTable.guildId, guildId));
}
