import {
  ChatInputCommandInteraction, PermissionFlagsBits, SlashCommandBuilder, EmbedBuilder,
} from "discord.js";
import { logAction } from "../moderation";
import { isOwner } from "../ownerUtils";

export const data = new SlashCommandBuilder()
  .setName("unban")
  .setDescription("Yasaklı bir kullanıcının yasağını kaldırır")
  .addStringOption((o) => o.setName("kullanici_id").setDescription("Yasağı kaldırılacak kullanıcının ID'si").setRequired(true))
  .addStringOption((o) => o.setName("sebep").setDescription("Sebep").setRequired(false))
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) { await interaction.reply({ content: "❌ Bu komut sadece sunucularda çalışır.", ephemeral: true }); return; }

  if (!isOwner(interaction.user.id) && !interaction.memberPermissions?.has(PermissionFlagsBits.BanMembers)) {
    await interaction.reply({ content: "❌ **Ban Members** iznin yok.", ephemeral: true }); return;
  }

  const userId = interaction.options.getString("kullanici_id", true).trim();
  const sebep = interaction.options.getString("sebep") ?? "Sebep belirtilmedi";
  await interaction.deferReply();

  let bannedUser;
  try { bannedUser = await interaction.guild.bans.fetch(userId); }
  catch { await interaction.editReply("❌ Bu ID ile yasaklı bir kullanıcı bulunamadı."); return; }

  await interaction.guild.bans.remove(userId, `${interaction.user.tag}: ${sebep}`);
  await logAction({ guildId: interaction.guildId!, userId, moderatorId: interaction.user.id, action: "unban", reason: sebep });

  const embed = new EmbedBuilder().setColor(0x57f287).setTitle("✅ Yasak Kaldırıldı")
    .setThumbnail(bannedUser.user.displayAvatarURL())
    .addFields(
      { name: "Kullanıcı", value: `${bannedUser.user.tag} (${userId})`, inline: true },
      { name: "Moderatör", value: `<@${interaction.user.id}>`, inline: true },
      { name: "Sebep", value: sebep },
    ).setTimestamp();
  await interaction.editReply({ embeds: [embed] });
}
