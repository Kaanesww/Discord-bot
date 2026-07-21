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

// gemini-3.1-flash-lite: test edildi, ücretsiz tier'da çalışıyor
const MODEL = "gemini-3.1-flash-lite";

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
const MAX_HISTORY = 20; // kanal başına max mesaj (10 çift)

// Kullanıcı başına cooldown
const userCooldowns = new Map<string, number>();
const COOLDOWN_MS = 6000; // 6 saniye

// Kanal işlem kilidi
const processingChannels = new Set<string>();

// Dakikalık istek sayacı (30 RPM altında tut)
let reqThisMinute = 0;
let minuteResetAt = Date.now() + 60_000;

function checkRateLimit(): boolean {
  const now = Date.now();
  if (now > minuteResetAt) { reqThisMinute = 0; minuteResetAt = now + 60_000; }
  if (reqThisMinute >= 25) return false; // 25/30 RPM — güvenli marj
  reqThisMinute++;
  return true;
}

// ── Yardımcılar ───────────────────────────────────────────────────────────────

function getHistory(channelId: string): ChatTurn[] {
  if (!channelHistories.has(channelId)) channelHistories.set(channelId, []);
  return channelHistories.get(channelId)!;
}

function addToHistory(channelId: string, role: "user" | "model", text: string): void {
  const hist = getHistory(channelId);
  hist.push({ role, parts: [{ text }] });
  while (hist.length > MAX_HISTORY) hist.splice(0, 2);
}

function splitMessage(text: string, maxLen = 1900): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let rem = text;
  while (rem.length > 0) {
    let cut = maxLen;
    if (rem.length > maxLen) {
      const nl = rem.lastIndexOf("\n", maxLen);
      const sp = rem.lastIndexOf(" ", maxLen);
      cut = nl > maxLen / 2 ? nl : sp > maxLen / 2 ? sp : maxLen;
    }
    chunks.push(rem.slice(0, cut).trim());
    rem = rem.slice(cut).trim();
  }
  return chunks;
}

function cleanContent(content: string, botId: string): string {
  return content.replace(new RegExp(`<@!?${botId}>`, "g"), "").replace(/\s+/g, " ").trim();
}

/** generateContent ile tam geçmişi gönder — chats API'den daha kararlı */
async function callGemini(history: ChatTurn[], userText: string): Promise<string> {
  const contents = [
    ...history,
    { role: "user" as const, parts: [{ text: userText }] },
  ];

  const maxRetries = 3;
  let lastErr: any;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await genAI.models.generateContent({
        model: MODEL,
        contents,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          maxOutputTokens: 8192,
          temperature: 0.85,
        },
      });
      return response.text?.trim() ?? "Bir şey söyleyemedim, tekrar dene.";
    } catch (err: any) {
      lastErr = err;
      const isRate =
        err?.message?.includes("RESOURCE_EXHAUSTED") ||
        err?.message?.includes("quota") ||
        err?.status === 429 ||
        err?.message?.includes("429");

      if (!isRate) throw err;

      const waitMs = [5000, 15000, 30000][attempt] ?? 30000;
      logger.warn({ attempt, waitMs }, "Gemini rate limit — bekleniyor");
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastErr;
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

  // Cooldown
  const now = Date.now();
  const remaining = COOLDOWN_MS - (now - (userCooldowns.get(m.author.id) ?? 0));
  if (remaining > 0) {
    await m.reply(`⏳ Biraz yavaş kanka, **${(remaining / 1000).toFixed(1)}sn** bekle.`).catch(() => null);
    return;
  }
  userCooldowns.set(m.author.id, now);

  // Global rate limit
  if (!checkRateLimit()) {
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
    const responseText = await callGemini(history, userText);

    addToHistory(m.channelId, "user", userText);
    addToHistory(m.channelId, "model", responseText);

    const parts = splitMessage(responseText);
    let replied = false;
    for (const part of parts) {
      if (!replied) { await m.reply(part).catch(() => null); replied = true; }
      else { await m.channel.send(part).catch(() => null); }
    }
  } catch (err: any) {
    logger.error({ err }, "Gemini AI sohbet hatası");

    let msg = "🤖 Bir şeyler ters gitti, biraz sonra tekrar dene.";
    if (err?.message?.includes("API_KEY") || err?.message?.includes("API key")) {
      msg = "⚙️ AI anahtarı geçersiz, yöneticiye haber ver.";
    } else if (err?.message?.includes("RESOURCE_EXHAUSTED") || err?.status === 429) {
      msg = "😮‍💨 API limiti doldu, birkaç dakika sonra dene.";
    } else if (err?.message?.includes("SAFETY")) {
      msg = "🚫 Bu konuda sana yardımcı olamam.";
    } else if (err?.status === 404 || err?.message?.includes("NOT_FOUND")) {
      msg = "⚙️ Model bulunamadı, yöneticiye haber ver.";
    }

    await m.reply(msg).catch(() => null);
  } finally {
    processingChannels.delete(m.channelId);
  }
}

export function clearChannelHistory(channelId: string): void {
  channelHistories.delete(channelId);
}

export function getHistorySize(channelId: string): number {
  return getHistory(channelId).length;
}
