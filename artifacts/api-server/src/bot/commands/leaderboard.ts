import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { getLeaderboard } from "../leveling";

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
        name = user.username;
      } catch {
        name = `<@${entry.userId}>`;
      }
      return `${medal} ${name} — Seviye **${entry.level}** · ${entry.xp} XP`;
    }),
  );

  await interaction.editReply(`🏆 **Liderboard**\n\n${lines.join("\n")}`);
}
