/**
 * VBRI AI — Öğrenme & Hatırlama Modülü
 * ─────────────────────────────────────────────────────────────────────────────
 * Kullanıcılardan bilgi öğrenir, DB'ye kaydeder ve sorgu gelince hatırlar.
 * VBRIaimotor/memory.ts'in DB katmanını kullanır.
 */

import {
  storeMemory,
  recallMemories,
  getAllMemories,
  clearMemories,
  extractKeywords,
} from "../VBRIaimotor/memory";
import type { Message } from "discord.js";

export { storeMemory, recallMemories, extractKeywords };

// ── Öğrenme tetikleyicileri ───────────────────────────────────────────────────

const LEARN_TRIGGERS = [
  /^öğren[:\s]+(.+)/i,
  /^bunu bil[:\s]+(.+)/i,
  /^hatırla[:\s]+(.+)/i,
  /^not al[:\s]+(.+)/i,
  /^kaydet[:\s]+(.+)/i,
  /^bilgi ekle[:\s]+(.+)/i,
  /^bunu öğren[:\s]+(.+)/i,
  /^şunu öğren[:\s]+(.+)/i,
  /^şunu bil[:\s]+(.+)/i,
  /^bunu not et[:\s]+(.+)/i,
  /^learn[:\s]+(.+)/i,
  /^remember[:\s]+(.+)/i,
];

const RECALL_TRIGGERS = [
  /ne biliyorsun/i,
  /ne öğrendin/i,
  /hatırlıyor musun/i,
  /ne not aldın/i,
  /notların neler/i,
  /ne kaydettin/i,
  /öğrendiklerin neler/i,
  /bilgilerin neler/i,
];

const FORGET_TRIGGERS = [
  /her şeyi unut/i,
  /notları sil/i,
  /öğrendiklerini sil/i,
  /hafızayı temizle/i,
  /bellekten sil/i,
];

const WEB_LEARN_TRIGGERS = [
  /bu sayfayı öğren/i,
  /bu siteyi öğren/i,
  /bu url.*öğren/i,
  /siteden öğren/i,
  /web.*öğren/i,
  /sayfayı kaydet/i,
];

// ── Intent tespiti ────────────────────────────────────────────────────────────

export type LearnIntent =
  | "LEARN"
  | "RECALL_ALL"
  | "RECALL_QUERY"
  | "FORGET"
  | "WEB_LEARN"
  | "NONE";

export interface LearnDetection {
  intent: LearnIntent;
  content: string; // öğrenilecek veya sorgulanacak içerik
}

export function detectLearnIntent(text: string): LearnDetection {
  const lower = text.toLowerCase().trim();

  // Unutma
  for (const p of FORGET_TRIGGERS) {
    if (p.test(lower)) return { intent: "FORGET", content: "" };
  }

  // Web'den öğren
  for (const p of WEB_LEARN_TRIGGERS) {
    if (p.test(lower)) return { intent: "WEB_LEARN", content: text };
  }

  // Öğrenme
  for (const p of LEARN_TRIGGERS) {
    const m = text.match(p);
    if (m?.[1]) return { intent: "LEARN", content: m[1].trim() };
  }

  // Tüm notları listele
  for (const p of RECALL_TRIGGERS) {
    if (p.test(lower)) return { intent: "RECALL_ALL", content: "" };
  }

  return { intent: "NONE", content: "" };
}

// ── Öğren ────────────────────────────────────────────────────────────────────

const LEARN_RESPONSES = [
  (s: string) => `✅ Tamam, öğrendim: **"${s}"**`,
  (s: string) => `💾 Kaydettim! "${s}" — aklımda.`,
  (s: string) => `📝 Not aldım: **${s}**`,
  (s: string) => `✅ Hafızama yazdım: "${s}"`,
  (s: string) => `🧠 Öğrendim ve hatırlayacağım: **${s}**`,
];

export async function handleLearn(
  message: Message,
  content: string,
  type: "fact" | "preference" | "correction" = "fact",
): Promise<string> {
  const guildId = message.guildId ?? "dm";
  const userId  = message.author.id;
  await storeMemory(guildId, userId, type, content);
  const pick = LEARN_RESPONSES[Math.floor(Math.random() * LEARN_RESPONSES.length)]!;
  return pick(content.slice(0, 80));
}

// ── Tüm anıları listele ───────────────────────────────────────────────────────

export async function handleRecallAll(message: Message): Promise<string> {
  const guildId = message.guildId ?? "dm";
  const userId  = message.author.id;
  const memories = await getAllMemories(guildId, userId);

  if (memories.length === 0) {
    return "🧠 Henüz senden hiçbir şey öğrenmedim. `öğren: [bilgi]` ile öğretebilirsin!";
  }

  const lines = memories.map((m, i) => `${i + 1}. ${m}`);
  return `🧠 **Senden öğrendiklerim (${memories.length} not):**\n\n${lines.join("\n")}`;
}

// ── Hafızayı temizle ─────────────────────────────────────────────────────────

export async function handleForget(message: Message): Promise<string> {
  const guildId = message.guildId ?? "dm";
  const userId  = message.author.id;
  await clearMemories(guildId, userId);
  return "🗑️ Tamam, senden öğrendiğim her şeyi sildim. Yeni başlangıç!";
}

// ── Sorguyla ilgili anıları getir ─────────────────────────────────────────────

export async function getRelevantMemories(
  message: Message,
  query: string,
): Promise<string[]> {
  const guildId = message.guildId ?? "dm";
  const userId  = message.author.id;
  return recallMemories(guildId, userId, query, 4);
}

// ── Anıları yanıta ekle ───────────────────────────────────────────────────────

export function prependMemories(memories: string[], reply: string): string {
  if (memories.length === 0) return reply;
  const block = memories.map((m) => `• ${m}`).join("\n");
  return `💡 *Öğrendiklerimden:*\n${block}\n\n${reply}`;
}

// ── Web içeriğinden öğren ─────────────────────────────────────────────────────

export async function learnFromWeb(
  message: Message,
  url: string,
  pageTitle: string,
  pageContent: string,
): Promise<void> {
  const guildId = message.guildId ?? "dm";
  const userId  = message.author.id;
  const summary = `[Web: ${pageTitle || url}] ${pageContent.slice(0, 400)}`;
  await storeMemory(guildId, userId, "fact", summary);
}
