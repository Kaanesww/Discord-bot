import { db } from "@workspace/db";
import { economyTable } from "@workspace/db";
import { eq, gt, desc, sql } from "drizzle-orm";

const PRAY_COOLDOWN_MS = 4 * 60 * 1000;  // 4 dakika
const LUCK_DURATION_MS  = 2 * 60 * 1000; // 2 dakika

/** Kullanıcının global bakiyesini döndürür. */
export async function getBalance(userId: string) {
  const rows = await db.select().from(economyTable).where(eq(economyTable.userId, userId)).limit(1);
  return rows[0] ?? { coins: 0, lastDaily: null, streak: 0, luck: 0, luckExpiresAt: null, prayUsedAt: null };
}

export async function setCoins(userId: string, coins: number): Promise<number> {
  const safe = Math.max(0, Math.round(coins));
  await db
    .insert(economyTable)
    .values({ userId, coins: safe, lastDaily: null, streak: 0 })
    .onConflictDoUpdate({ target: economyTable.userId, set: { coins: safe } });
  return safe;
}

export async function addCoins(userId: string, amount: number): Promise<number> {
  const bal = await getBalance(userId);
  return setCoins(userId, bal.coins + amount);
}

export async function takeCoins(userId: string, amount: number): Promise<number> {
  const bal = await getBalance(userId);
  return setCoins(userId, bal.coins - amount);
}

export interface DailyResult {
  reward: number;
  streak: number;
  alreadyClaimed: boolean;
  remainingMs?: number;   // alreadyClaimed=true olduğunda ms cinsinden kalan süre
  lootbox: boolean;
  lootboxAmount: number;
}

export async function claimDaily(userId: string): Promise<DailyResult> {
  const bal = await getBalance(userId);
  const now = new Date();
  const last = bal.lastDaily;

  if (last) {
    const elapsed = now.getTime() - last.getTime();
    const cooldown = 20 * 60 * 60 * 1000; // 20 saat
    if (elapsed < cooldown) {
      return { reward: 0, streak: bal.streak, alreadyClaimed: true, remainingMs: cooldown - elapsed, lootbox: false, lootboxAmount: 0 };
    }
  }

  const wasYesterday = last && (now.getTime() - last.getTime()) < 1000 * 60 * 60 * 36;
  const newStreak = wasYesterday ? bal.streak + 1 : 1;
  const base = 500;
  const bonus = Math.min(newStreak - 1, 30) * 50;
  const reward = base + bonus;

  // Lootbox: belirli seri günlerinde veya %8 şansla
  const LOOTBOX_MILESTONES = new Set([7, 14, 21, 30, 60, 100]);
  const lootbox = LOOTBOX_MILESTONES.has(newStreak) || Math.random() < 0.08;
  const lootboxAmount = lootbox ? Math.floor(Math.random() * 800) + 200 : 0; // 200-999

  const totalCoins = bal.coins + reward + lootboxAmount;

  await db
    .insert(economyTable)
    .values({ userId, coins: totalCoins, lastDaily: now, streak: newStreak })
    .onConflictDoUpdate({
      target: economyTable.userId,
      set: { coins: totalCoins, lastDaily: now, streak: newStreak },
    });

  return { reward, streak: newStreak, alreadyClaimed: false, lootbox, lootboxAmount };
}

/**
 * Kullanıcının aktif şans değerini döndürür.
 * Süresi dolduysa 0 döner.
 */
export async function getLuck(userId: string): Promise<number> {
  const rows = await db.select().from(economyTable).where(eq(economyTable.userId, userId)).limit(1);
  const row = rows[0];
  if (!row || !row.luckExpiresAt) return 0;
  if (row.luckExpiresAt <= new Date()) return 0;
  return row.luck ?? 0;
}

/**
 * Kalan şans süresi (ms). Şans yoksa 0.
 */
export async function getLuckRemaining(userId: string): Promise<number> {
  const rows = await db.select().from(economyTable).where(eq(economyTable.userId, userId)).limit(1);
  const row = rows[0];
  if (!row || !row.luckExpiresAt) return 0;
  const rem = row.luckExpiresAt.getTime() - Date.now();
  return Math.max(0, rem);
}

/**
 * pray komutunu kullanır.
 * Başarılıysa { ok: true } döner.
 * Bekleme süresi varsa { ok: false, remainSec } döner.
 */
export async function activatePray(userId: string): Promise<{ ok: boolean; remainSec?: number }> {
  const row = (await db.select().from(economyTable).where(eq(economyTable.userId, userId)).limit(1))[0];
  const now = new Date();

  if (row?.prayUsedAt) {
    const elapsed = now.getTime() - row.prayUsedAt.getTime();
    if (elapsed < PRAY_COOLDOWN_MS) {
      return { ok: false, remainSec: Math.ceil((PRAY_COOLDOWN_MS - elapsed) / 1000) };
    }
  }

  const luckExpiresAt = new Date(now.getTime() + LUCK_DURATION_MS);

  await db
    .insert(economyTable)
    .values({
      userId,
      coins: row?.coins ?? 0,
      lastDaily: row?.lastDaily ?? null,
      streak: row?.streak ?? 0,
      luck: 25,
      luckExpiresAt,
      prayUsedAt: now,
    })
    .onConflictDoUpdate({
      target: economyTable.userId,
      set: { luck: 25, luckExpiresAt, prayUsedAt: now },
    });

  return { ok: true };
}

