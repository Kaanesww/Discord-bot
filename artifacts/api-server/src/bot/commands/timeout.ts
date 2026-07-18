import {
  ChatInputCommandInteraction,
  GuildMember,
  PermissionFlagsBits,
  SlashCommandBuilder,
  EmbedBuilder,
} from "discord.js";
import { logAction } from "../moderation";

export const data = new SlashCommandBuilder()
  .setName("timeout")
  .setDescription("Bir kullanıcıyı belirli süreliğine susturur")
  .addUserOption((o) => o.setName("kullanici").setDescription("Susturulacak kullanıcı").setRequired(true))
  .addIntegerOption((o) =>
    o.setName("dakika").setDescription("Süre (dakika, maks 40320 = 28 gün)").setMinValue(1).setMaxValue(40320).setRequired(true),
  )
  .addStringOption((o) => o.setName("sebep").setDescription("Sebep").setRequired(false))
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "❌ Bu komut sadece sunucularda çalışır.", ephemeral: true });
    return;
  }

  const targetUser = interaction.options.getUser("kullanici", true);
  const dakika = interaction.options.getInteger("dakika", true);
  const sebep = interaction.options.getString("sebep") ?? "Sebep belirtilmedi";

  await interaction.deferReply();

  let member: GuildMember;
  try { member = await interaction.guild.members.fetch(targetUser.id); }
  catch { await interaction.editReply("❌ Kullanıcı bu sunucuda bulunamadı."); return; }

  if (!member.moderatable) {
    await interaction.editReply("❌ Bu kullanıcıyı susturamıyorum. Rolü botunkinden yüksek olabilir.");
    return;
  }

  const ms = dakika * 60 * 1000;
  await member.timeout(ms, `${interaction.user.tag}: ${sebep}`);

  await logAction({
    guildId: interaction.guildId!,
    userId: targetUser.id,
    moderatorId: interaction.user.id,
    action: "timeout",
    reason: sebep,
    duration: dakika,
  });

  const sureStr = dakika < 60
    ? `${dakika} dakika`
    : dakika < 1440
      ? `${Math.round(dakika / 60)} saat`
      : `${Math.round(dakika / 1440)} gün`;

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("🔇 Kullanıcı Susturuldu")
    .setThumbnail(targetUser.displayAvatarURL())
    .addFields(
      { name: "Kullanıcı", value: `${targetUser.tag} (<@${targetUser.id}>)`, inline: true },
      { name: "Moderatör", value: `<@${interaction.user.id}>`, inline: true },
      { name: "Süre", value: sureStr, inline: true },
      { name: "Sebep", value: sebep },
    )
    .setTimestamp();
  await interaction.editReply({ embeds: [embed] });
}
