/**
 * VBRI AI Sohbet Modülü — Google Gemini
 * ─────────────────────────────────────────────────────────────────────────────
 * Bot etiketlendiğinde Gemini ile yanıt üretir.
 * Kanal başına konuşma geçmişi tutar (son 30 mesaj).
 * Rate limit / kota aşımında otomatik retry (exponential backoff) uygular.
 */

import { GoogleGenAI } from "@google/genai";
import type { Message } from "discord.js";
import { logger } from "../lib/logger";

// ── İstemci ───────────────────────────────────────────────────────────────────
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("GEMINI_API_KEY secret eksik!");

const genAI = new GoogleGenAI({ apiKey });

// Ücretsiz tier'da en geniş kotaya sahip model
const MODEL = "gemini-1.5-flash";

// ── Sistem promptu ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Sen VBRI adlı bir Discord botusun. Vivincy adlı bir Discord sunucusunun botusun.

KİŞİLİK:
- Samimi, eğlenceli ve yardımseversin
- Gençlerin kullandığı Türkçe argolarını kullanırsın (sus ya, kanka, yok artık, vb.)
- Bazen emoji kullanırsın ama abartmadan
- Kısa ve öz cevaplar verirsin — genellikle 1-4 cümle yeterlidir
- Mizah anlayışın iyidir, esprileri anlarsın ve yaparsın
- Sorulara dürüstçe cevap verirsin

KOMUTLARIN (prefix varsayılan: v!):
- Ekonomi: ekono, daily, pray, coinflip, rulet, bj, duel, bet, ekonlider
- Seviye: profil, lider, xpayar, ldseviye
- Oyunlar: rps, mine, zar, 8top, patla
- Müzik: çal, dur, devam, atla, kuyruk, bırak
- Moderasyon: kick, ban, mute, warn, sicil
- Guard: guard spam/link/bot/emoji/rol/kanal aç/kapat
- Yardım: yardım

