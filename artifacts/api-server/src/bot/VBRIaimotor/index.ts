/**
 * VBRIaimotor — Ana Giriş Noktası
 * Sohbet + Kod Üretme birleşik handler.
 */

import type { Message } from "discord.js";
import { logger } from "../../lib/logger";
import { handleVBRIEngine, clearChannelHistory, getHistorySize } from "./engine";
import {
  generateCommand, saveGeneratedCommand,
  setPendingCode, getPendingCode, clearPendingCode,
} from "./codeWriter";
import { detectIntent } from "./patterns";
import { reply } from "./personality";
import { isOwner } from "../ownerUtils";
import { addToHistory } from "./memory";

// ── Sohbet handler (etiketlenme ile tetiklenir) ───────────────────────────────

export async function handleVBRIaimotor(message: Message): Promise<void> {
  await handleVBRIEngine(message);
}

// ── Kod kanalı handler ────────────────────────────────────────────────────────

export async function handleCodeChannel(message: Message): Promise<void> {
  if (!isOwner(message.author.id) && message.guild?.ownerId !== message.author.id) {
    await message.reply("🔒 Bu kanal sadece bot sahibi için. Yetkisiz erişim.").catch(() => null);
    return;
  }

  const text = message.content.trim();
  if (!text) return;

  const channelId = message.channelId;
  const pending = getPendingCode(channelId);
  const { intent } = detectIntent(text);

  // ── Bekleyen kod var mı? ──────────────────────────────────────────────────
  if (pending) {
    // Onayla
    if (intent === "CODE_APPROVE") {
      await message.channel.sendTyping().catch(() => null);
      try {
        await saveGeneratedCommand(pending);
        const r = reply.codeApproved(pending.commandName);
        await message.reply(r).catch(() => null);
        logger.info({ cmd: pending.commandName }, "VBRIaimotor: komut kaydedildi");
      } catch (err) {
        await message.reply(`❌ Kaydetme hatası: ${err instanceof Error ? err.message : "Bilinmeyen hata"}`).catch(() => null);
      } finally {
        clearPendingCode(channelId);
      }
      return;
    }

    // Reddet / iptal
    if (intent === "CODE_REJECT") {
      clearPendingCode(channelId);
      const r = reply.codeRejected();
      await message.reply(r).catch(() => null);
      return;
    }

    // Revize isteği
    if (intent === "CODE_REVISE" || text.toLowerCase().startsWith("düzenle")) {
      const revisedDesc = text.replace(/^(düzenle|değiştir|revize|güncelle)[:\s]+/i, "").trim();
      const newDesc = revisedDesc || pending.description;
      await message.channel.sendTyping().catch(() => null);
      const updated = generateCommand(newDesc);
      setPendingCode(channelId, updated);

      await message.reply(
        `🔄 **Revize edildi — \`/${updated.commandName}\`**\n` +
        `Kategori: \`${updated.category}\`\n\n` +
        `\`\`\`typescript\n${updated.code}\n\`\`\`\n\n` +
        `✅ **onayla** — Kaydet | ❌ **iptal** — Vazgeç | 🔄 **düzenle: ...** — Revize et`
      ).catch(() => null);
      return;
    }
  }

  // ── Yeni kod üretme isteği ────────────────────────────────────────────────

  // Kısa mesajlar komut isteği sayılmaz (sohbet amaçlı olabilir)
  if (text.length < 10) {
    await message.reply(
      `🤖 **VBRİ code** kanalına hoş geldin!\n\nYeni bir Discord komutu oluşturmak için açıkla:\n` +
      `_"Kullanıcılara bakiye gösteren bir ekonomi komutu yap"_\n` +
      `_"Moderatörlerin kullanıcı uyarmasını sağlayan warn komutu"_\n\n` +
      `Ben de sana TypeScript kodu yazayım. ⚡`
    ).catch(() => null);
    return;
  }

  logger.info({ author: message.author.username, text: text.slice(0, 100) }, "VBRIaimotor: kod isteği");
  await message.channel.sendTyping().catch(() => null);

  const buildMsg = reply.codeBuilding();
  const buildReply = await message.reply(buildMsg).catch(() => null);

  try {
    const cmd = generateCommand(text);
    setPendingCode(channelId, cmd);

    const preview =
      `⚙️ **Komut Üretildi — \`/${cmd.commandName}\`**\n` +
      `Kategori: \`${cmd.category}\`\n\n` +
      `\`\`\`typescript\n${cmd.code}\n\`\`\`\n\n` +
      `✅ **onayla** — Kaydet & Aktif et\n` +
      `❌ **iptal** — Vazgeç\n` +
      `🔄 **düzenle: [açıklama]** — Revize et`;

    await buildReply?.delete().catch(() => null);
    await message.channel.send(preview).catch(() => null);

  } catch (err) {
    logger.error({ err }, "VBRIaimotor: kod üretme hatası");
    await buildReply?.edit("❌ Kod üretilemedi. Açıklamayı daha detaylı yazar mısın?").catch(() => null);
  }
}

// ── Re-exports ────────────────────────────────────────────────────────────────

export { clearChannelHistory, getHistorySize };
