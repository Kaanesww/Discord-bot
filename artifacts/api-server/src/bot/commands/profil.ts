import { AttachmentBuilder, ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { getUserLevel, getRank, xpToNextLevel } from "../leveling";
import { generateProfileCard } from "../profileCard";

export const data = new SlashCommandBuilder()
  .setName("profil")
  .setDescription("Görselli profil kartını gösterir")
  .addUserOption((o) =>
    o.setName("kullanici").setDescription("Başka birinin profilini gör").setRequired(false),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: "❌ Bu komut sadece sunucularda çalışır.", ephemeral: true });
    return;
  }

  const target = interaction.options.getUser("kullanici") ?? interaction.user;
  await interaction.deferReply();

  const data = await getUserLevel(target.id, guildId);
  const rank = await getRank(target.id, guildId);
  const { current, needed } = xpToNextLevel(data.xp, data.level);

  const avatarUrl =
    target.displayAvatarURL({ extension: "png", size: 256 }) ??
    `https://cdn.discordapp.com/embed/avatars/${parseInt(target.discriminator || "0") % 5}.png`;

  const buffer = await generateProfileCard({
    username: target.displayName,
    avatarUrl,
    level: data.level,
    xp: current,
    xpNeeded: needed,
    rank,
    messageCount: data.messageCount,
  });

  const attachment = new AttachmentBuilder(buffer, { name: "profil.png" });
  await interaction.editReply({ files: [attachment] });
}
