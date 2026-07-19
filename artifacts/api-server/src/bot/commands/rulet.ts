import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getBalance, addCoins, takeCoins } from "../economy";

const RED_NUMS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

function getColor(n: number): "red" | "black" | "green" {
  if (n === 0) return "green";
  return RED_NUMS.has(n) ? "red" : "black";
}

export const data = new SlashCommandBuilder()
  .setName("rulet")
  .setDescription("🎡 Rulet — kırmızı/siyah/yeşil veya 0-36 arası sayı")
  .addStringOption((o) =>
    o.setName("secim").setDescription("kirmizi | siyah | yesil | 0-36").setRequired(true),
  )
  .addIntegerOption((o) => o.setName("bahis").setDescription("Bahis miktarı (min 10)").setMinValue(10).setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) { await interaction.reply({ content: "❌ Sadece sunucularda çalışır.", ephemeral: true }); return; }
  const secim = interaction.options.getString("secim", true).toLowerCase().trim();
  const bet = interaction.options.getInteger("bahis", true);
  await interaction.deferReply();

  const bal = await getBalance(interaction.user.id, interaction.guildId);
  if (bal.coins < bet) {
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xed4245).setTitle("❌ Yetersiz Bakiye").setDescription(`Bakiyen: **${bal.coins.toLocaleString()}** 🪙`)] });
    return;
  }

  // Validate seçim
  const validColors = ["kirmizi", "kırmızı", "siyah", "yesil", "yeşil"];
  const isNumber = /^\d+$/.test(secim) && Number(secim) >= 0 && Number(secim) <= 36;
  if (!validColors.includes(secim) && !isNumber) {
    await interaction.editReply({ content: "❌ Geçersiz seçim. `kirmizi`, `siyah`, `yesil` veya `0-36` arası bir sayı gir." });
    return;
  }

  const result = Math.floor(Math.random() * 37); // 0-36
  const resultColor = getColor(result);

  let win = false;
  let multiplier = 0;

  if (isNumber) {
    win = result === Number(secim);
    multiplier = 36;
  } else if (secim.startsWith("kır") || secim === "kirmizi") {
    win = resultColor === "red";
    multiplier = 2;
  } else if (secim === "siyah") {
    win = resultColor === "black";
    multiplier = 2;
  } else {
    win = resultColor === "green";
    multiplier = 35;
  }

  const colorEmoji = resultColor === "red" ? "🔴" : resultColor === "black" ? "⚫" : "🟢";
  let newBal: number;
  let diffText: string;

  if (win) {
    const profit = bet * multiplier - bet;
    newBal = await addCoins(interaction.user.id, interaction.guildId, profit);
    diffText = `+${profit.toLocaleString()}`;
  } else {
    newBal = await takeCoins(interaction.user.id, interaction.guildId, bet);
    diffText = `-${bet.toLocaleString()}`;
  }

  const embed = new EmbedBuilder()
    .setColor(win ? 0x57f287 : 0xed4245)
    .setTitle("🎡 Rulet")
    .setDescription(`Top düştü: **${colorEmoji} ${result}**\nSeçimin: **${secim}**\n\n${win ? "🏆 **KAZANDIN!**" : "💸 **Kaybettin!**"}`)
    .addFields(
      { name: "Bahis", value: `${bet.toLocaleString()} 🪙`, inline: true },
      { name: win ? "Kazanç" : "Kayıp", value: `${diffText} 🪙`, inline: true },
      { name: "Çarpan", value: `x${multiplier}`, inline: true },
      { name: "Yeni Bakiye", value: `**${newBal.toLocaleString()}** 🪙` },
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
