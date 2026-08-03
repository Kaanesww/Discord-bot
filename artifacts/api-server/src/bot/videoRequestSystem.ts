/**
 * Medya Paylaşım İstek Sistemi  (v!paylaş)
 * ─────────────────────────────────────────────────────────────────────────────
 * Üyeler birden fazla video/fotoğraf ekleyerek paylaşım isteği gönderir.
 * İstek mod kanalına düşer; onaylayan roller veya yöneticiler karar verir.
 * Dosyalar gönderim anında indirilip bellekte tutulur → CDN URL süresi sorun olmaz.
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
  PermissionFlagsBits,
} from "discord.js";
import { db } from "@workspace/db";
import { videoRequestSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

// ── Sabitler ──────────────────────────────────────────────────────────────────

const MAX_FILE_BYTES  = 95 * 1024 * 1024; // 95 MB tek dosya
const MAX_TOTAL_BYTES = 95 * 1024 * 1024; // 95 MB toplam

const VIDEO_EXTENSIONS = new Set([".mp4", ".webm", ".mov", ".avi", ".mkv"]);
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);
const ALLOWED_EXTENSIONS = new Set([...VIDEO_EXTENSIONS, ...IMAGE_EXTENSIONS]);

const VIDEO_CONTENT_TYPES = new Set([
  "video/mp4", "video/webm", "video/mov", "video/avi",
  "video/mkv", "video/quicktime", "video/x-matroska",
]);
const IMAGE_CONTENT_TYPES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp",
]);

// ── Dosya yapısı (bellekte saklanan) ─────────────────────────────────────────

interface StoredFile {
  name: string;
  buffer: Buffer;
  size: number;
  isVideo: boolean;
}

// ── Bekleyen istek yapısı ─────────────────────────────────────────────────────

export interface PendingMediaRequest {
  guildId: string;
  requestorId: string;
  requestorTag: string;
  targetChannelId: string;
  description: string;
  files: StoredFile[];
  createdAt: number;
}

const pendingRequests = new Map<string, PendingMediaRequest>();
let counter = 0;

function newReqId(): string {
  return `mr_${Date.now()}_${++counter}`;
}

// ── DB: Ayarlar ───────────────────────────────────────────────────────────────

export async function getVideoSettings(guildId: string) {
  const rows = await db
    .select()
    .from(videoRequestSettingsTable)
    .where(eq(videoRequestSettingsTable.guildId, guildId))
    .limit(1);
  const row = rows[0];
  return {
    moderationChannelId: row?.moderationChannelId ?? null,
    approvalRoles: JSON.parse(row?.approvalRoles ?? "[]") as string[],
  };
}

export async function setVideoModerationChannel(guildId: string, channelId: string | null): Promise<void> {
  await db
    .insert(videoRequestSettingsTable)
    .values({ guildId, moderationChannelId: channelId })
    .onConflictDoUpdate({
      target: videoRequestSettingsTable.guildId,
      set: { moderationChannelId: channelId, updatedAt: new Date() },
    });
}

export async function addApprovalRole(guildId: string, roleId: string): Promise<string[]> {
  const s = await getVideoSettings(guildId);
  if (!s.approvalRoles.includes(roleId)) s.approvalRoles.push(roleId);
  await db
    .insert(videoRequestSettingsTable)
    .values({ guildId, approvalRoles: JSON.stringify(s.approvalRoles) })
    .onConflictDoUpdate({
      target: videoRequestSettingsTable.guildId,
      set: { approvalRoles: JSON.stringify(s.approvalRoles), updatedAt: new Date() },
    });
  return s.approvalRoles;
}

export async function removeApprovalRole(guildId: string, roleId: string): Promise<string[]> {
  const s = await getVideoSettings(guildId);
  const updated = s.approvalRoles.filter((r) => r !== roleId);
  await db
    .insert(videoRequestSettingsTable)
    .values({ guildId, approvalRoles: JSON.stringify(updated) })
    .onConflictDoUpdate({
      target: videoRequestSettingsTable.guildId,
      set: { approvalRoles: JSON.stringify(updated), updatedAt: new Date() },
    });
  return updated;
}

// ── Eski uyumluluk export ─────────────────────────────────────────────────────
export async function getVideoModerationChannel(guildId: string): Promise<string | null> {
  return (await getVideoSettings(guildId)).moderationChannelId;
}

// ── Davet linki ayarla / getir ────────────────────────────────────────────────
export async function setInviteUrl(guildId: string, inviteUrl: string | null): Promise<void> {
  await db
    .insert(videoRequestSettingsTable)
    .values({ guildId, inviteUrl })
    .onConflictDoUpdate({
      target: videoRequestSettingsTable.guildId,
      set: { inviteUrl, updatedAt: new Date() },
    });
}

export async function getInviteUrl(guildId: string): Promise<string | null> {
  return (await getVideoSettings(guildId)).inviteUrl ?? null;
}

// ── Yetki kontrolü ────────────────────────────────────────────────────────────

async function canApprove(interaction: ButtonInteraction, guildId: string): Promise<boolean> {
  if (!interaction.guild) return false;
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) return false;
  if (interaction.guild.ownerId === interaction.user.id) return true;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;

  const settings = await getVideoSettings(guildId);
  if (settings.approvalRoles.length > 0) {
    return settings.approvalRoles.some((rid) => member.roles.cache.has(rid));
  }
  return false;
}

// ── Embed yapıcılar ───────────────────────────────────────────────────────────

function buildRequestEmbed(req: PendingMediaRequest, reqId: string): EmbedBuilder {
  const totalMB = (req.files.reduce((a, f) => a + f.size, 0) / 1024 / 1024).toFixed(2);
  const videoCount = req.files.filter((f) => f.isVideo).length;
  const imageCount = req.files.filter((f) => !f.isVideo).length;

  const typeLine = [
    videoCount > 0 ? `🎬 ${videoCount} video` : "",
    imageCount > 0 ? `🖼️ ${imageCount} fotoğraf` : "",
  ].filter(Boolean).join(" • ");

  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("📤 Medya Paylaşım İsteği — Onay Bekleniyor")
    .addFields(
      { name: "👤 İsteyen", value: `<@${req.requestorId}> (${req.requestorTag})`, inline: true },
      { name: "📺 Hedef Kanal", value: `<#${req.targetChannelId}>`, inline: true },
      { name: "📦 Dosyalar", value: `${typeLine} • Toplam **${totalMB} MB**`, inline: false },
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

// ── Dosya türü kontrolü ───────────────────────────────────────────────────────

function checkFileType(name: string, contentType: string | null): "video" | "image" | null {
  const ext = ("." + (name.split(".").pop() ?? "")).toLowerCase();
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  const ct = (contentType ?? "").split(";")[0]!.trim();
  if (VIDEO_CONTENT_TYPES.has(ct)) return "video";
  if (IMAGE_CONTENT_TYPES.has(ct)) return "image";
  return null;
}

// ── Ana komut: v!paylaş ───────────────────────────────────────────────────────

export async function sendMediaRequest(message: Message): Promise<void> {
  const client = message.client;
  if (!message.guildId || !message.guild) {
    await message.reply("❌ Bu komut sadece sunucularda kullanılabilir.");
    return;
  }

  // Argümanlar: paylaş #kanal açıklama
  const prefix = message.content.split(" ")[0]!;
  const rest   = message.content.slice(prefix.length).trim();

  const channelMatch = rest.match(/^<#(\d+)>\s*(.*)/s);
  if (!channelMatch) {
    await message.reply(
      "❌ **Kullanım:** `v!paylaş #hedef-kanal Açıklama`\n" +
      "📎 Video ve/veya fotoğraf ekle (her biri maks 95 MB)\n" +
      "💡 Birden fazla dosya aynı mesaja eklenebilir."
    );
    return;
  }

  const targetChannelId = channelMatch[1]!;
  const description     = channelMatch[2]?.trim() ?? "";

  // Ek dosyalar
  const attachments = [...message.attachments.values()];
  if (attachments.length === 0) {
    await message.reply("❌ Lütfen en az bir video veya fotoğraf ekle.");
    return;
  }

  // Her dosyayı doğrula
  const invalid: string[] = [];
  let totalSize = 0;

  for (const att of attachments) {
    const kind = checkFileType(att.name, att.contentType);
    if (!kind) {
      invalid.push(`\`${att.name}\` — desteklenmeyen tür`);
      continue;
    }
    if (att.size > MAX_FILE_BYTES) {
      const mb = (att.size / 1024 / 1024).toFixed(2);
      invalid.push(`\`${att.name}\` — ${mb} MB (maks 95 MB)`);
      continue;
    }
    totalSize += att.size;
  }

  if (invalid.length > 0) {
    await message.reply(
      `❌ Şu dosyalar kabul edilemedi:\n${invalid.map((e) => `• ${e}`).join("\n")}\n\n` +
      `Desteklenen formatlar: MP4, WebM, MOV, AVI, MKV, JPG, PNG, GIF, WEBP`
    );
    return;
  }

  if (totalSize > MAX_TOTAL_BYTES) {
    await message.reply(`❌ Toplam dosya boyutu maks **95 MB** olabilir. Şu an: **${(totalSize / 1024 / 1024).toFixed(2)} MB**`);
    return;
  }

  // Hedef kanal
  const targetChannel = message.guild.channels.cache.get(targetChannelId);
  if (!targetChannel || !(targetChannel instanceof TextChannel)) {
    await message.reply("❌ Belirtilen kanal bulunamadı veya bir yazı kanalı değil.");
    return;
  }

  // Mod kanalı
  const settings = await getVideoSettings(message.guildId);
  if (!settings.moderationChannelId) {
    await message.reply(
      "❌ Medya moderasyon kanalı ayarlanmamış.\n" +
      "Sunucu sahibi `v!videosetup #kanal` ile ayarlayabilir."
    );
    return;
  }

  const modChannel = await client.channels.fetch(settings.moderationChannelId).catch(() => null);
  if (!modChannel || !(modChannel instanceof TextChannel)) {
    await message.reply("❌ Moderasyon kanalına erişilemiyor.");
    return;
  }

  // Onay rolü bilgisi
  const rolesMention = settings.approvalRoles.length > 0
    ? settings.approvalRoles.map((r) => `<@&${r}>`).join(", ")
    : "_Yöneticiler_";

  await message.reply("⏳ Dosyalar işleniyor, isteğin gönderiliyor...");

  // Tüm dosyaları şimdi indir (URL henüz taze)
  const stored: StoredFile[] = [];
  try {
    for (const att of attachments) {
      const kind = checkFileType(att.name, att.contentType)!;
      const res  = await fetch(att.url);
      if (!res.ok) throw new Error(`${att.name} indirilemedi (HTTP ${res.status})`);
      const buffer = Buffer.from(await res.arrayBuffer());
      stored.push({ name: att.name, buffer, size: att.size, isVideo: kind === "video" });
    }
  } catch (err) {
    logger.error({ err }, "Dosya indirme hatası");
    await message.reply(`❌ Dosya indirilemedi: ${(err as Error).message}`);
    return;
  }

  const req: PendingMediaRequest = {
    guildId: message.guildId,
    requestorId: message.author.id,
    requestorTag: message.author.tag,
    targetChannelId,
    description,
    files: stored,
    createdAt: Date.now(),
  };

  const reqId = newReqId();
  pendingRequests.set(reqId, req);
  setTimeout(() => pendingRequests.delete(reqId), 24 * 60 * 60 * 1000);

  // Mod kanalına embed + dosyalar gönder
  await modChannel.send({
    content: `📬 Onay bekleyen medya isteği | Onaylayabilecekler: ${rolesMention}`,
    embeds:  [buildRequestEmbed(req, reqId)],
    components: [buildApprovalRow(reqId)],
    files: stored.map((f) => new AttachmentBuilder(f.buffer, { name: f.name })),
  });

  await message.reply(
    `✅ İsteğin **#${targetChannel.name}** kanalı için gönderildi!\n` +
    `📋 Moderasyon kanalında inceleniyor — onaylandığında yüklenecek.`
  );

  logger.info({ reqId, guildId: message.guildId, files: stored.length }, "Medya isteği gönderildi");
}

// ── Buton etkileşimi ─────────────────────────────────────────────────────────

export async function handleVideoApprovalButton(interaction: ButtonInteraction): Promise<void> {
  const { customId } = interaction;
  const isApprove = customId.startsWith("videoapprove_");
  const reqId = customId.replace("videoapprove_", "").replace("videoreject_", "");

  const req = pendingRequests.get(reqId);

  if (!req) {
    await interaction.reply({
      content: "❌ Bu istek artık geçerli değil veya süresi dolmuş (24 saat).",
      ephemeral: true,
    });
    return;
  }

  if (!interaction.guild) {
    await interaction.reply({ content: "❌ Sunucuda kullanılmalıdır.", ephemeral: true });
    return;
  }

  // Yetki kontrolü
  const allowed = await canApprove(interaction, req.guildId);
  if (!allowed) {
    const settings = await getVideoSettings(req.guildId);
    const roleList = settings.approvalRoles.length > 0
      ? settings.approvalRoles.map((r) => `<@&${r}>`).join(", ")
      : "Yönetici";
    await interaction.reply({
      content: `❌ Bu isteği onaylamak için gerekli role sahip değilsin.\n📋 Onaylayabilecekler: ${roleList}`,
      ephemeral: true,
    });
    return;
  }

  // İsteği bellekten kaldır
  pendingRequests.delete(reqId);

  const videoCount = req.files.filter((f) => f.isVideo).length;
  const imageCount = req.files.filter((f) => !f.isVideo).length;
  const totalMB    = (req.files.reduce((a, f) => a + f.size, 0) / 1024 / 1024).toFixed(2);

  const typeLine = [
    videoCount > 0 ? `${videoCount} video` : "",
    imageCount > 0 ? `${imageCount} fotoğraf` : "",
  ].filter(Boolean).join(", ");

  // ── Reddet ──────────────────────────────────────────────────────────────────
  if (!isApprove) {
    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor(0x72767d)
          .setTitle("❌ Medya İsteği Reddedildi")
          .addFields(
            { name: "İsteyen",     value: `<@${req.requestorId}> (${req.requestorTag})`, inline: true },
            { name: "Hedef Kanal", value: `<#${req.targetChannelId}>`,                   inline: true },
            { name: "Reddeden",    value: `<@${interaction.user.id}>`,                   inline: true },
            { name: "Dosyalar",    value: typeLine || "—" },
          )
          .setTimestamp(),
      ],
      components: [],
    });

    try {
      const requestor = await interaction.client.users.fetch(req.requestorId);
      await requestor.send(
        `❌ **${interaction.guild.name}** sunucusundaki medya paylaşım isteğin ` +
        `**${interaction.user.tag}** tarafından reddedildi.`
      );
    } catch { /* DM kapalı */ }

    logger.info({ reqId, reviewer: interaction.user.id }, "Medya isteği reddedildi");
    return;
  }

  // ── Onayla ──────────────────────────────────────────────────────────────────
  // Önce interaction'ı güncelle (3 sn timeout'u önlemek için)
  await interaction.update({
    embeds: [
      new EmbedBuilder()
        .setColor(0xfee75c)
        .setTitle("⏳ Onaylandı — Yükleniyor...")
        .setDescription("Dosyalar hedef kanala yükleniyor, lütfen bekle.")
        .setTimestamp(),
    ],
    components: [],
  });

  try {
    const targetChannel = await interaction.client.channels.fetch(req.targetChannelId).catch(() => null);
    if (!targetChannel || !(targetChannel instanceof TextChannel)) {
      await interaction.editReply({ content: "❌ Hedef kanal bulunamadı." });
      return;
    }

    // ── Sunucu davet linki (önce DB'den al) ──────────────────────────────────
    let inviteUrl = await getInviteUrl(req.guildId).catch(() => null);

    // DB'de yoksa otomatik oluşturmaya çalış
    if (!inviteUrl) {
      try {
        const invites = await interaction.guild.invites.fetch().catch(() => null);
        const existing = invites?.find((inv) => inv.maxAge === 0 && !inv.temporary);
        if (existing) {
          inviteUrl = existing.url;
        } else {
          const inv = await targetChannel.createInvite({
            maxAge: 0, maxUses: 0, unique: false,
            reason: "Video paylaşım davet linki",
          });
          inviteUrl = inv.url;
        }
      } catch { /* davet izni yoksa sessizce geç */ }
    }

    // Embed + dosyaları hedef kanala gönder
    const contentEmbed = new EmbedBuilder()
      .setColor(0x57f287)
      .setFooter({ text: `${typeLine} • ${totalMB} MB` })
      .setTimestamp();

    if (req.description) contentEmbed.setDescription(req.description);

    // ── Davet linki sol üst köşede belirgin şekilde gözükecek biçimde ────────
    // Discord'da content (metin), embed ve dosyalardan ÖNCE gösterilir
    // Büyük bold + link formatı ile sol üstte yeterince dikkat çekici olur
    const contentText = inviteUrl
      ? `\`╔══════════════════════╗\`\n\`║\` 🔗 **${interaction.guild.name}** → **${inviteUrl}**\n\`╚══════════════════════╝\``
      : undefined;

    await targetChannel.send({
      content: contentText,
      embeds: req.description ? [contentEmbed] : [],
      files:  req.files.map((f) => new AttachmentBuilder(f.buffer, { name: f.name })),
    });

    // Mod mesajını güncelle
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle("✅ Medya İsteği Onaylandı")
          .addFields(
            { name: "İsteyen",     value: `<@${req.requestorId}> (${req.requestorTag})`, inline: true },
            { name: "Hedef Kanal", value: `<#${req.targetChannelId}>`,                   inline: true },
            { name: "Onaylayan",   value: `<@${interaction.user.id}>`,                   inline: true },
            { name: "Dosyalar",    value: `${typeLine} • ${totalMB} MB` },
          )
          .setTimestamp(),
      ],
    });

    try {
      const requestor = await interaction.client.users.fetch(req.requestorId);
      await requestor.send(
        `✅ **${interaction.guild.name}** sunucusundaki medya paylaşım isteğin ` +
        `**${interaction.user.tag}** tarafından onaylandı!\n` +
        `📺 <#${req.targetChannelId}> kanalına yüklendi.`
      );
    } catch { /* DM kapalı */ }

    logger.info({ reqId, reviewer: interaction.user.id, target: req.targetChannelId }, "Medya onaylandı ve yüklendi");

  } catch (err) {
    logger.error({ err, reqId }, "Medya yükleme hatası");
    await interaction.editReply({
      content: `❌ Yükleme sırasında hata: ${(err as Error).message}`,
      embeds: [],
    }).catch(() => null);
  }
}
