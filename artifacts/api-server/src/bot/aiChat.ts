/**
 * VBRI AI Sohbet & Komut Modülü — Google Gemini
 * ─────────────────────────────────────────────────────────────────────────────
 * Bot etiketlendiğinde Gemini ile yanıt üretir.
 * Kullanıcı doğal dil ile komut istediğinde (temizle, ban, rol ayarla vb.)
 * Gemini function-calling ile komutu yürütür.
 * Eksik parametre varsa soru sorar; kullanıcı yanıt verince devam eder.
 */

import type { Message } from "discord.js";
import { logger } from "../lib/logger";
import { BOT_TOOL_DECLARATIONS, executeToolCall } from "./aiCommands";

// ── İstemci ───────────────────────────────────────────────────────────────────
function getApiKey(): string {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error("GEMINI_API_KEY secret eksik!");
  return k;
}

// Model sıralaması — kota dolunca bir sonrakine geçer
const MODELS = [
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
];
const MODEL = MODELS[0]!;

// ── Sistem Promptu ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Sen VBRI adlı bir Discord botusun. Vivincy adlı bir Discord sunucusunun botusun.

KİŞİLİK:
- Samimi, eğlenceli ve yardımseversin
- Gençlerin kullandığı Türkçe argolarını kullanırsın (sus ya, kanka, yok artık, vb.)
- Bazen emoji kullanırsın ama abartmadan
- Kısa ve öz cevaplar verirsin — genellikle 1-4 cümle yeterlidir
- Mizah anlayışın iyidir, esprileri anlarsın ve yaparsın
- Sorulara dürüstçe cevap verirsin

