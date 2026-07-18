import {
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextChannel,
  ChannelType,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("nuke")
  .setDescription("Kanalı siler ve aynı ayarlarla yeniden oluşturur")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild || !(interaction.channel instanceof TextChannel)) {
    await interaction.reply({ content: "❌ Bu komut sadece metin kanallarında çalışır.", ephemeral: true });
    return;
  }

  const channel = interaction.channel;

  // Kanal bilgilerini kaydet
  const name = channel.name;
  const topic = channel.topic ?? undefined;
  const nsfw = channel.nsfw;
  const rateLimitPerUser = channel.rateLimitPerUser;
  const position = channel.position;
  const parentId = channel.parentId ?? undefined;
  const permissionOverwrites = channel.permissionOverwrites.cache.map((overwrite) => ({
    id: overwrite.id,
    allow: overwrite.allow,
    deny: overwrite.deny,
    type: overwrite.type,
  }));

  // Kanalı sil ve aynı ayarlarla yeniden oluştur
  await channel.delete(`Nuke komutu — ${interaction.user.tag}`);

  const newChannel = await interaction.guild.channels.create({
    name,
    type: ChannelType.GuildText,
    topic,
    nsfw,
    rateLimitPerUser,
    position,
    parent: parentId,
    permissionOverwrites,
    reason: `Nuke komutu — ${interaction.user.tag}`,
  });

  await newChannel.send({
    content: "💥 **NUKE!** Kanal temizlendi ve yeniden oluşturuldu.",
  });
}
