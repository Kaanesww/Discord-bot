import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import { getLeaderboard, xpToNextLevel } from "../leveling";

export const data = new SlashCommandBuilder()
  .setName("leaderboard")
  .setDescription("Bu sunucunun en yüksek seviyeli üyelerini gösterir");

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: "❌ Bu komut sadece sunucularda çalışır.", ephemeral: true });
    return;
  }

  await interaction.deferReply();
  const top = await getLeaderboard(guildId, 10);

  if (top.length === 0) {
    await interaction.editReply("Henüz kimse mesaj atmamış! 🦗");
    return;
  }

  const medals = ["🥇", "🥈", "🥉"];

  const lines = await Promise.all(
    top.map(async (entry, i) => {
      const medal = medals[i] ?? `**${i + 1}.**`;
      let name: string;
      try {
        const user = await interaction.client.users.fetch(entry.userId);
        name = user.displayName;
      } catch {
        name = `<@${entry.userId}>`;
      }
      const { current, needed } = xpToNextLevel(entry.xp, entry.level);
      const pct = Math.round((current / needed) * 100);
      return `${medal} **${name}** — Seviye **${entry.level}** · ${entry.xp.toLocaleString()} XP · %${pct} sonraki seviyeye`;
    }),
  );

  const embed = new EmbedBuilder()
    .setTitle("🏆 Sunucu Liderboard")
    .setColor(0xfaa61a)
    .setDescription(lines.join("\n\n"))
    .setFooter({ text: `Toplam ${top.length} aktif üye gösteriliyor` });

  await interaction.editReply({ embeds: [embed] });
}
