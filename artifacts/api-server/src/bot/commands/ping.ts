import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("ping")
  .setDescription("🏓 Botun gecikmesini ölçer");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const sent = await interaction.reply({ content: "🏓 Ölçülüyor...", fetchReply: true });
  const latency = sent.createdTimestamp - interaction.createdTimestamp;
  const api = Math.round(interaction.client.ws.ping);
  await interaction.editReply(
    `🏓 **Pong!**\n> ⚡ Round-trip: **${latency}ms**\n> 🌐 API gecikmesi: **${api}ms**`,
  );
}
