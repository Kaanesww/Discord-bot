import {
  ChatInputCommandInteraction,
  GuildMember,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("kick")
  .setDescription("Bir kullanıcıyı sunucudan atar")
  .addUserOption((option) =>
    option
      .setName("kullanici")
      .setDescription("Atacağın kullanıcı")
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName("sebep")
      .setDescription("Atma sebebi")
      .setRequired(false),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers);

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "❌ Bu komut sadece sunucularda çalışır.", ephemeral: true });
    return;
  }

  const targetUser = interaction.options.getUser("kullanici", true);
  const sebep = interaction.options.getString("sebep") ?? "Sebep belirtilmedi";

  await interaction.deferReply();

  let target: GuildMember;
  try {
    target = await interaction.guild.members.fetch(targetUser.id);
  } catch {
    await interaction.editReply("❌ Kullanıcı bu sunucuda bulunamadı.");
    return;
  }

  if (!target.kickable) {
    await interaction.editReply(
      "❌ Bu kullanıcıyı atamıyorum. Kullanıcının rolü botunkinden yüksek olabilir.",
    );
    return;
  }

  if (target.id === interaction.user.id) {
    await interaction.editReply("❌ Kendini atamazsın!");
    return;
  }

  await target.kick(sebep);
  await interaction.editReply(
    `✅ **${target.user.tag}** sunucudan atıldı.\n📝 Sebep: ${sebep}`,
  );
}
