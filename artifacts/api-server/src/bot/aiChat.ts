/**
 * VBRI AI Sohbet Modülü — Google Gemini
 * ─────────────────────────────────────────────────────────────────────────────
 * Bot etiketlendiğinde Gemini ile yanıt üretir.
 * Kanal başına konuşma geçmişi tutar (son 30 mesaj).
 * Kullanıcı başına 3 saniyelik cooldown uygular.
 */

import { GoogleGenAI } from "@google/genai";
import type { Message } from "discord.js";
import { logger } from "../lib/logger";

// ── İstemci ───────────────────────────────────────────────────────────────────
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("GEMINI_API_KEY secret eksik!");

const genAI = new GoogleGenAI({ apiKey });

const MODEL = "gemini-2.0-flash";

// ── Sistem promptu ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Sen VBRI adlı bir Discord botusun. Vivincy adlı bir Discord sunucusunun botusun.

KİŞİLİK:
- Samimi, eğlenceli ve yardımseversin
- Gençlerin kullandığı Türkçe argolarını kullanırsın (sus ya, kanka, yok artık, vb.)
- Bazen emoji kullanırsın ama abartmadan
- Kısa ve öz cevaplar verirsin — genellikle 1-4 cümle yeterlidir
- Mizah anlayışın iyidir, esprileri anlarsın ve yaparsın
- Sorulara dürüstçe cevap verirsin

KOMUTLARIN:
Prefix komutları (varsayılan prefix: v!):
- Ekonomi: ekono, daily, pray, coinflip, rulet, bj (blackjack), duel, bet
- Seviye: profil, lider, xpayar, ldseviye, ldreset
- Oyunlar: rps, mine, zar, 8top, patla
- Müzik: çal, dur, devam, atla, kuyruk, bırak
- Moderasyon: kick, ban, mute, warn, sicil
- Guard: guard spam/link/bot/emoji/rol/kanal aç/kapat
- Yardım: yardım / help

KURALLAR:
- Zararlı, yasadışı veya uygunsuz içerik üretme
- Kişisel bilgi isteme
- Discord TOS'u ihlal etme
- Eğer bir şeyi bilmiyorsan, "bilmiyorum kanka" de — uydurma
- Konuşma dilini kullanıcıya göre ayarla: Türkçe konuşana Türkçe, İngilizce konuşana İngilizce yanıt ver`;

// ── Konuşma geçmişi ───────────────────────────────────────────────────────────

interface ChatTurn {
  role: "user" | "model";
  parts: Array<{ text: string }>;
}

// Kanal ID → geçmiş mesajlar
const channelHistories = new Map<string, ChatTurn[]>();
const MAX_HISTORY = 30; // kanal başına max mesaj çifti

// Kullanıcı cooldown (3 saniye)
const userCooldowns = new Map<string, number>();
const COOLDOWN_MS = 3000;

// Kanal başına işlem kilidi (çakışan istekleri önlemek için)
const processingChannels = new Set<string>();

// ── Yardımcılar ───────────────────────────────────────────────────────────────

function getHistory(channelId: string): ChatTurn[] {
  if (!channelHistories.has(channelId)) {
    channelHistories.set(channelId, []);
  }
  return channelHistories.get(channelId)!;
}

function addToHistory(channelId: string, role: "user" | "model", text: string): void {
  const history = getHistory(channelId);
  history.push({ role, parts: [{ text }] });
  // Geçmiş limitini aş → en eski çiftleri sil
  while (history.length > MAX_HISTORY) {
    history.splice(0, 2); // user + model çifti
  }
}

/** Discord 2000 karakter sınırına uygun böl */
function splitMessage(text: string, maxLen = 1900): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    // Satır sonunda böl
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

/** Kullanıcının mesajını bot mention'lardan temizle */
function cleanContent(content: string, botId: string): string {
  return content
    .replace(new RegExp(`<@!?${botId}>`, "g"), "")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Ana fonksiyon ─────────────────────────────────────────────────────────────

export async function handleAiMessage(m: Message): Promise<void> {
  const botId = m.client.user?.id;
  if (!botId) return;

  // Kullanıcı sorgu metni
  const userText = cleanContent(m.content, botId);
  if (!userText) {
    await m.reply("Beni etiketledin ama bir şey yazmadın? 👀").catch(() => null);
    return;
  }

  // Cooldown kontrolü
  const lastUsed = userCooldowns.get(m.author.id) ?? 0;
  const now = Date.now();
  if (now - lastUsed < COOLDOWN_MS) {
    const remaining = ((COOLDOWN_MS - (now - lastUsed)) / 1000).toFixed(1);
    await m.reply(`⏳ Biraz yavaş kanka, **${remaining}sn** bekle.`).catch(() => null);
    return;
  }
  userCooldowns.set(m.author.id, now);

  // Kanal kilidi
  const channelId = m.channelId;
  if (processingChannels.has(channelId)) {
    await m.reply("🔄 Şu an başka bir mesajı işliyorum, bir saniye!").catch(() => null);
    return;
  }
  processingChannels.add(channelId);

  // Typing göster
  await m.channel.sendTyping().catch(() => null);

  try {
    const history = getHistory(channelId);

    // Konuşmayı oluştur
    const chat = genAI.chats.create({
      model: MODEL,
      history: history.length > 0 ? history : undefined,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        maxOutputTokens: 8192,
        temperature: 0.85,
      },
    });

    // Mesajı gönder
    const result = await chat.sendMessage({
      message: userText,
    });

    const responseText = result.text?.trim() ?? "Bir şey söyleyemedim, tekrar dene.";

    // Geçmişe ekle
    addToHistory(channelId, "user", userText);
    addToHistory(channelId, "model", responseText);

    // Yanıtı gönder (uzunsa böl)
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

    // Kullanıcıya anlamlı hata mesajı
    let errMsg = "🤖 Bir şeyler ters gitti, biraz sonra tekrar dene.";
    if (err?.message?.includes("API_KEY")) {
      errMsg = "⚙️ AI anahtarı sorunu var, yöneticiye haber ver.";
    } else if (err?.message?.includes("quota") || err?.message?.includes("RESOURCE_EXHAUSTED")) {
      errMsg = "😮‍💨 API kotası doldu, biraz sonra tekrar dene.";
    } else if (err?.message?.includes("SAFETY")) {
      errMsg = "🚫 Bu konuda sana yardımcı olamam.";
    }

    await m.reply(errMsg).catch(() => null);
  } finally {
    processingChannels.delete(channelId);
  }
}

/** Bir kanalın konuşma geçmişini sıfırla */
export function clearChannelHistory(channelId: string): void {
  channelHistories.delete(channelId);
}

/** Geçmiş kaç mesaj olduğunu döndür */
export function getHistorySize(channelId: string): number {
  return getHistory(channelId).length;
}
