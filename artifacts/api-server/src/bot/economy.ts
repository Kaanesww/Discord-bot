import { db } from "@workspace/db";
import { economyTable } from "@workspace/db";
import { eq } from "drizzle-orm";

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
  // İki deneme yap, büyüğünü al → kazanma eşiğini (0.5) geçme ihtimali artar
  const r1 = Math.random();
  const r2 = Math.random();
  return Math.max(r1, r2);
}
