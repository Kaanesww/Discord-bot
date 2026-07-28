import {
  ChatInputCommandInteraction, PermissionFlagsBits, SlashCommandBuilder, TextChannel,
} from "discord.js";
import { isOwner } from "../ownerUtils";

export const data = new SlashCommandBuilder()
  .setName("temizle")
  .setDescription("Kanaldaki mesajları toplu siler (maks. 100)")
  .addIntegerOption((o) => o.setName("adet").setDescription("Silinecek mesaj sayısı (1-100)").setMinValue(1).setMaxValue(100).setRequired(true))
  .addUserOption((o) => o.setName("kullanici").setDescription("Sadece bu kullanıcının mesajlarını sil").setRequired(false))
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild || !(interaction.channel instanceof TextChannel)) {
    await interaction.reply({ content: "❌ Bu komut sadece metin kanallarında çalışır.", ephemeral: true }); return;
  }

  if (!isOwner(interaction.user.id) && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
    await interaction.reply({ content: "❌ **Manage Messages** iznin yok.", ephemeral: true }); return;
  }

  const adet = interaction.options.getInteger("adet", true);
  const filterUser = interaction.options.getUser("kullanici");
  await interaction.deferReply({ ephemeral: true });

  const messages = await interaction.channel.messages.fetch({ limit: adet });
  const toDelete = filterUser ? messages.filter((m) => m.author.id === filterUser.id) : messages;
  if (toDelete.size === 0) { await interaction.editReply("❌ Silinecek mesaj bulunamadı."); return; }

  const deleted = await interaction.channel.bulkDelete(toDelete, true);
  await interaction.editReply(`🗑️ **${deleted.size}** mesaj silindi${filterUser ? ` (<@${filterUser.id}> kullanıcısına ait)` : ""}.`);
}
