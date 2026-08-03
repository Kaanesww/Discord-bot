/**
 * Moderasyon Onay Sistemi
 * ──────────────────────────────────────────────────────────────────────────────
 * Yetkili rolündeki üyeler ban/kick komutu kullandığında istek onay kanalına
 * gönderilir. Üst Yetkili rolündeki üyeler isteği onaylayabilir veya reddeder.
 */

import {
  type ButtonInteraction,
  type Client,
  EmbedBuilder,
  AttachmentBuilder,
  TextChannel,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} from "discord.js";
import { logger } from "../lib/logger";
import { logAction } from "./moderation";
import { canApproveMod } from "./moderationSettings";

// ── Bekleyen istek yapısı ─────────────────────────────────────────────────────

export interface PendingRequest {
  type: "ban" | "kick";
  guildId: string;
  targetUserId: string;
  targetTag: string;
  targetAvatar: string;
  requestorId: string;
  requestorTag: string;
  reason: string;
  requestChannelId: string;
  createdAt: number;
}

// ── Hafıza içi istek kaydı ────────────────────────────────────────────────────

const pendingRequests = new Map<string, PendingRequest>();
let counter = 0;

function newReqId(): string {
  return `${Date.now()}_${++counter}`;
}

// ── Yardımcı: embed oluştur ───────────────────────────────────────────────────

function buildApprovalEmbed(req: PendingRequest, reqId: string): EmbedBuilder {
  const isBan = req.type === "ban";
  return new EmbedBuilder()
    .setColor(isBan ? 0xeb459e : 0xed4245)
    .setTitle(`${isBan ? "🔨 BAN" : "👢 KICK"} İsteği — Üst Yetkili Onayı Bekleniyor`)
    .setThumbnail(req.targetAvatar)
    .addFields(
      { name: "Hedef Kullanıcı", value: `<@${req.targetUserId}> (${req.targetTag})`, inline: true },
      { name: "İsteyen Yetkili", value: `<@${req.requestorId}> (${req.requestorTag})`, inline: true },
      { name: "Sebep", value: req.reason },
    )
    .setFooter({ text: `İstek ID: ${reqId} • Otomatik süresi 24 saat` })
    .setTimestamp();
}

function buildApprovalRow(reqId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`modapprove_${reqId}`)
      .setLabel("✅ Onayla")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`modreject_${reqId}`)
      .setLabel("❌ Reddet")
      .setStyle(ButtonStyle.Danger),
  );
}

// ── Dışa açık: onay kanalına istek gönder ────────────────────────────────────

export async function sendApprovalRequest(
  client: Client,
  approvalChannelId: string,
  req: PendingRequest,
): Promise<string> {
  const reqId = newReqId();
  pendingRequests.set(reqId, req);

  // 24 saat sonra otomatik temizle
  setTimeout(() => pendingRequests.delete(reqId), 24 * 60 * 60 * 1000);

  const ch = await client.channels.fetch(approvalChannelId).catch(() => null);
  if (!ch || !(ch instanceof TextChannel)) {
    pendingRequests.delete(reqId);
    throw new Error("Onay kanalı bulunamadı veya erişilemiyor.");
  }

  await ch.send({
    embeds: [buildApprovalEmbed(req, reqId)],
    components: [buildApprovalRow(reqId)],
  });

  return reqId;
}

// ── Dışa açık: buton etkileşimi işle ─────────────────────────────────────────

export async function handleApprovalButton(interaction: ButtonInteraction): Promise<void> {
  const { customId } = interaction;
  const isApprove = customId.startsWith("modapprove_");
  const reqId = customId.replace("modapprove_", "").replace("modreject_", "");
  const req = pendingRequests.get(reqId);

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

  // Onaylayan kişi üst yetkili mi?
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member || !(await canApproveMod(member, req.guildId))) {
    await interaction.reply({
      content: "❌ Bu isteği onaylamak için **Üst Yetkili** rolüne ihtiyacın var.",
      ephemeral: true,
    });
    return;
  }

  pendingRequests.delete(reqId);

  // ── Reddet ───────────────────────────────────────────────────────────────
  if (!isApprove) {
    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor(0x72767d)
          .setTitle("❌ İstek Reddedildi")
          .addFields(
            { name: "Hedef", value: `<@${req.targetUserId}>`, inline: true },
            { name: "İsteyen", value: `<@${req.requestorId}>`, inline: true },
            { name: "Reddeden", value: `<@${interaction.user.id}>`, inline: true },
          )
          .setTimestamp(),
      ],
      components: [],
    });
    // İsteyen kişiye bildir
    try {
      const requestor = await interaction.client.users.fetch(req.requestorId);
      await requestor.send(
        `❌ **${req.guildId}** sunucusundaki ${req.type === "ban" ? "ban" : "kick"} isteğin ` +
        `**${interaction.user.tag}** tarafından reddedildi.`
      );
    } catch { /* DM kapalı */ }
    return;
  }

  // ── Onayla — işlemi yürüt ────────────────────────────────────────────────
  try {
    const guild = await interaction.client.guilds.fetch(req.guildId).catch(() => null);
    if (!guild) throw new Error("Sunucu bulunamadı.");

    if (req.type === "ban") {
      await guild.bans.create(req.targetUserId, {
        reason: `[ONAY: ${interaction.user.tag}] ${req.requestorTag}: ${req.reason}`,
      });
    } else {
      const targetMember = await guild.members.fetch(req.targetUserId).catch(() => null);
      if (targetMember) {
        await targetMember.kick(`[ONAY: ${interaction.user.tag}] ${req.requestorTag}: ${req.reason}`);
      }
    }

    await logAction({
      guildId: req.guildId,
      userId: req.targetUserId,
      moderatorId: req.requestorId,
      action: req.type,
      reason: `[Onaylayan: ${interaction.user.tag}] ${req.reason}`,
    });

    const isBan = req.type === "ban";
    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor(isBan ? 0xeb459e : 0xed4245)
          .setTitle(`${isBan ? "🔨" : "👢"} Onaylandı — Kullanıcı ${isBan ? "Yasaklandı" : "Atıldı"}`)
          .addFields(
            { name: "Kullanıcı", value: `<@${req.targetUserId}> (${req.targetTag})`, inline: true },
            { name: "Onaylayan", value: `<@${interaction.user.id}>`, inline: true },
            { name: "İsteyen", value: `<@${req.requestorId}>`, inline: true },
            { name: "Sebep", value: req.reason },
          )
          .setTimestamp(),
      ],
      components: [],
    });

    // İsteyen kişiye bildir
    try {
      const requestor = await interaction.client.users.fetch(req.requestorId);
      await requestor.send(
        `✅ **${req.guildId}** sunucusundaki ${isBan ? "ban" : "kick"} isteğin ` +
        `**${interaction.user.tag}** tarafından onaylandı.`
      );
    } catch { /* DM kapalı */ }

  } catch (err) {
    logger.error({ err }, "Onay işlemi hatası");
    await interaction.reply({
      content: `❌ İşlem sırasında hata oluştu: ${(err as Error).message}`,
      ephemeral: true,
    });
  }
}
