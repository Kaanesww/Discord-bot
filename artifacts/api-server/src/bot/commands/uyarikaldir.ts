import {
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
  EmbedBuilder,
} from "discord.js";
import { deactivateLog, getLogById } from "../moderation";

export const data = new SlashCommandBuilder()
  .setName("uyarikaldir")
  .setDescription("Belirli bir uyarıyı sicitten kaldırır")
  .addIntegerOption((o) =>
    o.setName("uyari_id").setDescription("Kaldırılacak uyarının ID'si (#XX)").setMinValue(1).setRequired(true),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ content: "❌ Bu komut sadece sunucularda çalışır.", ephemeral: true });
    return;
  }

  const id = interaction.options.getInteger("uyari_id", true);
  await interaction.deferReply();

  const existing = await getLogById(id, interaction.guildId);
  if (!existing || existing.action !== "warn") {
    await interaction.editReply(`❌ #${id} numaralı bir uyarı kaydı bulunamadı.`);
    return;
  }

  if (!existing.active) {
    await interaction.editReply(`❌ #${id} numaralı uyarı zaten kaldırılmış.`);
    return;
  }

  await deactivateLog(id, interaction.guildId);

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("✅ Uyarı Kaldırıldı")
    .addFields(
      { name: "Uyarı ID", value: `#${id}`, inline: true },
      { name: "Kullanıcı", value: `<@${existing.userId}>`, inline: true },
      { name: "Kaldıran", value: `<@${interaction.user.id}>`, inline: true },
      { name: "Orijinal Sebep", value: existing.reason ?? "Belirtilmemiş" },
    )
    .setTimestamp();
  await interaction.editReply({ embeds: [embed] });
}
