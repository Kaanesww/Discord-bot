/**
 * VBRI AI — Ana Motor
 * ─────────────────────────────────────────────────────────────────────────────
 * Tamamen bağımsız, yerel AI motoru. Hiçbir dış API kullanmaz.
 * Komut bilgisi, kişilik şablonları ve intent tespiti ile çalışır.
 */

import type { Message } from "discord.js";
import { logger } from "../../lib/logger";
import { executeToolCall } from "../aiCommands";
import { detectIntent, extractCommandTrigger } from "./intent";
import {
  findCommand, formatCommand, getAllCategories, getCommandsByCategory,
  COMMANDS,
} from "./knowledge";
import {
  greeting, farewell, selfAnswer, capabilityAnswer,
  compliment, insult, unknown as unknownReply, joke,
  serverAnswer, thanks, casual, mathIntro,
  commandExecIntro, commandNotFound,
} from "./responses";
import { evalMath, extractMathExpr, formatNumber } from "./math";
import { addTurn, clearContext, getContextSize, lastBotReply } from "./context";

// ── Cooldown ────────────────────────────────────────────────────────────────

const userCooldowns = new Map<string, number>();
const COOLDOWN_MS = 4_000;
const processingChannels = new Set<string>();

// ── Mesaj bölme ─────────────────────────────────────────────────────────────

function split(text: string, max = 1900): string[] {
  if (text.length <= max) return [text];
  const chunks: string[] = [];
  let rem = text;
  while (rem.length > 0) {
    let cut = max;
    if (rem.length > max) {
      const nl = rem.lastIndexOf("\n", max);
      const sp = rem.lastIndexOf(" ", max);
      cut = nl > max / 2 ? nl : sp > max / 2 ? sp : max;
    }
    chunks.push(rem.slice(0, cut).trim());
    rem = rem.slice(cut).trim();
  }
  return chunks;
}

async function send(msg: Message, text: string): Promise<void> {
  const parts = split(text);
  let first = true;
  for (const p of parts) {
    if (first) { await msg.reply(p).catch(() => null); first = false; }
    else await msg.channel.send(p).catch(() => null);
  }
}

// ── Kullanıcı bağlamı ────────────────────────────────────────────────────────

function userContext(message: Message): string {
  if (!message.guild || !message.member) return "";
  const isOwner = message.guild.ownerId === message.author.id;
  const roles = message.member.roles.cache
    .filter((r) => r.id !== message.guildId)
    .map((r) => r.name)
    .slice(0, 5)
    .join(", ") || "—";
  return `[${message.author.username} | Sunucu Sahibi: ${isOwner} | Rolleri: ${roles}]`;
}

// ── Yardım listesi ───────────────────────────────────────────────────────────

function buildHelpText(category?: string): string {
  if (category) {
    const cmds = getCommandsByCategory(category);
    if (cmds.length === 0) return `❌ **${category}** kategorisinde komut bulunamadı.`;
    return (
      `**${category} Komutları** (${cmds.length}):\n` +
      cmds.map((c) => `• \`${c.names[0]}\` — ${c.description.split(".")[0]}`).join("\n") +
      `\n\nDetay için: \`@VBRI ${c.names[0]} ne yapar\` gibi sor.`
    ).replace("{c.names[0]}", cmds[0]!.names[0]!);
  }

  const cats = getAllCategories();
  const lines = cats.map((cat) => {
    const cmds = getCommandsByCategory(cat);
    const names = cmds.map((c) => `\`${c.names[0]}\``).join(", ");
    return `**${cat}** — ${names}`;
  });

  return (
    `🤖 **VBRI Komut Listesi**\n\n` +
    lines.join("\n\n") +
    `\n\n💡 Belirli bir komut hakkında bilgi almak için: \`@VBRI ban ne yapar\` gibi yaz.` +
    `\n📂 Kategori listesi için: \`@VBRI [kategori] komutları\``
  );
}

// ── Komut yardımı ────────────────────────────────────────────────────────────

function buildCommandHelp(query: string): string {
  // Önce direkt arama
  const cmd = findCommand(query);
  if (cmd) return formatCommand(cmd);

  // Kategori mi?
  const cats = getAllCategories();
  const matchedCat = cats.find((c) => query.toLowerCase().includes(c.toLowerCase()));
  if (matchedCat) return buildHelpText(matchedCat);

  return commandNotFound();
}

// ── AI işleme ─────────────────────────────────────────────────────────────────

