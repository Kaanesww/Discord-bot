import { db } from "@workspace/db";
import { levelsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { logger } from "../lib/logger";

// Seviye atlamak için gereken XP: 100 * level^2
function xpForLevel(level: number): number {
  return 100 * level * level;
}

// Mesaj başına kazanılan rastgele XP (15-25)
function randomXp(): number {
  return Math.floor(Math.random() * 11) + 15;
}

// Cooldown: aynı kullanıcı 60 saniye içinde tekrar XP kazanamaz
const cooldowns = new Map<string, number>();

export async function getUserLevel(
  userId: string,
  guildId: string,
): Promise<{ xp: number; level: number }> {
  const rows = await db
    .select()
    .from(levelsTable)
    .where(and(eq(levelsTable.userId, userId), eq(levelsTable.guildId, guildId)))
    .limit(1);

  return rows[0] ?? { xp: 0, level: 0 };
}

export async function getLeaderboard(
  guildId: string,
  limit = 10,
): Promise<{ userId: string; xp: number; level: number }[]> {
  return db
    .select({ userId: levelsTable.userId, xp: levelsTable.xp, level: levelsTable.level })
    .from(levelsTable)
    .where(eq(levelsTable.guildId, guildId))
    .orderBy(desc(levelsTable.xp))
    .limit(limit);
}

// Mesaj atıldığında çağrılır; seviye atlama olursa yeni seviyeyi döner
export async function handleXp(
  userId: string,
  guildId: string,
): Promise<{ leveledUp: boolean; newLevel: number } | null> {
  const key = `${userId}:${guildId}`;
  const now = Date.now();
  const last = cooldowns.get(key) ?? 0;

  if (now - last < 60_000) return null; // cooldown
  cooldowns.set(key, now);

  const xpGain = randomXp();

  const existing = await getUserLevel(userId, guildId);
  const newXp = existing.xp + xpGain;
  let newLevel = existing.level;

  // Seviye atla
  while (newXp >= xpForLevel(newLevel + 1)) {
    newLevel++;
  }

  const leveledUp = newLevel > existing.level;

  await db
    .insert(levelsTable)
    .values({ userId, guildId, xp: newXp, level: newLevel, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [levelsTable.userId, levelsTable.guildId],
      set: { xp: newXp, level: newLevel, updatedAt: new Date() },
    });

  if (leveledUp) {
    logger.info({ userId, guildId, newLevel }, "Kullanıcı seviye atladı");
  }

  return { leveledUp, newLevel };
}
