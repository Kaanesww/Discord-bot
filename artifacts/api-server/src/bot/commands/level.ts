import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { getUserLevel } from "../leveling";

export const data = new SlashCommandBuilder()
  .setName("level")
  .setDescription("Seviyeni ve XP'ini gösterir")
  .addUserOption((option) =>
    option
      .setName("kullanici")
      .setDescription("Başka bir kullanıcının seviyesini görüntüle")
      .setRequired(false),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const target = interaction.options.getUser("kullanici") ?? interaction.user;
  const guildId = interaction.guildId;

  if (!guildId) {
    await interaction.reply({ content: "❌ Bu komut sadece sunucularda çalışır.", ephemeral: true });
    return;
  }

  await interaction.deferReply();

  const data = await getUserLevel(target.id, guildId);
  const xpForNext = xpNeeded(data.level + 1);
  const bar = progressBar(data.xp, xpForNext);

  await interaction.editReply(
    `👤 **${target.username}** — Seviye **${data.level}**\n` +
    `✨ XP: **${data.xp}** / ${xpForNext}\n` +
    `${bar}`,
  );
}

function xpNeeded(level: number): number {
  return 100 * level * level;
}

function progressBar(current: number, max: number): string {
  const filled = Math.round((current / max) * 10);
  const empty = 10 - filled;
  return `[${"█".repeat(filled)}${"░".repeat(empty)}]`;
}