export async function processVbriAI(message: Message, rawText: string): Promise<void> {
  const username = message.author.displayName;
  const channelId = message.channelId;
  const lower = rawText.toLowerCase().trim();

  addTurn(channelId, "user", rawText);

  // ── Komut tarihi temizleme ──────────────────────────────────────────────
  if (/geçmişi\s*(temizle|sıfırla)|sohbeti\s*unut/.test(lower)) {
    clearContext(channelId);
    const r = "Tamam kanka, sohbet geçmişini sıfırladım. Yeni başlangıç!";
    await send(message, r);
    addTurn(channelId, "bot", r);
    return;
  }

  // ── Geçmiş boyutu ──────────────────────────────────────────────────────
  if (/kaç mesaj\s*(hatırlıyorsun|var geçmişte|biliyorsun)/.test(lower)) {
    const size = getContextSize(channelId);
    const r = `Bu kanalda ${size} tur konuşma hatırlıyorum.`;
    await send(message, r);
    addTurn(channelId, "bot", r);
    return;
  }

  // ── Yardım isteği — tam liste ──────────────────────────────────────────
  if (/^(yardım|yardim|help|komutlar|ne yapabilirsin|komut listesi)[\s!?]*$/.test(lower)) {
    const r = buildHelpText();
    await send(message, r);
    addTurn(channelId, "bot", r);
    return;
  }

  // ── Kategori yardımı ───────────────────────────────────────────────────
  const catMatch = lower.match(
    /(müzik|müzik|moderasyon|mod|ekonomi|ekon|oyun|seviye|level|yönetim|yonetim)\s*(komutları?|listesi?|neler)/
  );
  if (catMatch) {
    const catQuery = catMatch[1]!;
    const r = buildHelpText(catQuery);
    await send(message, r);
    addTurn(channelId, "bot", r);
    return;
  }

  // ── Intent tespiti ─────────────────────────────────────────────────────
  const { intent, matched } = detectIntent(rawText);

  // ── Komut çalıştırma isteği ────────────────────────────────────────────
  if (intent === "COMMAND_RUN") {
    const trigger = extractCommandTrigger(rawText);
    if (trigger) {
      await message.channel.sendTyping().catch(() => null);
      const intro = commandExecIntro();
      await send(message, intro);
      const result = await executeToolCall(trigger.tool, trigger.params, message).catch(
        (err: unknown) => `❌ Hata: ${err instanceof Error ? err.message : String(err)}`
      );
      await send(message, result);
      addTurn(channelId, "bot", `${intro}\n${result}`);
      return;
    }
    // Komut anlaşıldı ama parametre eksik
    const r =
      "Bir komut çalıştırmak istediğini anladım ama gerekli bilgileri göremedim. " +
      "Kimi hedef alıyorsun? Örnek: `@VBRI ban at @kullanıcı kural ihlali`";
    await send(message, r);
    addTurn(channelId, "bot", r);
    return;
  }

  // ── Komut yardımı ──────────────────────────────────────────────────────
  if (intent === "COMMAND_HELP") {
    // Metinden hangi komutu sorduğunu bulmaya çalış
    const cmdNames = COMMANDS.flatMap((c) => c.names);
    let foundQuery = "";
    for (const name of cmdNames) {
      if (lower.includes(name)) { foundQuery = name; break; }
    }
    if (!foundQuery) {
      // Son 6 kelimeden komut aramaya çalış
      const words = lower.split(/\s+/).slice(-6);
      for (const w of words) {
        if (findCommand(w)) { foundQuery = w; break; }
      }
    }
    const r = foundQuery ? buildCommandHelp(foundQuery) : buildHelpText();
    await send(message, r);
    addTurn(channelId, "bot", r);
    return;
  }

  // ── Karşılama ──────────────────────────────────────────────────────────
  if (intent === "GREETING") {
    const r = greeting(username);
    await send(message, r);
    addTurn(channelId, "bot", r);
    return;
  }

  // ── Veda ───────────────────────────────────────────────────────────────
  if (intent === "FAREWELL") {
    const r = farewell(username);
    await send(message, r);
    addTurn(channelId, "bot", r);
    return;
  }

  // ── Teşekkür ───────────────────────────────────────────────────────────
  if (intent === "THANKS") {
    const r = thanks(username);
    await send(message, r);
    addTurn(channelId, "bot", r);
    return;
  }

  // ── Kim olduğunu soruyor ────────────────────────────────────────────────
  if (intent === "SELF_QUESTION") {
    const r = selfAnswer();
    await send(message, r);
    addTurn(channelId, "bot", r);
    return;
  }

  // ── Yetenek sorusu ─────────────────────────────────────────────────────
  if (intent === "CAPABILITY_QUESTION") {
    const r = capabilityAnswer();
    await send(message, r);
    addTurn(channelId, "bot", r);
    return;
  }

  // ── İltifat ────────────────────────────────────────────────────────────
  if (intent === "COMPLIMENT") {
    const r = compliment(username);
    await send(message, r);
    addTurn(channelId, "bot", r);
    return;
  }

  // ── Hakaret ────────────────────────────────────────────────────────────
  if (intent === "INSULT") {
    const r = insult(username);
    await send(message, r);
    addTurn(channelId, "bot", r);
    return;
  }

  // ── Matematik ──────────────────────────────────────────────────────────
  if (intent === "MATH") {
    const expr = extractMathExpr(rawText);
    if (expr) {
      const result = evalMath(expr);
      if (result !== null) {
        const r = `${mathIntro()} **${expr.trim()}** = **${formatNumber(result)}**`;
        await send(message, r);
        addTurn(channelId, "bot", r);
        return;
      }
    }
    const r = "Matematiksel ifadeyi çözemedim. Daha açık yaz: `2 + 2 kaç eder` gibi.";
    await send(message, r);
    addTurn(channelId, "bot", r);
    return;
  }

  // ── Espri isteği ───────────────────────────────────────────────────────
  if (intent === "JOKE_REQUEST") {
    const r = joke();
    await send(message, r);
    addTurn(channelId, "bot", r);
    return;
  }

  // ── Sunucu sorusu ──────────────────────────────────────────────────────
  if (intent === "SERVER_QUESTION") {
    const r = serverAnswer();
    await send(message, r);
    addTurn(channelId, "bot", r);
    return;
  }

  // ── Belirli komut adı geçiyorsa yardım ver ─────────────────────────────
  {
    const cmdNames = COMMANDS.flatMap((c) => c.names);
    for (const name of cmdNames) {
      if (lower.includes(name) && lower.length < 60) {
        const r = buildCommandHelp(name);
        await send(message, r);
        addTurn(channelId, "bot", r);
        return;
      }
    }
  }

  // ── Genel sohbet / bilinmiyor ──────────────────────────────────────────
  {
    const prev = lastBotReply(channelId);
    const isShort = rawText.trim().length < 15;
    let r: string;

    if (isShort && prev) {
      // Kısa yanıt: önceki cevabın devamı gibi davran
      r = `Hmm... Yani "${rawText.trim()}" mi? Biraz daha açar mısın?`;
    } else {
      r = unknownReply();
    }

    await send(message, r);
    addTurn(channelId, "bot", r);
  }
}

