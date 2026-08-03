import { SlashCommandBuilder, EmbedBuilder, Colors } from "discord.js";
import type { Command } from "../types";

export const serverinfo: Command = {
  data: new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("Display information about this server"),

  async execute(interaction) {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        ephemeral: true,
      });
      return;
    }

    await guild.fetch();
    const owner = await guild.fetchOwner().catch(() => null);
    const createdAt = Math.floor(guild.createdTimestamp / 1000);

    const embed = new EmbedBuilder()
      .setTitle(`🏠 ${guild.name}`)
      .setThumbnail(guild.iconURL({ size: 256 }))
      .setColor(Colors.Blurple)
      .addFields(
        { name: "ID", value: guild.id, inline: true },
        {
          name: "Owner",
          value: owner ? `${owner.user.tag}` : "Unknown",
          inline: true,
        },
        {
          name: "Created",
          value: `<t:${createdAt}:F> (<t:${createdAt}:R>)`,
        },
        {
          name: "Members",
          value: `${guild.memberCount}`,
          inline: true,
        },
        {
          name: "Channels",
          value: `${guild.channels.cache.size}`,
          inline: true,
        },
        {
          name: "Roles",
          value: `${guild.roles.cache.size}`,
          inline: true,
        },
        {
          name: "Boost Level",
          value: `Tier ${guild.premiumTier}`,
          inline: true,
        },
        {
          name: "Boosts",
          value: `${guild.premiumSubscriptionCount ?? 0}`,
          inline: true,
        },
        {
          name: "Verification Level",
          value: String(guild.verificationLevel),
          inline: true,
        },
      )
      .setTimestamp();

    if (guild.description) {
      embed.setDescription(guild.description);
    }

    await interaction.reply({ embeds: [embed] });
  },
};