KURALLAR:
- Zararlı, yasadışı veya uygunsuz içerik üretme
- Eğer bir şeyi bilmiyorsan "bilmiyorum kanka" de — uydurma
- Konuşma dilini kullanıcıya göre ayarla: Türkçe'ye Türkçe, İngilizce'ye İngilizce yanıt ver`;

// ── Konuşma geçmişi ───────────────────────────────────────────────────────────

interface ChatTurn {
  role: "user" | "model";
  parts: Array<{ text: string }>;
}

const channelHistories = new Map<string, ChatTurn[]>();
const MAX_HISTORY = 30;

// Kullanıcı başına cooldown
const userCooldowns = new Map<string, number>();
const COOLDOWN_MS = 8000; // 8 saniye — free tier için güvenli aralık

// Kanal başına işlem kilidi
const processingChannels = new Set<string>();

// Global istek kuyruğu — dakikada max 12 istek gönder (rate limit: 15 RPM)
let requestsThisMinute = 0;
let minuteResetAt = Date.now() + 60_000;

function checkGlobalRateLimit(): boolean {
  const now = Date.now();
  if (now > minuteResetAt) {
    requestsThisMinute = 0;
    minuteResetAt = now + 60_000;
  }
  if (requestsThisMinute >= 12) return false; // limit yaklaşıyor
  requestsThisMinute++;
  return true;
}

// ── Yardımcılar ───────────────────────────────────────────────────────────────

function getHistory(channelId: string): ChatTurn[] {
  if (!channelHistories.has(channelId)) channelHistories.set(channelId, []);
  return channelHistories.get(channelId)!;
}

function addToHistory(channelId: string, role: "user" | "model", text: string): void {
  const history = getHistory(channelId);
  history.push({ role, parts: [{ text }] });
  while (history.length > MAX_HISTORY) history.splice(0, 2);
}

function splitMessage(text: string, maxLen = 1900): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    let cut = maxLen;
    if (remaining.length > maxLen) {
      const nl = remaining.lastIndexOf("\n", maxLen);
      const sp = remaining.lastIndexOf(" ", maxLen);
      cut = nl > maxLen / 2 ? nl : sp > maxLen / 2 ? sp : maxLen;
    }
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  return chunks;
}

function cleanContent(content: string, botId: string): string {
  return content.replace(new RegExp(`<@!?${botId}>`, "g"), "").replace(/\s+/g, " ").trim();
}

/** Exponential backoff ile Gemini'ye istek at (max 3 deneme) */
async function callGeminiWithRetry(history: ChatTurn[], userText: string): Promise<string> {
  const maxRetries = 3;
  let lastError: any;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const chat = genAI.chats.create({
        model: MODEL,
        history: history.length > 0 ? history : undefined,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          maxOutputTokens: 8192,
          temperature: 0.85,
        },
      });

      const result = await chat.sendMessage({ message: userText });
      return result.text?.trim() ?? "Bir şey söyleyemedim, tekrar dene.";
    } catch (err: any) {
      lastError = err;
      const isRateLimit =
        err?.message?.includes("RESOURCE_EXHAUSTED") ||
        err?.message?.includes("quota") ||
        err?.message?.includes("429") ||
        err?.status === 429;

      if (!isRateLimit) throw err; // Rate limit değilse direkt fırlat

      // Backoff: 5s, 15s, 30s
      const waitMs = [5000, 15000, 30000][attempt] ?? 30000;
      logger.warn({ attempt, waitMs }, "Gemini rate limit, bekleniyor…");
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastError;
}

// ── Ana fonksiyon ─────────────────────────────────────────────────────────────

export async function handleAiMessage(m: Message): Promise<void> {
  const botId = m.client.user?.id;
  if (!botId) return;

  const userText = cleanContent(m.content, botId);
  if (!userText) {
    await m.reply("Beni etiketledin ama bir şey yazmadın? 👀").catch(() => null);
    return;
  }

  // Kullanıcı cooldown kontrolü
  const lastUsed = userCooldowns.get(m.author.id) ?? 0;
  const now = Date.now();
  const remaining = COOLDOWN_MS - (now - lastUsed);
  if (remaining > 0) {
    await m.reply(`⏳ Biraz yavaş kanka, **${(remaining / 1000).toFixed(1)}sn** bekle.`).catch(() => null);
    return;
  }
  userCooldowns.set(m.author.id, now);

  // Global rate limit kontrolü
  if (!checkGlobalRateLimit()) {
    await m.reply("😮‍💨 Şu an çok meşgulüm, **1 dakika** sonra tekrar dene!").catch(() => null);
    return;
  }

  // Kanal kilidi
  if (processingChannels.has(m.channelId)) {
    await m.reply("🔄 Şu an başka bir mesajı işliyorum, bir saniye!").catch(() => null);
    return;
  }
  processingChannels.add(m.channelId);

  await m.channel.sendTyping().catch(() => null);

  try {
    const history = getHistory(m.channelId);
    const responseText = await callGeminiWithRetry(history, userText);

    addToHistory(m.channelId, "user", userText);
    addToHistory(m.channelId, "model", responseText);

    const parts = splitMessage(responseText);
    let replied = false;
    for (const part of parts) {
      if (!replied) {
        await m.reply(part).catch(() => null);
        replied = true;
      } else {
        await m.channel.send(part).catch(() => null);
      }
    }
  } catch (err: any) {
    logger.error({ err }, "Gemini AI sohbet hatası");

    let errMsg = "🤖 Bir şeyler ters gitti, biraz sonra tekrar dene.";
    if (err?.message?.includes("API_KEY") || err?.message?.includes("API key")) {
      errMsg = "⚙️ AI anahtarı geçersiz, yöneticiye haber ver.";
    } else if (
      err?.message?.includes("quota") ||
      err?.message?.includes("RESOURCE_EXHAUSTED") ||
      err?.status === 429
    ) {
      errMsg = "😮‍💨 Gemini API kotası doldu, birkaç dakika sonra tekrar dene. (Ücretsiz tier dakikada 15 istek sınırı var)";
    } else if (err?.message?.includes("SAFETY")) {
      errMsg = "🚫 Bu konuda sana yardımcı olamam.";
    }

    await m.reply(errMsg).catch(() => null);
  } finally {
    processingChannels.delete(m.channelId);
  }
}

/** Kanalın sohbet geçmişini sıfırla */
export function clearChannelHistory(channelId: string): void {
  channelHistories.delete(channelId);
}

/** Kanal geçmiş boyutunu döndür */
export function getHistorySize(channelId: string): number {
  return getHistory(channelId).length;
}
