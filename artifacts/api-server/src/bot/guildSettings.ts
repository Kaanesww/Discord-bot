import { db } from "@workspace/db";
import { guildSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const cache = new Map<string, string>();
const DEFAULT_PREFIX = "!";

export async function getPrefix(guildId: string): Promise<string> {
  if (cache.has(guildId)) return cache.get(guildId)!;

  const rows = await db
    .select({ prefix: guildSettingsTable.prefix })
    .from(guildSettingsTable)
    .where(eq(guildSettingsTable.guildId, guildId))
    .limit(1);

  const prefix = rows[0]?.prefix ?? DEFAULT_PREFIX;
  cache.set(guildId, prefix);
  return prefix;
}

export async function setPrefix(guildId: string, prefix: string): Promise<void> {
  await db
    .insert(guildSettingsTable)
    .values({ guildId, prefix, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: guildSettingsTable.guildId,
      set: { prefix, updatedAt: new Date() },
    });

  cache.set(guildId, prefix);
}
