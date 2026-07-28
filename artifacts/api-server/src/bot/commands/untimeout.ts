import {
  ChatInputCommandInteraction,
  GuildMember,
  PermissionFlagsBits,
  SlashCommandBuilder,
  EmbedBuilder,
} from "discord.js";
import { logAction } from "../moderation";

export const data = new SlashCommandBuilder()
  .setName("untimeout")
  .setDescription("Kullanıcının timeout'unu kaldırır")
  .addUserOption((o) => o.setName("kullanici").setDescription("Kullanıcı").setRequired(true))
  .addStringOption((o) => o.setName("sebep").setDescription("Sebep").setRequired(false))
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "❌ Bu komut sadece sunucularda çalışır.", ephemeral: true });
    return;
  }

  const targetUser = interaction.options.getUser("kullanici", true);
  const sebep = interaction.options.getString("sebep") ?? "Sebep belirtilmedi";

  await interaction.deferReply();

  let member: GuildMember;
  try { member = await interaction.guild.members.fetch(targetUser.id); }
  catch { await interaction.editReply("❌ Kullanıcı bu sunucuda bulunamadı."); return; }

  if (!member.isCommunicationDisabled()) {
    await interaction.editReply("❌ Bu kullanıcının aktif bir timeout'u yok.");
    return;
  }

  await member.timeout(null, `${interaction.user.tag}: ${sebep}`);

  await logAction({
    guildId: interaction.guildId!,
    userId: targetUser.id,
    moderatorId: interaction.user.id,
    action: "untimeout",
    reason: sebep,
  });

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("🔊 Timeout Kaldırıldı")
    .setThumbnail(targetUser.displayAvatarURL())
    .addFields(
      { name: "Kullanıcı", value: `${targetUser.tag} (<@${targetUser.id}>)`, inline: true },
      { name: "Moderatör", value: `<@${interaction.user.id}>`, inline: true },
      { name: "Sebep", value: sebep },
    )
    .setTimestamp();
  await interaction.editReply({ embeds: [embed] });
}
