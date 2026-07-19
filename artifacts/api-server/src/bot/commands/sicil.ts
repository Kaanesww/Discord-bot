import {
  AttachmentBuilder, ChatInputCommandInteraction, PermissionFlagsBits, SlashCommandBuilder,
} from "discord.js";
import { getUserLogs } from "../moderation";
import { generateSicilCard } from "../sicilCard";
import { isOwner } from "../ownerUtils";

export const data = new SlashCommandBuilder()
  .setName("sicil")
  .setDescription("Kullanıcının moderasyon sicil kaydını gösterir")
  .addUserOption((o) => o.setName("kullanici").setDescription("Sicili görüntülenecek kullanıcı").setRequired(true))
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) { await interaction.reply({ content: "❌ Bu komut sadece sunucularda çalışır.", ephemeral: true }); return; }

  if (!isOwner(interaction.user.id) && !interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)) {
    await interaction.reply({ content: "❌ **Moderate Members** iznin yok.", ephemeral: true }); return;
  }

  const target = interaction.options.getUser("kullanici", true);
  await interaction.deferReply();
  const logs = await getUserLogs(target.id, interaction.guildId);
  const buffer = await generateSicilCard({ username: target.displayName, avatarUrl: target.displayAvatarURL({ extension: "png", size: 256 }), logs });
  await interaction.editReply({ files: [new AttachmentBuilder(buffer, { name: "sicil.png" })] });
}