// ── Dışa açık ana giriş ───────────────────────────────────────────────────────

export async function handleVbriAI(message: Message): Promise<void> {
  const botId = message.client.user?.id;
  if (!botId) return;

  // Bot mention'ını temizle
  const rawText = message.content
    .replace(new RegExp(`<@!?${botId}>`, "g"), "")
    .replace(/\s+/g, " ")
    .trim();

  if (!rawText) {
    await message.reply("Beni etiketledin ama bir şey yazmadın? 👀").catch(() => null);
    return;
  }

  // Cooldown
  const now = Date.now();
  const remaining = COOLDOWN_MS - (now - (userCooldowns.get(message.author.id) ?? 0));
  if (remaining > 0) {
    await message.reply(
      `⏳ Biraz yavaş kanka, **${(remaining / 1000).toFixed(1)}sn** bekle.`
    ).catch(() => null);
    return;
  }
  userCooldowns.set(message.author.id, now);

  // Kanal kilidi
  const channelId = message.channelId;
  if (processingChannels.has(channelId)) {
    await message.reply("🔄 Şu an başka bir mesajı işliyorum, bir saniye!").catch(() => null);
    return;
  }
  processingChannels.add(channelId);
  await message.channel.sendTyping().catch(() => null);

  try {
    logger.info({ user: message.author.username, text: rawText.slice(0, 80) }, "VBRI AI mesaj");
    await processVbriAI(message, rawText);
  } catch (err: unknown) {
    logger.error({ err }, "VBRI AI hata");
    await message.reply(
      "🤖 Bir şeyler ters gitti. Tekrar dener misin?"
    ).catch(() => null);
  } finally {
    processingChannels.delete(channelId);
  }
}

// ── Compat exports (aiChat.ts arayüzü ile uyumlu) ───────────────────────────

export { clearContext as clearChannelHistory };

export function getHistorySize(channelId: string): number {
  return getContextSize(channelId);
}
