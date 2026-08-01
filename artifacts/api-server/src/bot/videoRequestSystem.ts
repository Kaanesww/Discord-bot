/**
 * Video Yükleme İstek Sistemi
 * ─────────────────────────────────────────────────────────────────────────────
 * Üyeler bot üzerinden video paylaşım isteği gönderir.
 * İstek moderasyon kanalına düşer; owner onaylarsa video hedef kanala yüklenir.
 */

import {
  type ButtonInteraction,
  type Message,
  EmbedBuilder,
  AttachmentBuilder,
  TextChannel,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} from "discord.js";
import { db } from "@workspace/db";
import { videoRequestSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

// ── Sabitler ──────────────────────────────────────────────────────────────────

const MAX_VIDEO_BYTES = 95 * 1024 * 1024; // 95 MB
const VIDEO_CONTENT_TYPES = new Set([
  "video/mp4", "video/webm", "video/mov", "video/avi",
  "video/mkv", "video/quicktime", "video/x-matroska",
]);
const VIDEO_EXTENSIONS = new Set([
  ".mp4", ".webm", ".mov", ".avi", ".mkv",
]);

// ── Bekleyen istek yapısı ─────────────────────────────────────────────────────

export interface PendingVideoRequest {
  guildId: string;
  requestorId: string;
  requestorTag: string;
  targetChannelId: string;
  description: string;
  attachmentUrl: string;
  attachmentName: string;
  attachmentSize: number;
  createdAt: number;
}

const pendingVideoRequests = new Map<string, PendingVideoRequest>();
let counter = 0;

function newReqId(): string {
  return `vr_${Date.now()}_${++counter}`;
}

// ── Ayarlar: DB erişim ────────────────────────────────────────────────────────

export async function getVideoModerationChannel(guildId: string): Promise<string | null> {
  const row = await db
    .select({ moderationChannelId: videoRequestSettingsTable.moderationChannelId })
    .from(videoRequestSettingsTable)
    .where(eq(videoRequestSettingsTable.guildId, guildId))
    .limit(1);
  return row[0]?.moderationChannelId ?? null;
}

export async function setVideoModerationChannel(
  guildId: string,
  channelId: string | null,
): Promise<void> {
  await db
    .insert(videoRequestSettingsTable)
    .values({ guildId, moderationChannelId: channelId ?? undefined })
    .onConflictDoUpdate({
      target: videoRequestSettingsTable.guildId,
      set: { moderationChannelId: channelId ?? undefined, updatedAt: new Date() },
    });
}

// ── Embed yapıcılar ───────────────────────────────────────────────────────────

function buildRequestEmbed(req: PendingVideoRequest, reqId: string): EmbedBuilder {
  const sizeMB = (req.attachmentSize / (1024 * 1024)).toFixed(2);
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("🎬 Video Paylaşım İsteği — Onay Bekleniyor")
    .addFields(
      { name: "📤 İsteyen Üye", value: `<@${req.requestorId}> (${req.requestorTag})`, inline: true },
      { name: "📺 Hedef Kanal", value: `<#${req.targetChannelId}>`, inline: true },
      { name: "📁 Dosya", value: `\`${req.attachmentName}\` (${sizeMB} MB)`, inline: false },
      { name: "📝 Açıklama", value: req.description || "_Açıklama girilmedi_" },
    )
    .setFooter({ text: `İstek ID: ${reqId} • 24 saat geçerli` })
    .setTimestamp();
}

function buildApprovalRow(reqId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`videoapprove_${reqId}`)
      .setLabel("✅ Onayla")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`videoreject_${reqId}`)
      .setLabel("❌ Reddet")
      .setStyle(ButtonStyle.Danger),
  );
}

// ── İstek gönder ─────────────────────────────────────────────────────────────

