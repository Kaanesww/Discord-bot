import {
  ChatInputCommandInteraction, GuildMember, PermissionFlagsBits,
  SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle,
  ActionRowBuilder, ComponentType,
} from "discord.js";
import { logAction } from "../moderation";

export const data = new SlashCommandBuilder()
  .setName("ban")
  .setDescription("Bir kullanıcıyı sunucudan yasaklar")
  .addUserOption((o) => o.setName("kullanici").setDescription("Yasaklanacak kullanıcı").setRequired(true))
  .addStringOption((o) => o.setName("sebep").setDescription("Yasak sebebi").setRequired(false))
  .addIntegerOption((o) => o.setName("mesaj_sil").setDescription("Son kaç günün mesajı silinsin? (0-7)").setMinValue(0).setMaxValue(7).setRequired(false))
  .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) { await interaction.reply({ content: "❌ Sadece sunucularda çalışır.", ephemeral: true }); return; }
  const targetUser = interaction.options.getUser("kullanici", true);
  const sebep = interaction.options.getString("sebep") ?? "Sebep belirtilmedi";
  const deleteDays = interaction.options.getInteger("mesaj_sil") ?? 0;

  if (targetUser.id === interaction.user.id) { await interaction.reply({ content: "❌ Kendini yasaklayamazsın!", ephemeral: true }); return; }

  let member: GuildMember | null = null;
  try { member = await interaction.guild.members.fetch(targetUser.id); } catch { /* sunucuda değil */ }
  if (member && !member.bannable) { await interaction.reply({ content: "❌ Bu kullanıcıyı yasaklayamıyorum.", ephemeral: true }); return; }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("ban_confirm").setLabel("🔨 YASAK VER").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("ban_cancel").setLabel("❌ İptal").setStyle(ButtonStyle.Secondary),
  );
  const confirmEmbed = new EmbedBuilder()
    .setColor(0xeb459e)
    .setTitle("⚠️ Ban Onayı")
    .setThumbnail(targetUser.displayAvatarURL())
    .setDescription(`**${targetUser.tag}** adlı kullanıcıyı **kalıcı olarak** yasaklamak istediğine emin misin?\n**Sebep:** ${sebep}`)
    .setFooter({ text: "Bu işlem geri alınabilir (/unban). 30 saniye içinde onayla." });

  await interaction.reply({ embeds: [confirmEmbed], components: [row] });
  const msg = await interaction.fetchReply();

  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) => i.user.id === interaction.user.id,
    time: 30_000, max: 1,
  });

  collector.on("collect", async (i) => {
    if (i.customId === "ban_cancel") {
      await i.update({ embeds: [new EmbedBuilder().setColor(0x72767d).setTitle("❌ İptal Edildi").setDescription("Ban işlemi iptal edildi.")], components: [] });
      return;
    }
    await interaction.guild!.bans.create(targetUser.id, { reason: `${interaction.user.tag}: ${sebep}`, deleteMessageDays: deleteDays as 0|1|2|3|4|5|6|7 });
    await logAction({ guildId: interaction.guildId!, userId: targetUser.id, moderatorId: interaction.user.id, action: "ban", reason: sebep });
    const embed = new EmbedBuilder().setColor(0xeb459e).setTitle("🔨 Kullanıcı Yasaklandı")
      .setThumbnail(targetUser.displayAvatarURL())
      .addFields(
        { name: "Kullanıcı", value: `${targetUser.tag} (<@${targetUser.id}>)`, inline: true },
        { name: "Moderatör", value: `<@${interaction.user.id}>`, inline: true },
        { name: "Sebep", value: sebep },
      ).setTimestamp();
    await i.update({ embeds: [embed], components: [] });
  });

  collector.on("end", async (c) => {
    if (c.size === 0) await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x72767d).setTitle("⏰ Süre Doldu").setDescription("Ban iptal edildi.")], components: [] });
  });
}
