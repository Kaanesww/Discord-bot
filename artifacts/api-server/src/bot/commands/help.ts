import { SlashCommandBuilder, EmbedBuilder, Colors } from "discord.js";
import type { Command } from "../types";

export const help: Command = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("List all available commands"),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle("📖 Bot Commands")
      .setColor(Colors.Blurple)
      .setTimestamp()
      .addFields(
        {
          name: "🔧 Utility",
          value: [
            "`/ping` — Check bot latency",
            "`/help` — Show this menu",
            "`/userinfo [user]` — Display user info",
            "`/serverinfo` — Display server info",
          ].join("\n"),
        },
        {
          name: "🔨 Moderation",
          value: [
            "`/kick <user> [reason]` — Kick a member",
            "`/ban <user> [reason]` — Ban a member",
            "`/unban <user_id>` — Unban a member",
            "`/timeout <user> <minutes> [reason]` — Timeout a member",
            "`/warn <user> <reason>` — Issue a warning",
            "`/warnings <user>` — View a member's warnings",
          ].join("\n"),
        },
        {
          name: "🎉 Fun & Community",
          value: [
            "`/poll <question> <opt1> <opt2> [opt3] [opt4]` — Create a poll",
            "`/announce <channel> <message>` — Send an announcement",
          ].join("\n"),
        },
      )
      .setFooter({ text: `Requested by ${interaction.user.tag}` });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
