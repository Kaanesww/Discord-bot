import { AttachmentBuilder, ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { getUserLevel, getRank, xpToNextLevel } from "../leveling";
import { generateProfileCard } from "../profileCard";

export const data = new SlashCommandBuilder()
  .setName("level")
  .setDescription("Seviyeni görsel kart olarak gösterir")
  .addUserOption((o) =>
    o.setName("kullanici").setDescription("Başka birinin seviyesini gör").setRequired(false),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: "❌ Bu komut sadece sunucularda çalışır.", ephemeral: true });
    return;
  }

  const target = interaction.options.getUser("kullanici") ?? interaction.user;
  await interaction.deferReply();

  const userData = await getUserLevel(target.id, guildId);
  const rank = await getRank(target.id, guildId);
  const { current, needed } = xpToNextLevel(userData.xp, userData.level);

  const avatarUrl = target.displayAvatarURL({ extension: "png", size: 256 });

  const buffer = await generateProfileCard({
    username: target.displayName,
    avatarUrl,
    level: userData.level,
    xp: current,
    xpNeeded: needed,
    rank,
    messageCount: userData.messageCount,
  });

  await interaction.editReply({
    files: [new AttachmentBuilder(buffer, { name: "level.png" })],
  });
}
