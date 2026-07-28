import { AttachmentBuilder, ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { getPrefix } from "../guildSettings";
import { generateHelpCard } from "../helpCard";

export const data = new SlashCommandBuilder()
  .setName("yardim")
  .setDescription("Tüm bot komutlarını görsel kart olarak gösterir");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  await interaction.deferReply();

  const prefix = guildId ? await getPrefix(guildId).catch(() => "v!") : "v!";
  const buffer = await generateHelpCard(prefix);

  await interaction.editReply({
    files: [new AttachmentBuilder(buffer, { name: "yardim.png" })],
  });
}