export async function sendVideoRequest(
  message: Message,
): Promise<void> {
  const client = message.client;
  if (!message.guildId || !message.guild) {
    await message.reply("❌ Bu komut sadece sunucularda kullanılabilir.");
    return;
  }

  // Argümanları ayrıştır: videoistek #kanal açıklama
  const content = message.content;
  const spaceIdx = content.indexOf(" ");
  const rest = spaceIdx !== -1 ? content.slice(spaceIdx + 1).trim() : "";

  // #kanal ve açıklama
  const channelMatch = rest.match(/^<#(\d+)>\s*(.*)/s);
  if (!channelMatch) {
    await message.reply(
      "❌ **Kullanım:** `v!videoistek #hedef-kanal Açıklama burada`\n" +
      "📎 Komutu kullanırken videoyı mesajına ekle (95 MB üst sınır)."
    );
    return;
  }

  const targetChannelId = channelMatch[1]!;
  const description = channelMatch[2]?.trim() ?? "";

  // Ek dosya var mı?
  const attachment = message.attachments.first();
  if (!attachment) {
    await message.reply("❌ Lütfen bir video dosyası ekleyerek bu komutu kullan.");
    return;
  }

  // Dosya boyutu kontrolü
  if (attachment.size > MAX_VIDEO_BYTES) {
    const mb = (attachment.size / (1024 * 1024)).toFixed(2);
    await message.reply(`❌ Video boyutu çok büyük: **${mb} MB**. Maksimum izin verilen: **95 MB**.`);
    return;
  }

  // Video uzantısı kontrolü
  const ext = attachment.name
    ? "." + attachment.name.split(".").pop()!.toLowerCase()
    : "";
  const isVideoExt = VIDEO_EXTENSIONS.has(ext);
  const isVideoType = attachment.contentType
    ? VIDEO_CONTENT_TYPES.has(attachment.contentType.split(";")[0]!.trim())
    : false;

  if (!isVideoExt && !isVideoType) {
    await message.reply(
      "❌ Desteklenen video formatları: MP4, WebM, MOV, AVI, MKV\n" +
      `Yüklenen dosya: \`${attachment.name}\``
    );
    return;
  }

  // Hedef kanal var mı?
  const targetChannel = message.guild.channels.cache.get(targetChannelId);
  if (!targetChannel || !(targetChannel instanceof TextChannel)) {
    await message.reply("❌ Belirtilen kanal bulunamadı veya bir yazı kanalı değil.");
    return;
  }

  // Moderasyon kanalı ayarlı mı?
  const modChannelId = await getVideoModerationChannel(message.guildId);
  if (!modChannelId) {
    await message.reply(
      "❌ Video moderasyon kanalı henüz ayarlanmamış.\n" +
      "Sunucu sahibi `v!videosetup #kanal` komutuyla ayarlayabilir."
    );
    return;
  }

  const modChannel = await client.channels.fetch(modChannelId).catch(() => null);
  if (!modChannel || !(modChannel instanceof TextChannel)) {
    await message.reply("❌ Moderasyon kanalına erişilemiyor. Lütfen sunucu sahibiyle iletişime geç.");
    return;
  }

  // İstek oluştur ve kaydet
  const req: PendingVideoRequest = {
    guildId: message.guildId,
    requestorId: message.author.id,
    requestorTag: message.author.tag,
    targetChannelId,
    description,
    attachmentUrl: attachment.url,
    attachmentName: attachment.name,
    attachmentSize: attachment.size,
    createdAt: Date.now(),
  };

  const reqId = newReqId();
  pendingVideoRequests.set(reqId, req);

  // 24 saat sonra otomatik temizle
  setTimeout(() => pendingVideoRequests.delete(reqId), 24 * 60 * 60 * 1000);

  // Moderasyon kanalına gönder
  await modChannel.send({
    embeds: [buildRequestEmbed(req, reqId)],
    components: [buildApprovalRow(reqId)],
  });

  await message.reply(
    `✅ Video isteğin **#${targetChannel.name}** kanalı için gönderildi!\n` +
    `📋 İsteğin moderasyon kanalında inceleniyor, onaylandığında video yüklenecek.`
  );

  logger.info({ reqId, guildId: message.guildId, requestorId: message.author.id }, "Video isteği gönderildi");
}

// ── Buton etkileşimi işle ─────────────────────────────────────────────────────

export async function handleVideoApprovalButton(interaction: ButtonInteraction): Promise<void> {
  const { customId } = interaction;
  const isApprove = customId.startsWith("videoapprove_");
  const reqId = customId.replace("videoapprove_", "").replace("videoreject_", "");
  const req = pendingVideoRequests.get(reqId);

  if (!req) {
    await interaction.reply({
      content: "❌ Bu istek artık geçerli değil veya süresi dolmuş.",
      ephemeral: true,
    });
    return;
  }

  if (!interaction.guild) {
    await interaction.reply({ content: "❌ Bu işlem bir sunucuda yapılmalıdır.", ephemeral: true });
    return;
  }

  // Sadece sunucu sahibi veya Yönetici yetkisine sahip kişiler onaylayabilir
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  const isGuildOwner = interaction.guild.ownerId === interaction.user.id;
  const isAdmin = member?.permissions.has("Administrator") ?? false;

  if (!isGuildOwner && !isAdmin) {
    await interaction.reply({
      content: "❌ Bu isteği onaylamak için **Yönetici** yetkisine ihtiyacın var.",
      ephemeral: true,
    });
    return;
  }

  pendingVideoRequests.delete(reqId);

  // ── Reddet ──────────────────────────────────────────────────────────────────
  if (!isApprove) {
    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor(0x72767d)
          .setTitle("❌ Video İsteği Reddedildi")
          .addFields(
            { name: "İsteyen", value: `<@${req.requestorId}> (${req.requestorTag})`, inline: true },
            { name: "Hedef Kanal", value: `<#${req.targetChannelId}>`, inline: true },
            { name: "Reddeden", value: `<@${interaction.user.id}>`, inline: true },
            { name: "Dosya", value: `\`${req.attachmentName}\`` },
          )
          .setTimestamp(),
      ],
      components: [],
    });

    // İsteyen kişiye DM gönder
    try {
      const requestor = await interaction.client.users.fetch(req.requestorId);
      await requestor.send(
        `❌ **${interaction.guild.name}** sunucusundaki video paylaşım isteğin ` +
        `**${interaction.user.tag}** tarafından reddedildi.\n` +
        `📁 Dosya: \`${req.attachmentName}\``
      );
    } catch { /* DM kapalı */ }

    logger.info({ reqId, reviewerId: interaction.user.id }, "Video isteği reddedildi");
    return;
  }

  // ── Onayla — videoyu hedef kanala yükle ─────────────────────────────────────
  try {
    const targetChannel = await interaction.client.channels.fetch(req.targetChannelId).catch(() => null);
    if (!targetChannel || !(targetChannel instanceof TextChannel)) {
      await interaction.reply({
        content: "❌ Hedef kanal bulunamadı veya erişilemiyor.",
        ephemeral: true,
      });
      return;
    }

    // Videoyu indir ve yükle
    const response = await fetch(req.attachmentUrl);
    if (!response.ok) throw new Error(`CDN isteği başarısız: ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());

    const sizeMB = (req.attachmentSize / (1024 * 1024)).toFixed(2);
    const videoEmbed = new EmbedBuilder()
      .setColor(0x57f287)
      .setDescription(req.description || null)
      .setFooter({
        text: `${req.requestorTag} tarafından paylaşıldı • ${sizeMB} MB`,
      })
      .setTimestamp();

    await targetChannel.send({
      embeds: req.description ? [videoEmbed] : [],
      files: [new AttachmentBuilder(buffer, { name: req.attachmentName })],
      content: req.description ? undefined : `📹 <@${req.requestorId}> tarafından paylaşıldı`,
    });

    // Onay mesajını güncelle
    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle("✅ Video İsteği Onaylandı — Yüklendi")
          .addFields(
            { name: "İsteyen", value: `<@${req.requestorId}> (${req.requestorTag})`, inline: true },
            { name: "Hedef Kanal", value: `<#${req.targetChannelId}>`, inline: true },
            { name: "Onaylayan", value: `<@${interaction.user.id}>`, inline: true },
            { name: "Dosya", value: `\`${req.attachmentName}\` (${sizeMB} MB)` },
          )
          .setTimestamp(),
      ],
      components: [],
    });

    // İsteyen kişiye bildir
    try {
      const requestor = await interaction.client.users.fetch(req.requestorId);
      await requestor.send(
        `✅ **${interaction.guild.name}** sunucusundaki video paylaşım isteğin ` +
        `**${interaction.user.tag}** tarafından onaylandı!\n` +
        `📺 Video <#${req.targetChannelId}> kanalına yüklendi.`
      );
    } catch { /* DM kapalı */ }

    logger.info({ reqId, reviewerId: interaction.user.id, targetChannelId: req.targetChannelId }, "Video isteği onaylandı ve yüklendi");

  } catch (err) {
    logger.error({ err, reqId }, "Video onay yükleme hatası");
    await interaction.reply({
      content: `❌ Video yüklenirken hata oluştu: ${(err as Error).message}`,
      ephemeral: true,
    }).catch(() => null);
  }
}
