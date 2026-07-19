import { db } from "@workspace/db";
import { economyTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

export async function getBalance(userId: string, guildId: string) {
  const rows = await db
    .select()
    .from(economyTable)
    .where(and(eq(economyTable.userId, userId), eq(economyTable.guildId, guildId)))
    .limit(1);
  return rows[0] ?? { coins: 0, lastDaily: null, streak: 0 };
}

export async function setCoins(userId: string, guildId: string, coins: number): Promise<number> {
  const safe = Math.max(0, Math.round(coins));
  await db
    .insert(economyTable)
    .values({ userId, guildId, coins: safe, lastDaily: null, streak: 0 })
    .onConflictDoUpdate({
      target: [economyTable.userId, economyTable.guildId],
      set: { coins: safe },
    });
  return safe;
}

export async function addCoins(userId: string, guildId: string, amount: number): Promise<number> {
  const bal = await getBalance(userId, guildId);
  return setCoins(userId, guildId, bal.coins + amount);
}

export async function takeCoins(userId: string, guildId: string, amount: number): Promise<number> {
  const bal = await getBalance(userId, guildId);
  return setCoins(userId, guildId, bal.coins - amount);
}

export async function claimDaily(userId: string, guildId: string): Promise<{ reward: number; streak: number; alreadyClaimed: boolean }> {
  const bal = await getBalance(userId, guildId);
  const now = new Date();
  const last = bal.lastDaily;

  if (last) {
    const diff = now.getTime() - last.getTime();
    const hours = diff / (1000 * 60 * 60);
    if (hours < 20) return { reward: 0, streak: bal.streak, alreadyClaimed: true };
  }

  const wasYesterday = last && (now.getTime() - last.getTime()) < 1000 * 60 * 60 * 36;
  const newStreak = wasYesterday ? bal.streak + 1 : 1;
  const base = 500;
  const bonus = Math.min(newStreak - 1, 30) * 50; // max +1500 bonus at streak 30
  const reward = base + bonus;

  await db
    .insert(economyTable)
    .values({ userId, guildId, coins: bal.coins + reward, lastDaily: now, streak: newStreak })
    .onConflictDoUpdate({
      target: [economyTable.userId, economyTable.guildId],
      set: { coins: bal.coins + reward, lastDaily: now, streak: newStreak },
    });

  return { reward, streak: newStreak, alreadyClaimed: false };
}
