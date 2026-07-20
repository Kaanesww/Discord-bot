import { db } from "@workspace/db";
import { guildSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const prefixCache = new Map<string, string>();
const levelEnabledCache = new Map<string, boolean>();
const DEFAULT_PREFIX = "v!";

export async function getPrefix(guildId: string): Promise<string> {
  if (prefixCache.has(guildId)) return prefixCache.get(guildId)!;

  const rows = await db
    .select({ prefix: guildSettingsTable.prefix })
    .from(guildSettingsTable)
    .where(eq(guildSettingsTable.guildId, guildId))
    .limit(1);

  const prefix = rows[0]?.prefix ?? DEFAULT_PREFIX;
  prefixCache.set(guildId, prefix);
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

  prefixCache.set(guildId, prefix);
}

export async function getLevelEnabled(guildId: string): Promise<boolean> {
  if (levelEnabledCache.has(guildId)) return levelEnabledCache.get(guildId)!;

  const rows = await db
    .select({ levelEnabled: guildSettingsTable.levelEnabled })
    .from(guildSettingsTable)
    .where(eq(guildSettingsTable.guildId, guildId))
    .limit(1);

  const enabled = rows[0]?.levelEnabled ?? true;
  levelEnabledCache.set(guildId, enabled);
  return enabled;
}

export async function setLevelEnabled(guildId: string, enabled: boolean): Promise<void> {
  await db
    .insert(guildSettingsTable)
    .values({ guildId, prefix: DEFAULT_PREFIX, levelEnabled: enabled, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: guildSettingsTable.guildId,
      set: { levelEnabled: enabled, updatedAt: new Date() },
    });

  levelEnabledCache.set(guildId, enabled);
}
