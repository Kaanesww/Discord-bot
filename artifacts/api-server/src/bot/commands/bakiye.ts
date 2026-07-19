import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getBalance } from "../economy";

export const data = new SlashCommandBuilder()
  .setName("bakiye")
  .setDescription("💳 Global coin bakiyeni gösterir (tüm sunucularda aynı)")
  .addUserOption((o) => o.setName("kullanici").setDescription("Başkasının bakiyesi").setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();
  const target = interaction.options.getUser("kullanici") ?? interaction.user;
  const bal = await getBalance(target.id);

  const embed = new EmbedBuilder()
    .setColor(0xffd700)
    .setTitle("💳 Global Bakiye")
    .setThumbnail(target.displayAvatarURL())
    .setDescription("💡 Bakiye tüm sunucularda ortaktır.")
    .addFields(
      { name: "👤 Kullanıcı", value: target.displayName, inline: true },
      { name: "💰 Coins", value: `**${bal.coins.toLocaleString("tr-TR")} ⬤V**`, inline: true },
      { name: "🔥 Günlük Seri", value: `${bal.streak} gün`, inline: true },
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
