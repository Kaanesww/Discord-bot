import { db } from "@workspace/db";
import { economyTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/** Kullanıcının global bakiyesini döndürür (sunucudan bağımsız). */
export async function getBalance(userId: string) {
  const rows = await db.select().from(economyTable).where(eq(economyTable.userId, userId)).limit(1);
  return rows[0] ?? { coins: 0, lastDaily: null, streak: 0 };
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

export async function claimDaily(userId: string): Promise<{ reward: number; streak: number; alreadyClaimed: boolean }> {
  const bal = await getBalance(userId);
  const now = new Date();
  const last = bal.lastDaily;

  if (last) {
    const hours = (now.getTime() - last.getTime()) / (1000 * 60 * 60);
    if (hours < 20) return { reward: 0, streak: bal.streak, alreadyClaimed: true };
  }

  const wasYesterday = last && (now.getTime() - last.getTime()) < 1000 * 60 * 60 * 36;
  const newStreak = wasYesterday ? bal.streak + 1 : 1;
  const base = 500;
  const bonus = Math.min(newStreak - 1, 30) * 50; // maks +1500 streak 30'da
  const reward = base + bonus;

  await db
    .insert(economyTable)
    .values({ userId, coins: bal.coins + reward, lastDaily: now, streak: newStreak })
    .onConflictDoUpdate({
      target: economyTable.userId,
      set: { coins: bal.coins + reward, lastDaily: now, streak: newStreak },
    });

  return { reward, streak: newStreak, alreadyClaimed: false };
}