KOMUT YETENEKLERİN:
Kullanıcılar senden doğal dil ile bot komutlarını çalıştırmanı isteyebilir.
Mesaj içeriğinde bir eylem isteği sezersen (kanalı temizle, birini ban'la, rol ayarla vb.)
ilgili aracı (tool) çağır. Eksik bilgi varsa kısa ve net bir soru sor.

Kullanıcının mesajında Discord mention'ları şu formatta gelir:
- Kullanıcı: <@123456789> veya <@!123456789>
- Rol: <@&123456789>
- Kanal: <#123456789>

Araç çağırırken userId, roleId veya channelId parametresine sadece sayısal ID'yi yaz
(mention'ın < > işaretleri olmadan sadece içindeki rakamları).

YETKİ KURALLARI:
- Moderasyon komutları (ban, kick, warn, timeout, temizle, kilitle, nuke):
  Kullanıcının moderatör rolü veya Discord izni yoksa araç bunu reddeder.
- Sunucu ayarları (modsetup_*, setprefix):
  Yalnızca sunucu sahibi kullanabilir.
- Yetki yoksa kibarca reddet, "yetkin yok kanka" gibi.

PREFIX KOMUTLARI (referans):
- Ekonomi: bakiye, daily, pray, coinflip, rulet, blackjack, duel, transfer
- Seviye: profil, lider, levelrol
- Oyunlar: rps, mine, zar, 8top, patla
- Müzik: çal, dur, devam, atla, kuyruk, durdur
- Moderasyon: ban, kick, warn, timeout, sustur, kilitle, ac, temizle, nuke, sicil, unban
- Ayarlar: modsetup, guard, setprefix, stat, sunucukur
- Yardım: yardim

KURALLAR:
- Zararlı, yasadışı veya uygunsuz içerik üretme
- Eğer bir şeyi bilmiyorsan "bilmiyorum kanka" de — uydurma
- Konuşma dilini kullanıcıya göre ayarla: Türkçe'ye Türkçe, İngilizce'ye İngilizce`;

// ── Tip tanımları ─────────────────────────────────────────────────────────────

interface ChatTurn {
  role: "user" | "model";
  parts: Array<{ text: string }>;
}

// ── Konuşma geçmişi ───────────────────────────────────────────────────────────
const channelHistories = new Map<string, ChatTurn[]>();
const MAX_HISTORY = 20;

function getHistory(channelId: string): ChatTurn[] {
  if (!channelHistories.has(channelId)) channelHistories.set(channelId, []);
  return channelHistories.get(channelId)!;
}

function addToHistory(channelId: string, role: "user" | "model", text: string): void {
  const hist = getHistory(channelId);
  hist.push({ role, parts: [{ text }] });
  while (hist.length > MAX_HISTORY) hist.splice(0, 2);
}

// ── Kullanıcı cooldown ────────────────────────────────────────────────────────
const userCooldowns = new Map<string, number>();
const COOLDOWN_MS = 6_000;

// ── Kanal işlem kilidi ────────────────────────────────────────────────────────
const processingChannels = new Set<string>();

// ── Dakikalık istek sayacı ────────────────────────────────────────────────────
let reqThisMinute = 0;
let minuteResetAt = Date.now() + 60_000;

function checkRateLimit(): boolean {
  const now = Date.now();
  if (now > minuteResetAt) { reqThisMinute = 0; minuteResetAt = now + 60_000; }
  if (reqThisMinute >= 25) return false;
  reqThisMinute++;
  return true;
}

// ── Metin yardımcıları ────────────────────────────────────────────────────────

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

/** Kullanıcı bağlamını mesaja ekler — AI'ın kim konuştuğunu bilmesi için */
function buildContextPrefix(message: Message): string {
  if (!message.guild || !message.member) return "";
  const isOwner = message.guild.ownerId === message.author.id;
  const roles   = message.member.roles.cache
    .filter((r) => r.id !== message.guildId)
    .map((r) => r.name)
    .join(", ") || "—";
  return (
    `[Bağlam: Kullanıcı=${message.author.username} (ID:${message.author.id}), ` +
    `Sunucu=${message.guild.name}, Kanal=#${(message.channel as { name?: string }).name ?? message.channelId}, ` +
    `SunucuSahibi=${isOwner}, Rolleri="${roles}"]\n`
  );
}

// ── Gemini çağrısı (function-calling destekli) ────────────────────────────────

interface GeminiResult {
  text: string | null;
  functionCalls: Array<{ name: string; args: Record<string, unknown> }>;
}

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

async function callGemini(
  history: ChatTurn[],
  userText: string,
  withTools: boolean,
): Promise<GeminiResult> {
  const contents = [
    ...history,
    { role: "user" as const, parts: [{ text: userText }] },
  ];

  const maxRetries = 3;
  let lastErr: unknown;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // Kota dolunca sıradaki modeli dene
    const model = MODELS[Math.min(attempt, MODELS.length - 1)]!;

    const body: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents,
      generationConfig: { maxOutputTokens: 4096, temperature: 0.85 },
    };

    if (withTools) {
      body["tools"] = [{ functionDeclarations: BOT_TOOL_DECLARATIONS }];
      body["toolConfig"] = { functionCallingConfig: { mode: "AUTO" } };
    }

    try {
      const apiKey = getApiKey();
      const res = await fetch(`${GEMINI_BASE}/${model}:generateContent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(body),
      });

      const json = (await res.json()) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{
              text?: string;
              functionCall?: { name: string; args: unknown };
            }>;
          };
        }>;
        error?: { code: number; status: string; message: string };
      };

      if (!res.ok) {
        const err = json.error;
        const isQuota = res.status === 429 || err?.status === "RESOURCE_EXHAUSTED";
        if (isQuota) {
          const waitMs = [8_000, 20_000, 40_000][attempt] ?? 40_000;
          logger.warn({ attempt, model, waitMs }, "Gemini kota doldu, bekleniyor");
          await new Promise((r) => setTimeout(r, waitMs));
          lastErr = Object.assign(new Error(err?.message ?? "RESOURCE_EXHAUSTED"), { status: 429 });
          continue;
        }
        throw Object.assign(new Error(JSON.stringify(err)), { status: res.status });
      }

      // Function calls
      const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
      const parts = json.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        if (part.functionCall) {
          calls.push({
            name: part.functionCall.name,
            args: (part.functionCall.args ?? {}) as Record<string, unknown>,
          });
        }
      }

      const text = parts.find((p) => p.text)?.text?.trim() ?? null;
      return { text, functionCalls: calls };

    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      const isQuota = status === 429;
      if (!isQuota) throw err;
      lastErr = err;
      const waitMs = [8_000, 20_000, 40_000][attempt] ?? 40_000;
      logger.warn({ attempt, model, waitMs }, "Gemini kota doldu, bekleniyor");
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastErr;
}

// ── Mesaj yanıtlama ───────────────────────────────────────────────────────────

async function replyInParts(message: Message, text: string): Promise<void> {
  const parts = splitMessage(text);
  let replied = false;
  for (const part of parts) {
    if (!replied) {
      await message.reply(part).catch(() => null);
      replied = true;
    } else {
      await message.channel.send(part).catch(() => null);
    }
  }
}

// ── Hata mesajı map'i ─────────────────────────────────────────────────────────

function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("API_KEY") || msg.includes("API key"))  return "⚙️ AI anahtarı geçersiz, yöneticiye haber ver.";
  if (msg.includes("RESOURCE_EXHAUSTED") || (err as { status?: number }).status === 429) return "😮‍💨 API limiti doldu, birkaç dakika sonra dene.";
  if (msg.includes("SAFETY"))                              return "🚫 Bu konuda sana yardımcı olamam.";
  if (msg.includes("NOT_FOUND") || (err as { status?: number }).status === 404)          return "⚙️ Model bulunamadı, yöneticiye haber ver.";
  return "🤖 Bir şeyler ters gitti, biraz sonra tekrar dene.";
}

// ── Ana işlem döngüsü ─────────────────────────────────────────────────────────
/**
 * Gemini'yi çağır → function call varsa yürüt → text varsa yanıtla.
 * AI soru sorduysa (? ile bitiyorsa) kullanıcının cevabını bekle ve devam et.
 * depth: sonsuz döngüyü önlemek için derinlik sayacı (maks 3 tur)
 */
async function processConversation(
  message: Message,
  channelId: string,
  userText: string,
  history: ChatTurn[],
  depth: number,
): Promise<void> {
  if (depth > 3) {
    await message.channel.send("❓ Yeterli bilgi toplayamadım, komutu manuel dene.").catch(() => null);
    return;
  }

  const withTools = !!message.guildId; // DM'de araçları devre dışı bırak
  const result = await callGemini(history, userText, withTools);

  // ── Araç çağrısı varsa yürüt ──────────────────────────────────────────────
  if (result.functionCalls.length > 0) {
    addToHistory(channelId, "user", userText);

    for (const fc of result.functionCalls) {
      logger.info({ tool: fc.name, params: fc.args }, "AI araç çağrısı");
      const execResult = await executeToolCall(fc.name, fc.args, message);

      // Komut sonucunu geçmişe ekle
      addToHistory(channelId, "model", execResult);

      // Kullanıcıya göster (sadece kanalda göster, mention veya send)
      const parts = splitMessage(execResult);
      for (const part of parts) {
        await message.channel.send(part).catch(() => null);
      }
    }
    return;
  }

  // ── Metin yanıtı ──────────────────────────────────────────────────────────
  const text = result.text ?? "Bir şey söyleyemedim, tekrar dene.";
  addToHistory(channelId, "user", userText);
  addToHistory(channelId, "model", text);
  await replyInParts(message, text);

  // ── AI soru sordu mu? → cevap bekle ──────────────────────────────────────
  const looksLikeQuestion = /\?[\s\p{P}]*$/u.test(text.trim());
  if (!looksLikeQuestion || depth >= 2) return;

  // Kanal kilidini bırak (kullanıcı cevap verene kadar diğer işlemler geçebilsin)
  processingChannels.delete(channelId);

  let collected: import("discord.js").Collection<string, Message> | null = null;
  try {
    collected = await message.channel.awaitMessages({
      filter: (m) => m.author.id === message.author.id && !m.author.bot,
      max: 1,
      time: 60_000,
      errors: ["time"],
    });
  } catch {
    // Süre doldu
    await message.channel.send(`⏰ ${message.author} süre doldu, işlem iptal edildi.`).catch(() => null);
    return;
  } finally {
    // Kilidi geri al
    processingChannels.add(channelId);
    await message.channel.sendTyping().catch(() => null);
  }

  const reply = collected!.first();
  if (!reply) return;

  const answerText = reply.content.trim();
  const updatedHistory = getHistory(channelId);
  await processConversation(message, channelId, answerText, updatedHistory, depth + 1);
}

// ── Dışa açık API ─────────────────────────────────────────────────────────────

export async function handleAiMessage(message: Message): Promise<void> {
  const botId = message.client.user?.id;
  if (!botId) return;

  const rawText = cleanContent(message.content, botId);
  if (!rawText) {
    await message.reply("Beni etiketledin ama bir şey yazmadın? 👀").catch(() => null);
    return;
  }

  // Cooldown kontrolü
  const now = Date.now();
  const remaining = COOLDOWN_MS - (now - (userCooldowns.get(message.author.id) ?? 0));
  if (remaining > 0) {
    await message.reply(
      `⏳ Biraz yavaş kanka, **${(remaining / 1000).toFixed(1)}sn** bekle.`
    ).catch(() => null);
    return;
  }
  userCooldowns.set(message.author.id, now);

  // Global rate limit
  if (!checkRateLimit()) {
    await message.reply("😮‍💨 Şu an çok meşgulüm, **1 dakika** sonra tekrar dene!").catch(() => null);
    return;
  }

  // Kanal kilidi
  const channelId = message.channelId;
  if (processingChannels.has(channelId)) {
    await message.reply("🔄 Şu an başka bir mesajı işliyorum, bir saniye!").catch(() => null);
    return;
  }
  processingChannels.add(channelId);
  await message.channel.sendTyping().catch(() => null);

  try {
    // Kullanıcı bağlamını userText'e ekle (AI kim konuştuğunu bilsin)
    const contextPrefix = buildContextPrefix(message);
    const userText      = contextPrefix + rawText;
    const history       = getHistory(channelId);

    await processConversation(message, channelId, userText, history, 0);
  } catch (err: unknown) {
    logger.error({ err }, "Gemini AI sohbet hatası");
    await message.reply(friendlyError(err)).catch(() => null);
  } finally {
    processingChannels.delete(channelId);
  }
}

export function clearChannelHistory(channelId: string): void {
  channelHistories.delete(channelId);
}

export function getHistorySize(channelId: string): number {
  return getHistory(channelId).length;
}
