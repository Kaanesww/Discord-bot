import {
  ChatInputCommandInteraction, PermissionFlagsBits,
  SlashCommandBuilder, TextChannel, EmbedBuilder,
} from "discord.js";
import { isOwner } from "../ownerUtils";

export const data = new SlashCommandBuilder()
  .setName("kilitle")
  .setDescription("Kanalı kilitler — @everyone mesaj gönderemez")
  .addChannelOption((o) => o.setName("kanal").setDescription("Kanal (boş = şu an)").setRequired(false))
  .addStringOption((o) => o.setName("sebep").setDescription("Sebep").setRequired(false))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) { await interaction.reply({ content: "❌ Sadece sunucularda çalışır.", ephemeral: true }); return; }

  if (!isOwner(interaction.user.id) && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
    await interaction.reply({ content: "❌ **Manage Channels** iznin yok.", ephemeral: true }); return;
  }

  const ch = (interaction.options.getChannel("kanal") ?? interaction.channel) as TextChannel;
  const sebep = interaction.options.getString("sebep") ?? "Sebep belirtilmedi";
  await ch.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false });
  const embed = new EmbedBuilder()
    .setColor(0xed4245).setTitle("🔒 Kanal Kilitlendi")
    .addFields({ name: "Kanal", value: `<#${ch.id}>`, inline: true }, { name: "Moderatör", value: `<@${interaction.user.id}>`, inline: true }, { name: "Sebep", value: sebep })
    .setTimestamp();
  await interaction.reply({ embeds: [embed] });
}
