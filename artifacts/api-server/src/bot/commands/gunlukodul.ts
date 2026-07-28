import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { claimDaily, getBalance } from "../economy";

export const data = new SlashCommandBuilder()
  .setName("gunlukodul")
  .setDescription("🎁 Günlük coin ödülünü al (her 20 saatte bir)");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const result = await claimDaily(interaction.user.id);

  if (result.alreadyClaimed) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle("⏰ Zaten Aldın!")
          .setDescription("Günlük ödülünü zaten aldın. **20 saat** sonra tekrar dene.")
          .setTimestamp(),
      ],
    });
    return;
  }

  const bal = await getBalance(interaction.user.id);
  const streakEmoji = result.streak >= 30 ? "🔥🔥🔥" : result.streak >= 14 ? "🔥🔥" : result.streak >= 7 ? "🔥" : "✨";

  const embed = new EmbedBuilder()
    .setColor(0xfaa61a)
    .setTitle("🎁 Günlük Ödül Alındı!")
    .setThumbnail(interaction.user.displayAvatarURL())
    .setDescription("💡 Bakiye tüm sunucularda ortaktır.")
    .addFields(
      { name: "💰 Kazanılan", value: `**${result.reward.toLocaleString("tr-TR")} ⬤V**`, inline: true },
      { name: `${streakEmoji} Seri`, value: `${result.streak} gün`, inline: true },
      { name: "💳 Toplam Bakiye", value: `**${bal.coins.toLocaleString("tr-TR")} ⬤V**`, inline: true },
    )
    .setFooter({ text: result.streak >= 2 ? `Seri bonusu: +${(result.reward - 500).toLocaleString("tr-TR")} ⬤V` : "Her gün al, seri bonusu kazan!" })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
