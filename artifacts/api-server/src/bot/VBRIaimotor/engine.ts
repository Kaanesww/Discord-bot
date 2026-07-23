/**
 * VBRIaimotor — Ana Yanıt Motoru
 * Hafıza + Intent + Kişilik → Yanıt.
 * Tamamen bağımsız, dış API yok.
 */

import type { Message } from "discord.js";
import { logger } from "../../lib/logger";
import { executeToolCall } from "../aiCommands";
import { reply } from "./personality";
import {
  addUserTurn, addToHistory, getHistory, getHistorySize,
  clearHistory, lastBotReply, storeMemory, recallMemories,
  getAllMemories, clearMemories, extractKeywords,
} from "./memory";
import {
  detectIntent, extractLearnableFact, extractCommandTrigger, evalMathExpr,
} from "./patterns";
import { isOwner } from "../ownerUtils";
import { COMMANDS } from "../vbriAI/knowledge";

// ── Cooldown ──────────────────────────────────────────────────────────────────

const userCooldowns = new Map<string, number>();
const processingSet = new Set<string>();
const COOLDOWN_MS = 3_000;

// ── Mesaj bölücü ─────────────────────────────────────────────────────────────

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
    if (!p) continue;
    if (first) { await msg.reply(p).catch(() => null); first = false; }
    else await msg.channel.send(p).catch(() => null);
  }
}

// ── Komut listesi yardımı ─────────────────────────────────────────────────────

function buildCommandList(): string {
  const categories: Record<string, string[]> = {};
  for (const c of COMMANDS) {
    const cat = c.category ?? "Genel";
    if (!categories[cat]) categories[cat] = [];
    categories[cat]!.push(`\`${c.names[0]}\``);
  }
  const lines = Object.entries(categories).map(([cat, cmds]) =>
    `**${cat}** — ${cmds.join(", ")}`
  );
  return `🤖 **VBRI Komut Listesi**\n\n${lines.join("\n\n")}\n\n💡 Detay için: \`@VBRI ban ne yapar\` diye sor`;
}

function buildCommandHelp(query: string): string {
  const lower = query.toLowerCase();
  const found = COMMANDS.find((c) =>
    c.names.some((n) => lower.includes(n)) || lower.includes(c.description.toLowerCase().split(" ")[0]!)
  );
  if (!found) return `❓ **"${query}"** hakkında bilgi bulamadım. Komut listesi için \`v!yardım\` yaz.`;
  const aliases = found.names.slice(1).length ? `\nAlias: ${found.names.slice(1).map((n) => `\`${n}\``).join(", ")}` : "";
  return `📖 **\`${found.names[0]}\`** — ${found.description}${aliases}`;
}

// ── Bağlam özeti ─────────────────────────────────────────────────────────────

function buildContextSummary(channelId: string): string {
  const hist = getHistory(channelId);
  if (hist.length < 2) return "";
  const recent = hist.slice(-6);
  return `[Son ${recent.length} tur: ${recent.map((h) => `${h.role === "user" ? "K" : "B"}: "${h.content.slice(0, 40)}"`).join(" | ")}]`;
}

// ── Hafıza bağlamı ────────────────────────────────────────────────────────────

async function buildMemoryContext(guildId: string, userId: string, query: string): Promise<string> {
  const mems = await recallMemories(guildId, userId, query, 3);
  if (mems.length === 0) return "";
  return `[Hafızam: ${mems.join(" • ")}]`;
}

// ── Ana işleme ────────────────────────────────────────────────────────────────

