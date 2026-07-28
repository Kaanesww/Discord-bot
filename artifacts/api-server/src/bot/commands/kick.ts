import {
  ChatInputCommandInteraction, GuildMember, PermissionFlagsBits,
  SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle,
  ActionRowBuilder, ComponentType,
} from "discord.js";
import { logAction } from "../moderation";
import { isOwner } from "../ownerUtils";

export const data = new SlashCommandBuilder()
  .setName("kick")
  .setDescription("Bir kullanıcıyı sunucudan atar")
  .addUserOption((o) => o.setName("kullanici").setDescription("Atılacak kullanıcı").setRequired(true))
  .addStringOption((o) => o.setName("sebep").setDescription("Sebep").setRequired(false))
  .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) { await interaction.reply({ content: "❌ Sadece sunucularda çalışır.", ephemeral: true }); return; }

  // Yetki kontrolü (bot sahibi bypass)
  if (!isOwner(interaction.user.id) && !interaction.memberPermissions?.has(PermissionFlagsBits.KickMembers)) {
    await interaction.reply({ content: "❌ **Kick Members** iznin yok.", ephemeral: true }); return;
  }

  const targetUser = interaction.options.getUser("kullanici", true);
  const sebep = interaction.options.getString("sebep") ?? "Sebep belirtilmedi";

  if (targetUser.id === interaction.user.id) { await interaction.reply({ content: "❌ Kendini atamazsın!", ephemeral: true }); return; }

  let member: GuildMember;
  try { member = await interaction.guild.members.fetch(targetUser.id); }
  catch { await interaction.reply({ content: "❌ Kullanıcı bu sunucuda bulunamadı.", ephemeral: true }); return; }

  if (!member.kickable && !isOwner(interaction.user.id)) {
    await interaction.reply({ content: "❌ Bu kullanıcıyı atamıyorum.", ephemeral: true }); return;
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("kick_confirm").setLabel("✅ Onayla").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("kick_cancel").setLabel("❌ İptal").setStyle(ButtonStyle.Secondary),
  );
  const confirmEmbed = new EmbedBuilder()
    .setColor(0xfaa61a).setTitle("⚠️ Kick Onayı")
    .setThumbnail(targetUser.displayAvatarURL())
    .setDescription(`**${targetUser.tag}** adlı kullanıcıyı atmak istediğine emin misin?\n**Sebep:** ${sebep}`)
    .setFooter({ text: "30 saniye içinde onayla." });

  await interaction.reply({ embeds: [confirmEmbed], components: [row] });
  const msg = await interaction.fetchReply();
  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) => i.user.id === interaction.user.id,
    time: 30_000, max: 1,
  });

  collector.on("collect", async (i) => {
    if (i.customId === "kick_cancel") {
      await i.update({ embeds: [new EmbedBuilder().setColor(0x72767d).setTitle("❌ İptal Edildi").setDescription("Kick işlemi iptal edildi.")], components: [] }); return;
    }
    await member.kick(`${interaction.user.tag}: ${sebep}`).catch(() => null);
    await logAction({ guildId: interaction.guildId!, userId: targetUser.id, moderatorId: interaction.user.id, action: "kick", reason: sebep });
    const embed = new EmbedBuilder().setColor(0xed4245).setTitle("👢 Kullanıcı Atıldı")
      .setThumbnail(targetUser.displayAvatarURL())
      .addFields({ name: "Kullanıcı", value: `${targetUser.tag}`, inline: true }, { name: "Moderatör", value: `<@${interaction.user.id}>`, inline: true }, { name: "Sebep", value: sebep })
      .setTimestamp();
    await i.update({ embeds: [embed], components: [] });
  });

  collector.on("end", async (c) => {
    if (c.size === 0) await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x72767d).setTitle("⏰ Süre Doldu").setDescription("Kick iptal edildi.")], components: [] });
  });
}
