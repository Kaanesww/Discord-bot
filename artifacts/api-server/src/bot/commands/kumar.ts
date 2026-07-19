import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getBalance, addCoins, takeCoins } from "../economy";

const SLOTS = ["🍒", "🍋", "🍊", "🍇", "💎", "7️⃣", "⭐"];
const SPIN_FRAMES = ["🔵", "🟣", "🟡", "🔴", "🟢", "🟠", "⚪"];

function spin() { return SLOTS[Math.floor(Math.random() * SLOTS.length)]!; }
function randomSpin() { return SPIN_FRAMES[Math.floor(Math.random() * SPIN_FRAMES.length)]!; }
function sleep(ms: number) { return new Promise<void>((r) => setTimeout(r, ms)); }

function calcWin(s1: string, s2: string, s3: string): { multiplier: number; label: string } {
  if (s1 === s2 && s2 === s3) {
    if (s1 === "7️⃣") return { multiplier: 20, label: "🎰 JACKPOT! Üç yedi!" };
    if (s1 === "💎") return { multiplier: 12, label: "💎 ELMAS! Üç elmas!" };
    if (s1 === "⭐") return { multiplier: 8, label: "⭐ SÜPER! Üç yıldız!" };
    return { multiplier: 4, label: "🎉 Üç aynı!" };
  }
  if (s1 === s2 || s2 === s3 || s1 === s3) return { multiplier: 1.5, label: "✨ İki aynı!" };
  return { multiplier: 0, label: "💸 Kaybettin!" };
}

function slotEmbed(r1: string, r2: string, r3: string, label: string, color: number, extra?: string) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle("🎰 Slot Makinesi")
    .setDescription(
      `\`\`\`\n` +
      `╔═══╦═══╦═══╗\n` +
      `║ ${r1} ║ ${r2} ║ ${r3} ║\n` +
      `╚═══╩═══╩═══╝\`\`\`` +
      (extra ? `\n${extra}` : "")
    )
    .setFooter({ text: label });
}

export const data = new SlashCommandBuilder()
  .setName("kumar")
  .setDescription("🎰 Slot makinesi — makaralar gerçekten döner!")
  .addIntegerOption((o) => o.setName("miktar").setDescription("Bahis miktarı (min 10)").setMinValue(10).setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) { await interaction.reply({ content: "❌ Sadece sunucularda çalışır.", ephemeral: true }); return; }
  const bet = interaction.options.getInteger("miktar", true);
  await interaction.deferReply();

  const bal = await getBalance(interaction.user.id, interaction.guildId);
  if (bal.coins < bet) {
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xed4245).setTitle("❌ Yetersiz Bakiye").setDescription(`Bakiyen: **${bal.coins.toLocaleString("tr-TR")}** ⬤V · Bahis: **${bet.toLocaleString("tr-TR")}** ⬤V`)] });
    return;
  }

  // ── Sonuçları baştan belirle ──────────────────────────
  const s1 = spin(), s2 = spin(), s3 = spin();
  const { multiplier, label } = calcWin(s1, s2, s3);

  // ── Animasyon kareleri ────────────────────────────────
  // Kare 1: hepsi dönüyor
  await interaction.editReply({ embeds: [slotEmbed(randomSpin(), randomSpin(), randomSpin(), "⏳ Dönüyor...", 0x5865f2)] });
  await sleep(550);

  // Kare 2-3: rastgele ara değişimler
  for (let i = 0; i < 2; i++) {
    await interaction.editReply({ embeds: [slotEmbed(randomSpin(), randomSpin(), randomSpin(), "⏳ Dönüyor...", 0x5865f2)] });
    await sleep(450);
  }

  // Kare 4: birinci makara duruyor
  await interaction.editReply({ embeds: [slotEmbed(s1, randomSpin(), randomSpin(), "🔵 İlk makara durdu...", 0x9b59b6)] });
  await sleep(500);

  // Kare 5: ikinci makara duruyor
  await interaction.editReply({ embeds: [slotEmbed(s1, s2, randomSpin(), "🟡 İkinci makara durdu...", 0xfaa61a)] });
  await sleep(500);

  // ── Kare 6: sonuç ──────────────────────────────────
  const winAmount = Math.round(bet * multiplier);
  const diff = winAmount - bet;

  let newBal: number;
  if (multiplier === 0) { newBal = await takeCoins(interaction.user.id, interaction.guildId, bet); }
  else if (diff > 0) { newBal = await addCoins(interaction.user.id, interaction.guildId, diff); }
  else { newBal = bal.coins; }

  const color = multiplier === 0 ? 0xed4245 : multiplier >= 4 ? 0xffd700 : 0x57f287;
  const diffStr = multiplier === 0 ? `-${bet.toLocaleString("tr-TR")}` : `+${diff.toLocaleString("tr-TR")}`;

  const finalEmbed = new EmbedBuilder()
    .setColor(color)
    .setTitle("🎰 Slot Makinesi")
    .setDescription(
      `\`\`\`\n` +
      `╔═══╦═══╦═══╗\n` +
      `║ ${s1} ║ ${s2} ║ ${s3} ║\n` +
      `╚═══╩═══╩═══╝\`\`\``
    )
    .addFields(
      { name: "Sonuç", value: label, inline: true },
      { name: "Bahis", value: `${bet.toLocaleString("tr-TR")} ⬤V`, inline: true },
      { name: multiplier === 0 ? "💸 Kayıp" : "💰 Kazanç", value: `${diffStr} ⬤V`, inline: true },
      { name: "Yeni Bakiye", value: `**${newBal.toLocaleString("tr-TR")} ⬤V**` },
    )
    .setFooter({ text: `Çarpan: x${multiplier}` })
    .setTimestamp();

  await interaction.editReply({ embeds: [finalEmbed] });
}