export async function processMessage(
  message: Message,
  rawText: string,
): Promise<void> {
  const username = message.author.displayName;
  const channelId = message.channelId;
  const guildId = message.guildId ?? "global";
  const userId = message.author.id;
  const lower = rawText.toLowerCase().trim();

  addUserTurn(channelId, userId, rawText);

  // ── Geçmiş temizle ────────────────────────────────────────────────────────
  if (/geçmişi\s*(temizle|sıfırla)|sohbeti\s*(unut|sıfırla)/i.test(lower)) {
    clearHistory(channelId);
    const r = `🧹 Tamam ${username}, sohbet geçmişini sıfırladım. Yeni sayfa!`;
    await send(message, r);
    addToHistory(channelId, "bot", r);
    return;
  }

  // ── Hafıza temizle ────────────────────────────────────────────────────────
  if (/unut beni|bilgilerimi sil|hakkımdakileri unut/i.test(lower)) {
    await clearMemories(guildId, userId);
    const r = `✅ Sana ait tüm hafızamı sildim ${username}. Temiz sayfa!`;
    await send(message, r);
    addToHistory(channelId, "bot", r);
    return;
  }

  // ── Geçmiş boyutu ─────────────────────────────────────────────────────────
  if (/kaç mesaj\s*(hatırlıyorsun|var|biliyorsun)|geçmiş (kaç|boyut)/i.test(lower)) {
    const size = getHistorySize(channelId);
    const mems = await getAllMemories(guildId, userId);
    const r = `📊 Bu kanalda **${size}** tur konuşma + **${mems.length}** kalıcı hafıza kaydın var.`;
    await send(message, r);
    addToHistory(channelId, "bot", r);
    return;
  }

  // ── Hafızamı göster ───────────────────────────────────────────────────────
  if (/hakkımda ne (biliyorsun|hatırlıyorsun)|ne hatırlıyorsun/i.test(lower)) {
    const mems = await getAllMemories(guildId, userId);
    const r = mems.length > 0
      ? `💡 Sana ait hafızalarım:\n${mems.map((m, i) => `${i + 1}. ${m}`).join("\n")}`
      : `Henüz sana ait kayıtlı bir bilgim yok ${username}. Bir şeyler anlat!`;
    await send(message, r);
    addToHistory(channelId, "bot", r);
    return;
  }

  // ── Intent tespiti ────────────────────────────────────────────────────────
  const { intent, score } = detectIntent(rawText);

  // ── Öğrenme isteği ────────────────────────────────────────────────────────
  if (intent === "LEARN_FACT" || (score < 2 && /hatırla|ismim|adım|sevdiğim/i.test(lower))) {
    const fact = extractLearnableFact(rawText);
    if (fact) {
      await storeMemory(guildId, userId, "fact", fact);
      const r = reply.learned(fact);
      await send(message, r);
      addToHistory(channelId, "bot", r);
      return;
    }
  }

  // ── Matematik ─────────────────────────────────────────────────────────────
  if (intent === "MATH") {
    const math = evalMathExpr(rawText);
    if (math) {
      const formatted = Number.isInteger(math.result)
        ? math.result.toLocaleString("tr-TR")
        : math.result.toFixed(4);
      const r = reply.math(math.expr, formatted);
      await send(message, r);
      addToHistory(channelId, "bot", r);
      return;
    }
  }

  // ── Komut çalıştırma ──────────────────────────────────────────────────────
  if (intent === "COMMAND_RUN") {
    const trigger = extractCommandTrigger(rawText);
    if (trigger) {
      await message.channel.sendTyping().catch(() => null);
      const intro = reply.cmdIntro();
      await send(message, intro);
      const result = await executeToolCall(trigger.tool, trigger.params, message).catch(
        (err: unknown) => `❌ Hata: ${err instanceof Error ? err.message : String(err)}`
      );
      await send(message, result);
      addToHistory(channelId, "bot", `${intro}\n${result}`);
      return;
    }
    const r = "Bir komut çalıştırmak istediğini anladım ama kimi/neyi hedef aldığını göremedim. Örnek: `@VBRI ban at @kullanıcı kural ihlali`";
    await send(message, r);
    addToHistory(channelId, "bot", r);
    return;
  }

  // ── Komut listesi ─────────────────────────────────────────────────────────
  if (intent === "COMMAND_LIST" || /^(komutlar|yardım|help)[\s!?]*$/.test(lower)) {
    const r = buildCommandList();
    await send(message, r);
    addToHistory(channelId, "bot", r);
    return;
  }

  // ── Komut yardımı ─────────────────────────────────────────────────────────
  if (intent === "COMMAND_HELP") {
    const cmdNames = COMMANDS.flatMap((c) => c.names);
    const matched = cmdNames.find((n) => lower.includes(n));
    const r = matched ? buildCommandHelp(matched) : buildCommandList();
    await send(message, r);
    addToHistory(channelId, "bot", r);
    return;
  }

  // ── Karşılama ─────────────────────────────────────────────────────────────
  if (intent === "GREETING") {
    // Hafızadan bağlam çek
    const memCtx = await buildMemoryContext(guildId, userId, rawText);
    let r = reply.greeting(username);
    if (memCtx) r += `\n${memCtx}`;
    await send(message, r);
    addToHistory(channelId, "bot", r);
    return;
  }

  // ── Veda ─────────────────────────────────────────────────────────────────
  if (intent === "FAREWELL") {
    const r = reply.farewell(username);
    await send(message, r);
    addToHistory(channelId, "bot", r);
    return;
  }

  // ── Teşekkür ──────────────────────────────────────────────────────────────
  if (intent === "THANKS") {
    const r = reply.thanks(username);
    await send(message, r);
    addToHistory(channelId, "bot", r);
    return;
  }

  // ── İltifat ───────────────────────────────────────────────────────────────
  if (intent === "COMPLIMENT") {
    const r = reply.compliment(username);
    await send(message, r);
    addToHistory(channelId, "bot", r);
    return;
  }

  // ── Hakaret ───────────────────────────────────────────────────────────────
  if (intent === "INSULT") {
    const r = reply.insult(username);
    await send(message, r);
    addToHistory(channelId, "bot", r);
    return;
  }

  // ── Kim olduğunu soruyor ──────────────────────────────────────────────────
  if (intent === "SELF_QUESTION") {
    const r = reply.whoAmI();
    await send(message, r);
    addToHistory(channelId, "bot", r);
    return;
  }

  // ── Yetenek sorusu ────────────────────────────────────────────────────────
  if (intent === "CAPABILITY") {
    const r = reply.capability();
    await send(message, r);
    addToHistory(channelId, "bot", r);
    return;
  }

  // ── Espri ─────────────────────────────────────────────────────────────────
  if (intent === "JOKE") {
    const r = reply.joke();
    await send(message, r);
    addToHistory(channelId, "bot", r);
    return;
  }

  // ── Sunucu sorusu ─────────────────────────────────────────────────────────
  if (intent === "SERVER_QUESTION") {
    const r = reply.server();
    await send(message, r);
    addToHistory(channelId, "bot", r);
    return;
  }

  // ── Komut adı geçiyorsa yardım ver ───────────────────────────────────────
  {
    const cmdNames = COMMANDS.flatMap((c) => c.names);
    for (const name of cmdNames) {
      if (lower.includes(name) && lower.length < 80) {
        const r = buildCommandHelp(name);
        await send(message, r);
        addToHistory(channelId, "bot", r);
        return;
      }
    }
  }

  // ── Genel sohbet — hafıza & bağlam destekli ──────────────────────────────
  {
    const prev = lastBotReply(channelId);
    const memCtx = await buildMemoryContext(guildId, userId, rawText);

    let r: string;

    // Önceki yanıttan bağlam kurabiliyorsak
    if (prev && rawText.trim().length < 20) {
      r = `Hmm, yani "${rawText.trim()}" mi demek istiyorsun? Biraz daha açar mısın?`;
    } else if (memCtx) {
      r = `${reply.unknown()} (Aklımda: ${memCtx})`;
    } else {
      // Hafızaya öğrenebilir bir şey var mı kontrol et
      const potentialFact = extractLearnableFact(rawText);
      if (potentialFact) {
        await storeMemory(guildId, userId, "fact", potentialFact);
        r = reply.learned(potentialFact);
      } else {
        r = reply.unknown();
      }
    }

    await send(message, r);
    addToHistory(channelId, "bot", r);
  }
}

