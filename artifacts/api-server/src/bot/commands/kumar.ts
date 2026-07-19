import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getBalance, addCoins, takeCoins } from "../economy";

const SLOTS = ["🍒", "🍋", "🍊", "🍇", "💎", "7️⃣", "⭐"];

function spin() { return SLOTS[Math.floor(Math.random() * SLOTS.length)]!; }

function calcWin(s1: string, s2: string, s3: string, bet: number): { multiplier: number; label: string } {
  if (s1 === s2 && s2 === s3) {
    if (s1 === "7️⃣") return { multiplier: 20, label: "🎰 JACKPOT! Üç 7!" };
    if (s1 === "💎") return { multiplier: 12, label: "💎 ELMAS! Üç elmas!" };
    if (s1 === "⭐") return { multiplier: 8, label: "⭐ SÜPER! Üç yıldız!" };
    return { multiplier: 4, label: "🎉 Üç aynı!" };
  }
  if (s1 === s2 || s2 === s3 || s1 === s3) return { multiplier: 1.5, label: "✨ İki aynı!" };
  return { multiplier: 0, label: "💸 Kaybettin!" };
}

export const data = new SlashCommandBuilder()
  .setName("kumar")
  .setDescription("🎰 Slot makinesi — şansını dene!")
  .addIntegerOption((o) => o.setName("miktar").setDescription("Bahis miktarı (min 10)").setMinValue(10).setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) { await interaction.reply({ content: "❌ Sadece sunucularda çalışır.", ephemeral: true }); return; }
  const bet = interaction.options.getInteger("miktar", true);
  await interaction.deferReply();

  const bal = await getBalance(interaction.user.id, interaction.guildId);
  if (bal.coins < bet) {
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xed4245).setTitle("❌ Yetersiz Bakiye").setDescription(`Bakiyen: **${bal.coins.toLocaleString()}** 🪙 · Bahis: **${bet.toLocaleString()}** 🪙`)] });
    return;
  }

  const s1 = spin(); const s2 = spin(); const s3 = spin();
  const { multiplier, label } = calcWin(s1, s2, s3, bet);
  const winAmount = Math.round(bet * multiplier);
  const diff = winAmount - bet;

  let newBal: number;
  if (multiplier === 0) { newBal = await takeCoins(interaction.user.id, interaction.guildId, bet); }
  else if (diff > 0) { newBal = await addCoins(interaction.user.id, interaction.guildId, diff); }
  else { newBal = bal.coins; }

  const color = multiplier === 0 ? 0xed4245 : multiplier >= 4 ? 0xffd700 : 0x57f287;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle("🎰 Slot Makinesi")
    .setDescription(`\`\`\`\n╔═══════════════╗\n║  ${s1}  ${s2}  ${s3}  ║\n╚═══════════════╝\`\`\``)
    .addFields(
      { name: "Sonuç", value: label, inline: true },
      { name: "Bahis", value: `${bet.toLocaleString()} 🪙`, inline: true },
      { name: multiplier === 0 ? "Kayıp" : "Kazanç", value: `${multiplier === 0 ? "-" : "+"}${Math.abs(diff || bet).toLocaleString()} 🪙`, inline: true },
      { name: "Yeni Bakiye", value: `**${newBal.toLocaleString()}** 🪙` },
    )
    .setFooter({ text: `Çarpan: x${multiplier}` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
