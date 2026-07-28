import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from "discord.js";

const CEVAPLAR = [
  "🟢 Kesinlikle evet.", "🟢 Evet, buna güvenebilirsin.",
  "🟢 Görünüşe göre öyle.", "🟢 Şüphesiz.",
  "🟢 Bence evet.", "🟡 Şimdilik sormamak daha iyi.",
  "🟡 Tekrar sor.", "🟡 Şu an söyleyemem.",
  "🟡 Odaklan ve tekrar sor.", "🟡 Cevabım bulanık, tekrar dene.",
  "🔴 Bence hayır.", "🔴 Pek iyi görünmüyor.",
  "🔴 Şüpheliyim.", "🔴 Kesinlikle hayır.",
  "🔴 İhtimal çok düşük.", "🔴 İşaretler hayır diyor.",
  "🟡 Cevap belirsiz.", "🟢 Evet, büyük ihtimalle.",
  "🔴 Hayal kırıklığına hazır ol.", "🟡 Bunu açıklayamam.",
];

export const data = new SlashCommandBuilder()
  .setName("8top")
  .setDescription("🎱 Sihirli 8 top — soruyu sor!")
  .addStringOption((o) => o.setName("soru").setDescription("Sorun nedir?").setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const soru = interaction.options.getString("soru", true);
  const cevap = CEVAPLAR[Math.floor(Math.random() * CEVAPLAR.length)]!;

  const embed = new EmbedBuilder()
    .setColor(0x1a1a2e)
    .setTitle("🎱 Sihirli 8 Top")
    .addFields(
      { name: "❓ Soru", value: soru },
      { name: "🔮 Cevap", value: `**${cevap}**` },
    )
    .setFooter({ text: `Soran: ${interaction.user.displayName}` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
