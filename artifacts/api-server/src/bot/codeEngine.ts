/**
 * VBRİ Kod Motoru
 * ─────────────────────────────────────────────────────────────────────────────
 * Bot sahibinin belirlediği kanalda doğal dil → Node.js kodu üretir ve
 * onay alınca vm.runInContext ile çalıştırır. Kalıcı pluginler data/plugins/'a yazılır.
 */

import vm from "node:vm";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  TextChannel, AttachmentBuilder, EmbedBuilder,
  type Message, type Client,
} from "discord.js";
import { db } from "@workspace/db";
import { codeChannelTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

// ── Plugins dizini ─────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGINS_DIR = path.join(__dirname, "../../../../data/plugins");

async function ensurePluginsDir(): Promise<void> {
  await fs.mkdir(PLUGINS_DIR, { recursive: true });
}

// ── Kod kanalı DB yardımcıları ────────────────────────────────────────────────

export async function getCodeChannelId(): Promise<string | null> {
  const row = await db.select().from(codeChannelTable).where(eq(codeChannelTable.id, 1)).get();
  return row?.channelId ?? null;
}

export async function setCodeChannelId(channelId: string): Promise<void> {
  await db.insert(codeChannelTable)
    .values({ id: 1, channelId, updatedAt: new Date() })
    .onConflictDoUpdate({ target: codeChannelTable.id, set: { channelId, updatedAt: new Date() } });
}

export async function clearCodeChannelId(): Promise<void> {
  await db.update(codeChannelTable)
    .set({ channelId: null, updatedAt: new Date() })
    .where(eq(codeChannelTable.id, 1));
}

// ── Gemini kod üretimi ────────────────────────────────────────────────────────

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const CODE_SYSTEM_PROMPT = `Sen VBRİ adlı bir Discord botunun yapay zeka kod motorusun.
Kullanıcının Türkçe veya İngilizce isteğine göre Node.js kodu üretirsin.

KURAL — ÇOK ÖNEMLİ:
- SADECE ham JavaScript kodu döndür
- Markdown, kod bloğu işaretleri (\`\`\`), açıklama KULLANMA
- Kod tek bir async IIFE şeklinde olmalı

ZORUNLU FORMAT (her zaman bu kalıbı kullan):
(async (ctx) => {
  const { client, message, db, logger } = ctx;
  // ── buraya kodu yaz ──
})(ctx);

MEVCUT ctx DEĞİŞKENLERİ:
- client: Discord.js Client (tüm guild/channel/user işlemleri için)
- message: Kodu tetikleyen Discord.Message (message.guild, message.channel, vb.)
- db: Drizzle ORM database instance
- logger: Pino logger ({ info, warn, error })
- TextChannel: discord.js TextChannel sınıfı
- AttachmentBuilder: discord.js AttachmentBuilder sınıfı

BOT MİMARİSİ:
- Discord.js v14 + TypeScript
- SQLite (LibSQL) veritabanı, Drizzle ORM
- Botun prefix'i "v!" (varsayılan)
- Tüm tablolar: guild_settings, levels, economy, moderation_logs, moderation_settings, guard_settings, stat_channels

ÖNEMLİ NOTLAR:
- Her zaman try/catch kullan
- Başarı/hata mesajını message.channel.send() ile gönder
- Asla token, secret veya hassas bilgileri kod içine ekleme
- Kod çalışır hale getir, import kullanma (ctx üzerinden erişim var)`;

async function callGeminiForCode(request: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY eksik");

  const models = ["gemini-2.0-flash-lite", "gemini-1.5-flash-8b", "gemini-1.5-flash"];
  let lastErr: unknown;

  for (let i = 0; i < models.length; i++) {
    const model = models[i]!;
    try {
      const res = await fetch(`${GEMINI_BASE}/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: CODE_SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: request }] }],
          generationConfig: { maxOutputTokens: 8192, temperature: 0.2 },
        }),
      });

      const json = await res.json() as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        error?: { code: number; status: string; message: string };
      };

      if (!res.ok) {
        const err = json.error;
        if (res.status === 429) {
          lastErr = new Error(`RESOURCE_EXHAUSTED: ${err?.message}`);
          await new Promise((r) => setTimeout(r, 8000 * (i + 1)));
          continue;
        }
        throw new Error(JSON.stringify(err));
      }

      const text = json.candidates?.[0]?.content?.parts?.find(p => p.text)?.text?.trim();
      if (!text) throw new Error("Gemini boş yanıt döndürdü");

      // Markdown kod bloğu işaretlerini temizle
      return text
        .replace(/^```[\w]*\n?/m, "")
        .replace(/```$/m, "")
        .trim();

    } catch (err) {
      lastErr = err;
      if ((err as { message?: string }).message?.includes("RESOURCE_EXHAUSTED")) {
        await new Promise((r) => setTimeout(r, 8000 * (i + 1)));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

// ── Kod çalıştırma ─────────────────────────────────────────────────────────────

async function executeCode(
  code: string,
  client: Client,
  message: Message,
): Promise<{ success: boolean; output: string }> {
  await ensurePluginsDir();

  const ctx = vm.createContext({
    client,
    message,
    db,
    logger,
    TextChannel,
    AttachmentBuilder,
    ctx: null as unknown, // will be set below
    console: {
      log:   (...args: unknown[]) => logger.info({ args }, "[Plugin log]"),
      warn:  (...args: unknown[]) => logger.warn({ args }, "[Plugin warn]"),
      error: (...args: unknown[]) => logger.error({ args }, "[Plugin error]"),
    },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Promise,
    Buffer,
    Date,
    Math,
    JSON,
    parseInt,
    parseFloat,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Error,
  });

  // ctx'yi kendi içine ata (IIFE patternında ctx kullanabilsin)
  (ctx as Record<string, unknown>)["ctx"] = ctx;

  try {
    const script = new vm.Script(code, { filename: "vbri-plugin.js", timeout: 30_000 });
    await script.runInContext(ctx, { timeout: 30_000 });
    return { success: true, output: "✅ Kod başarıyla çalıştırıldı!" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, output: `❌ Hata: ${msg}` };
  }
}

async function savePlugin(code: string, name: string): Promise<string> {
  await ensurePluginsDir();
  const ts  = Date.now();
  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 30);
  const file = path.join(PLUGINS_DIR, `${ts}-${slug}.js`);
  await fs.writeFile(file, code, "utf8");
  return file;
}

// ── Onay mesajı ───────────────────────────────────────────────────────────────

const TIMEOUT_MS = 90_000;

function codeEmbed(code: string, request: string): EmbedBuilder {
  const preview = code.length > 1800 ? code.slice(0, 1800) + "\n// ... (kısaltıldı)" : code;
  return new EmbedBuilder()
    .setTitle("🤖 VBRİ Kod Motoru — Üretilen Kod")
    .setColor(0x5865f2)
    .setDescription(
      `**İstek:** ${request.slice(0, 200)}\n\n` +
      `\`\`\`js\n${preview}\n\`\`\``
    )
    .setFooter({ text: "✅ Çalıştır  |  ❌ İptal  |  90 saniye süren var" })
    .setTimestamp();
}

// ── Ana işleyici ──────────────────────────────────────────────────────────────

const processingUsers = new Set<string>();

export async function handleCodeMessage(message: Message, client: Client): Promise<void> {
  const userId = message.author.id;
  if (processingUsers.has(userId)) {
    await message.reply("🔄 Zaten bir işlem yürütüyorum, bitsin bekle.").catch(() => null);
    return;
  }

  const request = message.content.trim();
  if (!request || request.length < 5) return;

  processingUsers.add(userId);

  try {
    await message.channel.sendTyping().catch(() => null);

    // Gemini'dan kod üret
    let code: string;
    try {
      code = await callGeminiForCode(request);
    } catch (err) {
      const msg = (err as Error).message ?? "";
      if (msg.includes("RESOURCE_EXHAUSTED")) {
        await message.reply(
          "😮‍💨 **Gemini kotası doldu!** Birkaç dakika sonra tekrar dene.\n" +
          "💡 API kotasını artırmak için Google AI Studio'da billing aç."
        ).catch(() => null);
      } else if (msg.includes("GEMINI_API_KEY")) {
        await message.reply("⚙️ GEMINI_API_KEY secret eksik, yöneticiye haber ver.").catch(() => null);
      } else {
        await message.reply(`❌ Kod üretilirken hata: ${msg.slice(0, 200)}`).catch(() => null);
      }
      return;
    }

    if (!code) {
      await message.reply("😕 Kod üretilemedi, tekrar dene.").catch(() => null);
      return;
    }

    // Kodu Discord'a göster
    const embed = codeEmbed(code, request);
    const codeMsg = await message.reply({ embeds: [embed] }).catch(() => null);
    if (!codeMsg) return;

    await codeMsg.react("✅").catch(() => null);
    await codeMsg.react("❌").catch(() => null);

    // Kullanıcının reaksiyonunu bekle
    let confirmed = false;
    try {
      const collected = await codeMsg.awaitReactions({
        filter: (r, u) => ["✅", "❌"].includes(r.emoji.name ?? "") && u.id === userId && !u.bot,
        max: 1,
        time: TIMEOUT_MS,
        errors: ["time"],
      });
      confirmed = collected.first()?.emoji.name === "✅";
    } catch {
      await message.channel.send("⏰ Süre doldu, kod uygulanmadı.").catch(() => null);
      return;
    }

    if (!confirmed) {
      await message.channel.send("❌ İptal edildi.").catch(() => null);
      return;
    }

    // Kodu çalıştır
    await message.channel.send("⚙️ Kod çalıştırılıyor...").catch(() => null);
    const { success, output } = await executeCode(code, client, message);

    if (success) {
      // Kalıcı kaydet
      try {
        const pluginPath = await savePlugin(code, request.slice(0, 40));
        await message.channel.send(
          `${output}\n📁 Plugin kaydedildi: \`${path.basename(pluginPath)}\``
        ).catch(() => null);
      } catch {
        await message.channel.send(output).catch(() => null);
      }
    } else {
      await message.channel.send(output).catch(() => null);
    }

  } finally {
    processingUsers.delete(userId);
  }
}
