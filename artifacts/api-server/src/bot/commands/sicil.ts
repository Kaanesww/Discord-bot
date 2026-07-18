import {
  AttachmentBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { getUserLogs } from "../moderation";
import { generateSicilCard } from "../sicilCard";

export const data = new SlashCommandBuilder()
  .setName("sicil")
  .setDescription("Kullanıcının moderasyon sicil kaydını gösterir")
  .addUserOption((o) =>
    o.setName("kullanici").setDescription("Sicili görüntülenecek kullanıcı").setRequired(true),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ content: "❌ Bu komut sadece sunucularda çalışır.", ephemeral: true });
    return;
  }

  const target = interaction.options.getUser("kullanici", true);
  await interaction.deferReply();

  const logs = await getUserLogs(target.id, interaction.guildId);
  const avatarUrl = target.displayAvatarURL({ extension: "png", size: 256 });

  const buffer = await generateSicilCard({
    username: target.displayName,
    avatarUrl,
    logs,
  });

  const attachment = new AttachmentBuilder(buffer, { name: "sicil.png" });
  await interaction.editReply({ files: [attachment] });
}
