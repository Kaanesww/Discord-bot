import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getBalance, addCoins, takeCoins } from "../economy";

export const data = new SlashCommandBuilder()
  .setName("transfer")
  .setDescription("Birine coin gönder")
  .addUserOption((o) => o.setName("kullanici").setDescription("Alıcı").setRequired(true))
  .addIntegerOption((o) => o.setName("miktar").setDescription("Coin miktarı").setMinValue(1).setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) { await interaction.reply({ content: "❌ Sadece sunucularda çalışır.", ephemeral: true }); return; }
  const target = interaction.options.getUser("kullanici", true);
  const amount = interaction.options.getInteger("miktar", true);

  if (target.id === interaction.user.id) { await interaction.reply({ content: "❌ Kendine transfer yapamazsın.", ephemeral: true }); return; }
  if (target.bot) { await interaction.reply({ content: "❌ Botlara transfer yapamazsın.", ephemeral: true }); return; }

  await interaction.deferReply();
  const bal = await getBalance(interaction.user.id, interaction.guildId);
  if (bal.coins < amount) {
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xed4245).setTitle("❌ Yetersiz Bakiye").setDescription(`Bakiyen: **${bal.coins.toLocaleString()}** 🪙`)] });
    return;
  }

  await takeCoins(interaction.user.id, interaction.guildId, amount);
  const newBal = await addCoins(target.id, interaction.guildId, amount);

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("💸 Transfer Başarılı")
    .addFields(
      { name: "Gönderen", value: `<@${interaction.user.id}>`, inline: true },
      { name: "Alıcı", value: `<@${target.id}>`, inline: true },
      { name: "Miktar", value: `**${amount.toLocaleString()}** 🪙`, inline: true },
      { name: "Alıcının Yeni Bakiyesi", value: `**${newBal.toLocaleString()}** 🪙` },
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
