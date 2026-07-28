import {
  ChatInputCommandInteraction, PermissionFlagsBits, SlashCommandBuilder, EmbedBuilder,
} from "discord.js";
import { logAction, getUserLogs } from "../moderation";
import { isOwner } from "../ownerUtils";

export const data = new SlashCommandBuilder()
  .setName("warn")
  .setDescription("Bir kullanıcıya uyarı verir")
  .addUserOption((o) => o.setName("kullanici").setDescription("Uyarılacak kullanıcı").setRequired(true))
  .addStringOption((o) => o.setName("sebep").setDescription("Uyarı sebebi").setRequired(false))
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) { await interaction.reply({ content: "❌ Bu komut sadece sunucularda çalışır.", ephemeral: true }); return; }

  if (!isOwner(interaction.user.id) && !interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)) {
    await interaction.reply({ content: "❌ **Moderate Members** iznin yok.", ephemeral: true }); return;
  }

  const targetUser = interaction.options.getUser("kullanici", true);
  const sebep = interaction.options.getString("sebep") ?? "Sebep belirtilmedi";
  if (targetUser.id === interaction.user.id) { await interaction.reply({ content: "❌ Kendine uyarı veremezsin!", ephemeral: true }); return; }
  await interaction.deferReply();

  const log = await logAction({ guildId: interaction.guildId, userId: targetUser.id, moderatorId: interaction.user.id, action: "warn", reason: sebep });
  const allWarns = (await getUserLogs(targetUser.id, interaction.guildId)).filter((l) => l.action === "warn" && l.active);

  const embed = new EmbedBuilder().setColor(0xfaa61a).setTitle("⚠️ Uyarı Verildi")
    .setThumbnail(targetUser.displayAvatarURL())
    .addFields(
      { name: "Kullanıcı", value: `${targetUser.tag} (<@${targetUser.id}>)`, inline: true },
      { name: "Moderatör", value: `<@${interaction.user.id}>`, inline: true },
      { name: "Uyarı ID", value: `#${log.id}`, inline: true },
      { name: "Sebep", value: sebep },
      { name: "Toplam Aktif Uyarı", value: `${allWarns.length}`, inline: true },
    ).setTimestamp();

  await interaction.editReply({ embeds: [embed] });
  try { await targetUser.send(`⚠️ **${interaction.guild?.name}** sunucusunda uyarı aldın!\n**Sebep:** ${sebep}\n**Uyarı ID:** #${log.id}`); } catch { /* DM kapalı */ }
}