/**
 * Şans varken kullanılacak zar atma.
 * luck > 0 → hafif bias kazanma yönünde.
 * Dönen değer: luck=0 → Math.random(), luck=25 → ~%10 kazanma avantajı.
 */
export function luckRoll(luck: number): number {
  if (luck === 0) return Math.random();
  const r1 = Math.random();
  const r2 = Math.random();
  return Math.max(r1, r2);
}

// ── Ekonomi Seviye Sistemi ─────────────────────────────────────────────────────

/** Seviye N'den N+1'e geçmek için gereken XP */
export function xpForNextLevel(level: number): number {
  return (level + 1) * 250;
}

/** Belirli bir seviyeye ulaşmak için gereken toplam XP */
export function xpAtLevel(level: number): number {
  let total = 0;
  for (let i = 0; i < level; i++) total += xpForNextLevel(i);
  return total;
}

/** Toplam XP'den mevcut seviyeyi hesapla */
export function econLevelFromXp(totalXp: number): number {
  let level = 0;
  let accumulated = 0;
  while (true) {
    const needed = xpForNextLevel(level);
    if (totalXp < accumulated + needed) break;
    accumulated += needed;
    level++;
  }
  return level;
}

/** Bir seviyeye ulaşınca verilen coin ödülü */
export function econLevelReward(level: number): number {
  const base = level * 200;
  const milestones: Record<number, number> = {
    5: 1_000, 10: 5_000, 15: 8_000, 20: 15_000,
    25: 25_000, 30: 40_000, 50: 100_000, 75: 200_000, 100: 500_000,
  };
  return base + (milestones[level] ?? 0);
}

/** Seviye unvanı */
export function econRankTitle(level: number): string {
  if (level >= 100) return "🌟 Godlike";
  if (level >= 75)  return "👑 Mythic";
  if (level >= 50)  return "💎 Legend";
  if (level >= 30)  return "🎖️ Master";
  if (level >= 25)  return "🏅 Expert";
  if (level >= 20)  return "💫 Elite";
  if (level >= 15)  return "🛡️ Veteran";
  if (level >= 10)  return "⚔️ Apprentice";
  if (level >= 5)   return "🌿 Rookie";
  return "🌱 Newcomer";
}

export interface EconXpResult {
  leveled: boolean;
  newLevels: number[];    // seviye atlanan tüm seviyelerin listesi
  totalReward: number;    // kazanılan toplam coin
  newLevel: number;
  newXp: number;
}

/** Kullanıcıya ekonomi XP ekler; seviye atlanırsa ödül verir */
export async function addEconXp(userId: string, xp: number): Promise<EconXpResult> {
  const bal = await getBalance(userId);
  const oldXp = (bal as any).econXp as number ?? 0;
  const oldLevel = (bal as any).econLevel as number ?? 0;
  const newXp = oldXp + xp;
  const newLevel = econLevelFromXp(newXp);

  const newLevels: number[] = [];
  let totalReward = 0;

  if (newLevel > oldLevel) {
    for (let l = oldLevel + 1; l <= newLevel; l++) {
      newLevels.push(l);
      totalReward += econLevelReward(l);
    }
  }

  const newCoins = Math.max(0, bal.coins + totalReward);

  await db
    .insert(economyTable)
    .values({
      userId,
      coins: newCoins,
      lastDaily: bal.lastDaily,
      streak: bal.streak,
      luck: bal.luck,
      luckExpiresAt: bal.luckExpiresAt,
      prayUsedAt: bal.prayUsedAt,
      econXp: newXp,
      econLevel: newLevel,
    })
    .onConflictDoUpdate({
      target: economyTable.userId,
      set: { coins: newCoins, econXp: newXp, econLevel: newLevel },
    });

  return { leveled: newLevel > oldLevel, newLevels, totalReward, newLevel, newXp };
}

/** Ekonomi sıralamasında kaçıncı olduğunu döner (1-based) */
export async function getEconRank(userId: string): Promise<number> {
  const bal = await getBalance(userId);
  const myXp = (bal as any).econXp as number ?? 0;
  const rows = await db
    .select({ count: sql<string>`count(*)` })
    .from(economyTable)
    .where(gt(economyTable.econXp, myXp));
  return Number(rows[0]?.count ?? 0) + 1;
}

/** Ekonomi liderlik tablosu */
export async function getEconLeaderboard(limit = 10) {
  return db
    .select()
    .from(economyTable)
    .orderBy(desc(economyTable.econXp))
    .limit(limit);
}
