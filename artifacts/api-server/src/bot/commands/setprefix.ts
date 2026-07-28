import {
  ChatInputCommandInteraction, PermissionFlagsBits, SlashCommandBuilder,
} from "discord.js";
import { setPrefix, getPrefix } from "../guildSettings";
import { isOwner } from "../ownerUtils";

export const data = new SlashCommandBuilder()
  .setName("setprefix")
  .setDescription("Bu sunucunun bot prefix'ini değiştirir")
  .addStringOption((option) => option.setName("prefix").setDescription("Yeni prefix (örnek: !, ?, $, >)").setMinLength(1).setMaxLength(5).setRequired(true))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) { await interaction.reply({ content: "❌ Bu komut sadece sunucularda çalışır.", ephemeral: true }); return; }

  if (!isOwner(interaction.user.id) && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: "❌ **Manage Server** iznin yok.", ephemeral: true }); return;
  }

  const newPrefix = interaction.options.getString("prefix", true);
  const oldPrefix = await getPrefix(guildId);
  await setPrefix(guildId, newPrefix);

  await interaction.reply(`✅ Prefix **\`${oldPrefix}\`** → **\`${newPrefix}\`** olarak değiştirildi.\nArtık komutları \`${newPrefix}kick\`, \`${newPrefix}level\`, \`${newPrefix}leaderboard\` şeklinde kullanabilirsin.`);
}
