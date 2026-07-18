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
  const target = interaction.options.getMember("kullanici");
  const sebep =
    interaction.options.getString("sebep") ?? "Sebep belirtilmedi";

  if (!(target instanceof GuildMember)) {
    await interaction.reply({
      content: "❌ Kullanıcı bu sunucuda bulunamadı.",
      ephemeral: true,
    });
    return;
  }

  if (!target.kickable) {
    await interaction.reply({
      content:
        "❌ Bu kullanıcıyı atamıyorum. Kullanıcının rolü botunkinden yüksek olabilir.",
      ephemeral: true,
    });
    return;
  }

  if (target.id === interaction.user.id) {
    await interaction.reply({
      content: "❌ Kendini atamazsın!",
      ephemeral: true,
    });
    return;
  }

  await target.kick(sebep);

  await interaction.reply({
    content: `✅ **${target.user.tag}** sunucudan atıldı.\n📝 Sebep: ${sebep}`,
  });
}
