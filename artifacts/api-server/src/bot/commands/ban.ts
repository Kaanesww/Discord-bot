import {
  ChatInputCommandInteraction,
  GuildMember,
  PermissionFlagsBits,
  SlashCommandBuilder,
  EmbedBuilder,
} from "discord.js";
import { logAction } from "../moderation";

export const data = new SlashCommandBuilder()
  .setName("ban")
  .setDescription("Bir kullanıcıyı sunucudan yasaklar")
  .addUserOption((o) => o.setName("kullanici").setDescription("Yasaklanacak kullanıcı").setRequired(true))
  .addStringOption((o) => o.setName("sebep").setDescription("Yasak sebebi").setRequired(false))
  .addIntegerOption((o) =>
    o.setName("mesaj_sil").setDescription("Son kaç günün mesajı silinsin? (0-7)").setMinValue(0).setMaxValue(7).setRequired(false),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "❌ Bu komut sadece sunucularda çalışır.", ephemeral: true });
    return;
  }

  const targetUser = interaction.options.getUser("kullanici", true);
  const sebep = interaction.options.getString("sebep") ?? "Sebep belirtilmedi";
  const deleteDays = interaction.options.getInteger("mesaj_sil") ?? 0;

  await interaction.deferReply();

  let member: GuildMember | null = null;
  try { member = await interaction.guild.members.fetch(targetUser.id); } catch { /* sunucuda değil olabilir */ }

  if (member && !member.bannable) {
    await interaction.editReply("❌ Bu kullanıcıyı yasaklayamıyorum. Rolü botunkinden yüksek olabilir.");
    return;
  }
  if (targetUser.id === interaction.user.id) {
    await interaction.editReply("❌ Kendini yasaklayamazsın!");
    return;
  }

  await interaction.guild.bans.create(targetUser.id, {
    reason: `${interaction.user.tag}: ${sebep}`,
    deleteMessageDays: deleteDays as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7,
  });

  await logAction({
    guildId: interaction.guildId!,
    userId: targetUser.id,
    moderatorId: interaction.user.id,
    action: "ban",
    reason: sebep,
  });

  const embed = new EmbedBuilder()
    .setColor(0xeb459e)
    .setTitle("🔨 Kullanıcı Yasaklandı")
    .setThumbnail(targetUser.displayAvatarURL())
    .addFields(
      { name: "Kullanıcı", value: `${targetUser.tag} (<@${targetUser.id}>)`, inline: true },
      { name: "Moderatör", value: `<@${interaction.user.id}>`, inline: true },
      { name: "Sebep", value: sebep },
    )
    .setTimestamp();
  await interaction.editReply({ embeds: [embed] });
}
