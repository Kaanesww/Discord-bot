import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getBalance, addCoins, takeCoins } from "../economy";

export const data = new SlashCommandBuilder()
  .setName("transfer")
  .setDescription("💸 Birine global coin gönder")
  .addUserOption((o) => o.setName("kullanici").setDescription("Alıcı").setRequired(true))
  .addIntegerOption((o) => o.setName("miktar").setDescription("Coin miktarı").setMinValue(1).setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const target = interaction.options.getUser("kullanici", true);
  const amount = interaction.options.getInteger("miktar", true);

  if (target.id === interaction.user.id) {
    await interaction.reply({ content: "❌ Kendine transfer yapamazsın.", ephemeral: true }); return;
  }
  if (target.bot) {
    await interaction.reply({ content: "❌ Botlara transfer yapamazsın.", ephemeral: true }); return;
  }

  await interaction.deferReply();
  const bal = await getBalance(interaction.user.id);
  if (bal.coins < amount) {
    await interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0xed4245).setTitle("❌ Yetersiz Bakiye").setDescription(`Bakiyen: **${bal.coins.toLocaleString("tr-TR")} ⬤V**`)],
    });
    return;
  }

  await takeCoins(interaction.user.id, amount);
  const newBal = await addCoins(target.id, amount);

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("💸 Transfer Başarılı")
    .setDescription("💡 Bakiye tüm sunucularda ortaktır.")
    .addFields(
      { name: "Gönderen", value: `<@${interaction.user.id}>`, inline: true },
      { name: "Alıcı", value: `<@${target.id}>`, inline: true },
      { name: "Miktar", value: `**${amount.toLocaleString("tr-TR")} ⬤V**`, inline: true },
      { name: "Alıcının Yeni Bakiyesi", value: `**${newBal.toLocaleString("tr-TR")} ⬤V**` },
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
