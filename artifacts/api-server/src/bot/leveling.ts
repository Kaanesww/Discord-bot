import { db } from "@workspace/db";
import { levelsTable, levelRolesTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import type { Guild } from "discord.js";

// Seviye atlamak için gereken XP: 5 * level^2 + 50 * level + 100
export function xpForLevel(level: number): number {
  if (level <= 0) return 100;
  return 5 * level * level + 50 * level + 100;
}

// Toplam XP'den seviyeyi hesapla
export function levelFromXp(totalXp: number): number {
  let level = 0;
  let cumulative = 0;
  while (cumulative + xpForLevel(level + 1) <= totalXp) {
    cumulative += xpForLevel(level + 1);
    level++;
  }
  return level;
}

// Bir sonraki seviye için gereken XP (kalan)
export function xpToNextLevel(totalXp: number, currentLevel: number): { current: number; needed: number } {
  let cumulative = 0;
  for (let i = 1; i <= currentLevel; i++) cumulative += xpForLevel(i);
  const current = totalXp - cumulative;
  const needed = xpForLevel(currentLevel + 1);
  return { current, needed };
}

// Mesaj başına kazanılan rastgele XP (15-25)
function randomXp(): number {
  return Math.floor(Math.random() * 11) + 15;
}

// Cooldown: aynı kullanıcı 60 saniyede bir XP kazanır
const cooldowns = new Map<string, number>();

export async function getUserLevel(
  userId: string,
  guildId: string,
): Promise<{ xp: number; level: number; messageCount: number }> {
  const rows = await db
    .select()
    .from(levelsTable)
    .where(and(eq(levelsTable.userId, userId), eq(levelsTable.guildId, guildId)))
    .limit(1);
  return rows[0] ?? { xp: 0, level: 0, messageCount: 0 };
}

export async function getRank(userId: string, guildId: string): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(levelsTable)
    .where(
      and(
        eq(levelsTable.guildId, guildId),
        sql`${levelsTable.xp} > (
          SELECT xp FROM levels WHERE user_id = ${userId} AND guild_id = ${guildId}
        )`,
      ),
    );
  return (result[0]?.count ?? 0) + 1;
}

export async function getLeaderboard(
  guildId: string,
  limit = 10,
): Promise<{ userId: string; xp: number; level: number; messageCount: number }[]> {
  return db
    .select({
      userId: levelsTable.userId,
      xp: levelsTable.xp,
      level: levelsTable.level,
      messageCount: levelsTable.messageCount,
    })
    .from(levelsTable)
    .where(eq(levelsTable.guildId, guildId))
    .orderBy(desc(levelsTable.xp))
    .limit(limit);
}

// Level rol ödülleri
export async function getLevelRoles(
  guildId: string,
): Promise<{ level: number; roleId: string }[]> {
  return db
    .select({ level: levelRolesTable.level, roleId: levelRolesTable.roleId })
    .from(levelRolesTable)
    .where(eq(levelRolesTable.guildId, guildId))
    .orderBy(levelRolesTable.level);
}

export async function setLevelRole(guildId: string, level: number, roleId: string): Promise<void> {
  await db
    .insert(levelRolesTable)
    .values({ guildId, level, roleId })
    .onConflictDoUpdate({
      target: [levelRolesTable.guildId, levelRolesTable.level],
      set: { roleId },
    });
}

export async function removeLevelRole(guildId: string, level: number): Promise<boolean> {
  const result = await db
    .delete(levelRolesTable)
    .where(and(eq(levelRolesTable.guildId, guildId), eq(levelRolesTable.level, level)))
    .returning();
  return result.length > 0;
}

// Rol ödülü uygula
async function applyRoleRewards(guild: Guild, userId: string, newLevel: number): Promise<void> {
  try {
    const rewards = await getLevelRoles(guild.id);
    const member = await guild.members.fetch(userId);
    for (const reward of rewards) {
      if (reward.level <= newLevel) {
        const role = guild.roles.cache.get(reward.roleId);
        if (role && !member.roles.cache.has(reward.roleId)) {
          await member.roles.add(role);
          logger.info({ userId, roleId: reward.roleId, level: reward.level }, "Seviye rolü verildi");
        }
      }
    }
  } catch (err) {
    logger.error({ err, userId }, "Rol ödülü uygulanırken hata");
  }
}

// Mesaj atıldığında XP ver
export async function handleXp(
  userId: string,
  guildId: string,
  guild?: Guild,
): Promise<{ leveledUp: boolean; newLevel: number } | null> {
  const key = `${userId}:${guildId}`;
  const now = Date.now();
  if ((cooldowns.get(key) ?? 0) + 60_000 > now) return null;
  cooldowns.set(key, now);

  const xpGain = randomXp();
  const existing = await getUserLevel(userId, guildId);
  const newXp = existing.xp + xpGain;
  const newLevel = levelFromXp(newXp);
  const leveledUp = newLevel > existing.level;

  await db
    .insert(levelsTable)
    .values({
      userId,
      guildId,
      xp: newXp,
      level: newLevel,
      messageCount: 1,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [levelsTable.userId, levelsTable.guildId],
      set: {
        xp: newXp,
        level: newLevel,
        messageCount: sql`${levelsTable.messageCount} + 1`,
        updatedAt: new Date(),
      },
    });

  if (leveledUp && guild) {
    await applyRoleRewards(guild, userId, newLevel);
  }

  return { leveledUp, newLevel };
}
