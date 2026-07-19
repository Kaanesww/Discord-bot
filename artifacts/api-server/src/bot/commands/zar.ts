import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from "discord.js";

const DICE = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

export const data = new SlashCommandBuilder()
  .setName("zar")
  .setDescription("🎲 Zar at!")
  .addIntegerOption((o) => o.setName("adet").setDescription("Kaç zar? (1-5)").setMinValue(1).setMaxValue(5).setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const adet = interaction.options.getInteger("adet") ?? 1;
  const rolls = Array.from({ length: adet }, () => Math.floor(Math.random() * 6) + 1);
  const total = rolls.reduce((a, b) => a + b, 0);
  const display = rolls.map((r) => DICE[r - 1]).join("  ");

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("🎲 Zar Atıldı!")
    .setDescription(`${display}`)
    .addFields({ name: adet > 1 ? "Toplam" : "Sonuç", value: `**${total}**`, inline: true })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
