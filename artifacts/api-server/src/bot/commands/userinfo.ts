import {
  ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, GuildMember,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("kullanicibilgi")
  .setDescription("👤 Bir kullanıcı hakkında bilgi gösterir")
  .addUserOption((o) =>
    o.setName("kullanici").setDescription("Bilgisi gösterilecek kullanıcı (boş = sen)").setRequired(false),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const target = interaction.options.getUser("kullanici") ?? interaction.user;
  await interaction.deferReply();

  const member = await interaction.guild?.members.fetch(target.id).catch(() => null);

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
    .setTitle(`👤 ${target.displayName}`)
    .setThumbnail(target.displayAvatarURL({ size: 256 }))
    .setColor(
      member instanceof GuildMember
        ? ((member.displayHexColor as `#${string}`) || "#5865f2")
        : "#5865f2",
    )
    .addFields(
      { name: "🆔 ID", value: target.id, inline: true },
      { name: "🤖 Bot", value: target.bot ? "Evet" : "Hayır", inline: true },
      { name: "📅 Hesap Oluşturulma", value: `<t:${createdAt}:F> (<t:${createdAt}:R>)` },
      ...(joinedAt ? [{ name: "🚪 Sunucuya Giriş", value: `<t:${joinedAt}:F> (<t:${joinedAt}:R>)` }] : []),
      ...(roles.length ? [{ name: `🎭 Roller (${roles.length})`, value: roles.join(", ") }] : []),
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
