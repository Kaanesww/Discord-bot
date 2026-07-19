import {
  SlashCommandBuilder,
  EmbedBuilder,
  Colors,
  GuildMember,
} from "discord.js";
import type { Command } from "../types";

export const userinfo: Command = {
  data: new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Display information about a user")
    .addUserOption((opt) =>
      opt
        .setName("user")
        .setDescription("The user to look up (defaults to yourself)")
        .setRequired(false),
    ),

  async execute(interaction) {
    const target = interaction.options.getUser("user") ?? interaction.user;
    const member =
      interaction.guild?.members.cache.get(target.id) ??
      (await interaction.guild?.members.fetch(target.id).catch(() => null));

    const createdAt = Math.floor(target.createdTimestamp / 1000);
    const joinedAt =
      member instanceof GuildMember && member.joinedTimestamp
        ? Math.floor(member.joinedTimestamp / 1000)
        : null;

    const roles =
      member instanceof GuildMember
        ? member.roles.cache
            .filter((r) => r.id !== interaction.guild?.id)
            .sort((a, b) => b.position - a.position)
            .map((r) => r.toString())
            .slice(0, 10)
        : [];

    const embed = new EmbedBuilder()
      .setTitle(`👤 ${target.tag}`)
      .setThumbnail(target.displayAvatarURL({ size: 256 }))
      .setColor(
        member instanceof GuildMember
          ? (member.displayHexColor as `#${string}`) || Colors.Blurple
          : Colors.Blurple,
      )
      .addFields(
        { name: "ID", value: target.id, inline: true },
        { name: "Bot", value: target.bot ? "Yes" : "No", inline: true },
        {
          name: "Account Created",
          value: `<t:${createdAt}:F> (<t:${createdAt}:R>)`,
        },
        ...(joinedAt
          ? [
              {
                name: "Joined Server",
                value: `<t:${joinedAt}:F> (<t:${joinedAt}:R>)`,
              },
            ]
          : []),
        ...(roles.length
          ? [
              {
                name: `Roles (${roles.length})`,
                value: roles.join(", "),
              },
            ]
          : []),
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
