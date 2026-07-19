import {
  ChatInputCommandInteraction, PermissionFlagsBits,
  SlashCommandBuilder, TextChannel, EmbedBuilder,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("ac")
  .setDescription("Kanalın kilidini açar")
  .addChannelOption((o) => o.setName("kanal").setDescription("Kanal (boş = şu an)").setRequired(false))
  .addStringOption((o) => o.setName("sebep").setDescription("Sebep").setRequired(false))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) { await interaction.reply({ content: "❌ Sadece sunucularda çalışır.", ephemeral: true }); return; }
  const ch = (interaction.options.getChannel("kanal") ?? interaction.channel) as TextChannel;
  const sebep = interaction.options.getString("sebep") ?? "Sebep belirtilmedi";
  await ch.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: null });
  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("🔓 Kanal Açıldı")
    .addFields({ name: "Kanal", value: `<#${ch.id}>`, inline: true }, { name: "Moderatör", value: `<@${interaction.user.id}>`, inline: true }, { name: "Sebep", value: sebep })
    .setTimestamp();
  await interaction.reply({ embeds: [embed] });
}
