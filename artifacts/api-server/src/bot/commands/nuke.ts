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
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild || !(interaction.channel instanceof TextChannel)) {
    await interaction.reply({ content: "❌ Bu komut sadece metin kanallarında çalışır.", ephemeral: true });
    return;
  }

  // Sadece sunucu sahibi veya yönetici kullanabilir
  const member = interaction.guild.members.cache.get(interaction.user.id)
    ?? await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  const isOwner = interaction.guild.ownerId === interaction.user.id;
  const isAdmin = member?.permissions.has(PermissionFlagsBits.Administrator) ?? false;

  if (!isOwner && !isAdmin) {
    await interaction.reply({ content: "❌ Bu komutu sadece sunucu sahibi veya yöneticiler kullanabilir.", ephemeral: true });
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
