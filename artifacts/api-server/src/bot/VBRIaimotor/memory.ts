/**
 * VBRIaimotor — Hafıza Sistemi
 * SQLite tabanlı kalıcı öğrenme. Dış API yok.
 */

import { db } from "@workspace/db";
import { vbriMemoriesTable, vbriConversationsTable } from "@workspace/db";
import { eq, and, desc, like, or, sql } from "drizzle-orm";
import { logger } from "../../lib/logger";

// ── Konuşma geçmişi (in-memory hızlı erişim) ─────────────────────────────────

const channelHistory = new Map<string, Array<{ role: "user" | "bot"; content: string }>>();
const MAX_HISTORY = 20;

export function addToHistory(channelId: string, role: "user" | "bot", content: string): void {
  const hist = channelHistory.get(channelId) ?? [];
  hist.push({ role, content });
  if (hist.length > MAX_HISTORY) hist.splice(0, hist.length - MAX_HISTORY);
  channelHistory.set(channelId, hist);

  // Async olarak DB'ye yaz
  db.insert(vbriConversationsTable).values({
    channelId,
    userId: "system",
    role,
    content: content.slice(0, 1000),
  }).catch((e) => logger.debug({ e }, "vbri conv write skip"));
}

export function addUserTurn(channelId: string, userId: string, content: string): void {
  const hist = channelHistory.get(channelId) ?? [];
  hist.push({ role: "user", content });
  if (hist.length > MAX_HISTORY) hist.splice(0, hist.length - MAX_HISTORY);
  channelHistory.set(channelId, hist);

  db.insert(vbriConversationsTable).values({
    channelId,
    userId,
    role: "user",
    content: content.slice(0, 1000),
  }).catch(() => null);
}

export function getHistory(channelId: string): Array<{ role: "user" | "bot"; content: string }> {
  return channelHistory.get(channelId) ?? [];
}

export function getHistorySize(channelId: string): number {
  return (channelHistory.get(channelId) ?? []).length;
}

export function clearHistory(channelId: string): void {
  channelHistory.delete(channelId);
  db.delete(vbriConversationsTable)
    .where(eq(vbriConversationsTable.channelId, channelId))
    .catch(() => null);
}

export function lastBotReply(channelId: string): string | null {
  const hist = channelHistory.get(channelId) ?? [];
  for (let i = hist.length - 1; i >= 0; i--) {
    if (hist[i]!.role === "bot") return hist[i]!.content;
  }
  return null;
}

// ── Kalıcı hafıza (öğrenme) ────────────────────────────────────────────────────

export async function storeMemory(
  guildId: string,
  userId: string,
  type: "fact" | "preference" | "correction",
  content: string,
): Promise<void> {
  const keywords = extractKeywords(content);
  await db.insert(vbriMemoriesTable).values({
    guildId,
    userId,
    type,
    content: content.slice(0, 500),
    keywords: keywords.join(","),
    importance: type === "correction" ? 3 : 1,
  }).catch((e) => logger.debug({ e }, "memory store skip"));
}

export async function recallMemories(
  guildId: string,
  userId: string,
  query: string,
  limit = 5,
): Promise<string[]> {
  try {
    const words = extractKeywords(query);
    if (words.length === 0) return [];

    // Kullanıcıya özel ve sunucu geneli anılar
    const rows = await db
      .select()
      .from(vbriMemoriesTable)
      .where(
        and(
          eq(vbriMemoriesTable.guildId, guildId),
          or(
            eq(vbriMemoriesTable.userId, userId),
            sql`${vbriMemoriesTable.userId} IS NULL`,
          ),
        ),
      )
      .orderBy(desc(vbriMemoriesTable.importance), desc(vbriMemoriesTable.accessCount))
      .limit(50)
      .catch(() => []);

    // Keyword ile filtrele
    const scored = rows.map((r) => {
      const rKeys = (r.keywords ?? "").split(",");
      const score = words.filter((w) => rKeys.includes(w) || r.content.toLowerCase().includes(w)).length;
      return { ...r, score };
    });

    const relevant = scored
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    // Erişim sayısını artır
    for (const r of relevant) {
      db.update(vbriMemoriesTable)
        .set({ accessCount: (r.accessCount ?? 0) + 1 })
        .where(eq(vbriMemoriesTable.id, r.id))
        .catch(() => null);
    }

    return relevant.map((r) => r.content);
  } catch {
    return [];
  }
}

export async function getAllMemories(guildId: string, userId: string): Promise<string[]> {
  try {
    const rows = await db
      .select()
      .from(vbriMemoriesTable)
      .where(
        and(
          eq(vbriMemoriesTable.guildId, guildId),
          eq(vbriMemoriesTable.userId, userId),
        ),
      )
      .orderBy(desc(vbriMemoriesTable.importance))
      .limit(20);
    return rows.map((r) => r.content);
  } catch {
    return [];
  }
}

export async function clearMemories(guildId: string, userId: string): Promise<void> {
  await db.delete(vbriMemoriesTable)
    .where(
      and(
        eq(vbriMemoriesTable.guildId, guildId),
        eq(vbriMemoriesTable.userId, userId),
      ),
    )
    .catch(() => null);
}

// ── Keyword çıkarımı ──────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "bir", "bu", "şu", "o", "ve", "ya", "da", "de", "ki", "mi", "mu",
  "ben", "sen", "biz", "siz", "onlar", "için", "ile", "ama", "fakat",
  "çok", "az", "daha", "en", "ne", "nasıl", "neden", "hangi", "kaç",
  "the", "a", "an", "is", "are", "was", "were", "be", "been",
]);

export function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\sğüşıöçğüşiöç]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w))
    .slice(0, 10);
}
