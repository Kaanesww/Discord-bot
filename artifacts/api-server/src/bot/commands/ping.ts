import { SlashCommandBuilder } from "discord.js";
import type { Command } from "../types";

export const ping: Command = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check the bot's latency"),

  async execute(interaction) {
    const sent = await interaction.reply({
      content: "🏓 Pinging...",
      fetchReply: true,
    });
    const latency = sent.createdTimestamp - interaction.createdTimestamp;
    const apiLatency = Math.round(interaction.client.ws.ping);
    await interaction.editReply(
      `🏓 Pong!\n> Round-trip: **${latency}ms**\n> API latency: **${apiLatency}ms**`,
    );
  },
};
