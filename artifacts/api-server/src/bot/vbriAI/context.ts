/**
 * VBRI AI — Konuşma Bağlamı
 * Son konuşmaları hatırlar.
 */

export interface Turn {
  role: "user" | "bot";
  text: string;
  ts: number;
}

const MAX_TURNS = 8; // Kanal başına max hatırlanan tur sayısı
const TTL_MS = 10 * 60 * 1000; // 10 dakika inaktiflik sonrası sıfırla

const store = new Map<string, Turn[]>();

function get(channelId: string): Turn[] {
  if (!store.has(channelId)) store.set(channelId, []);
  return store.get(channelId)!;
}

export function addTurn(channelId: string, role: "user" | "bot", text: string): void {
  const turns = get(channelId);
  const now = Date.now();

  // TTL kontrol
  const last = turns[turns.length - 1];
  if (last && now - last.ts > TTL_MS) {
    store.set(channelId, []);
  }

  const fresh = get(channelId);
  fresh.push({ role, text, ts: now });
  if (fresh.length > MAX_TURNS) fresh.splice(0, fresh.length - MAX_TURNS);
}

export function getContext(channelId: string): Turn[] {
  return get(channelId);
}

export function clearContext(channelId: string): void {
  store.delete(channelId);
}

export function getContextSize(channelId: string): number {
  return get(channelId).length;
}

/** Son bot yanıtı */
export function lastBotReply(channelId: string): string | null {
  const turns = get(channelId);
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i]!.role === "bot") return turns[i]!.text;
  }
  return null;
}

/** Son kullanıcı mesajının özetini al */
export function recentTopics(channelId: string): string[] {
  return get(channelId)
    .filter((t) => t.role === "user")
    .slice(-3)
    .map((t) => t.text.slice(0, 60));
}