// ── Dışa açık giriş noktası ───────────────────────────────────────────────────

export async function handleVBRIEngine(message: Message): Promise<void> {
  const botId = message.client.user?.id;
  if (!botId) return;

  const rawText = message.content
    .replace(new RegExp(`<@!?${botId}>`, "g"), "")
    .replace(/\s+/g, " ")
    .trim();

  if (!rawText) {
    await message.reply("Beni etiketledin ama bir şey yazmadın? 👀").catch(() => null);
    return;
  }

  const now = Date.now();
  const remaining = COOLDOWN_MS - (now - (userCooldowns.get(message.author.id) ?? 0));
  if (remaining > 0) {
    await message.reply(`⏳ Biraz yavaş kanka, **${(remaining / 1000).toFixed(1)}sn** bekle.`).catch(() => null);
    return;
  }
  userCooldowns.set(message.author.id, now);

  const channelId = message.channelId;
  if (processingSet.has(channelId)) {
    await message.reply("🔄 Şu an başka bir mesajı işliyorum, bir saniye!").catch(() => null);
    return;
  }
  processingSet.add(channelId);
  await message.channel.sendTyping().catch(() => null);

  try {
    logger.info({ user: message.author.username, text: rawText.slice(0, 80) }, "VBRIaimotor mesaj");
    await processMessage(message, rawText);
  } catch (err: unknown) {
    logger.error({ err }, "VBRIaimotor hata");
    await message.reply("🤖 Bir şeyler ters gitti. Tekrar dener misin?").catch(() => null);
  } finally {
    processingSet.delete(channelId);
  }
}

// Re-export
export { clearHistory as clearChannelHistory, getHistorySize };
