import { AttachmentBuilder, ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { getLeaderboard, xpToNextLevel } from "../leveling";
import { generateLeaderboardCard, type LeaderboardEntry } from "../leaderboardCard";

export const data = new SlashCommandBuilder()
  .setName("leaderboard")
  .setDescription("Sunucunun en yüksek seviyeli üyelerini görsel tablo olarak gösterir");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
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

  const entries: LeaderboardEntry[] = await Promise.all(
    top.map(async (entry, i) => {
      let username = `Kullanıcı ${entry.userId.slice(-4)}`;
      let avatarUrl = "";
      try {
        const user = await interaction.client.users.fetch(entry.userId);
        username = user.displayName;
        avatarUrl = user.displayAvatarURL({ extension: "png", size: 64 });
      } catch { /* ignore */ }

      const { current, needed } = xpToNextLevel(entry.xp, entry.level);
      return {
        rank: i + 1,
        userId: entry.userId,
        username,
        avatarUrl,
        level: entry.level,
        xp: entry.xp,
        xpCurrent: current,
        xpNeeded: needed,
      };
    }),
  );

  const buffer = await generateLeaderboardCard(entries);
  await interaction.editReply({
    files: [new AttachmentBuilder(buffer, { name: "leaderboard.png" })],
  });
}
