import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getBalance } from "../economy";

export const data = new SlashCommandBuilder()
  .setName("bakiye")
  .setDescription("Coin bakiyeni gösterir")
  .addUserOption((o) => o.setName("kullanici").setDescription("Başkasının bakiyesi").setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) { await interaction.reply({ content: "❌ Sadece sunucularda çalışır.", ephemeral: true }); return; }
  await interaction.deferReply();
  const target = interaction.options.getUser("kullanici") ?? interaction.user;
  const bal = await getBalance(target.id, interaction.guildId);

  const embed = new EmbedBuilder()
    .setColor(0xffd700)
    .setTitle("💳 Bakiye")
    .setThumbnail(target.displayAvatarURL())
    .addFields(
      { name: "👤 Kullanıcı", value: target.displayName, inline: true },
      { name: "💰 Coins", value: `**${bal.coins.toLocaleString()}** 🪙`, inline: true },
      { name: "🔥 Seri", value: `${bal.streak} gün`, inline: true },
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
