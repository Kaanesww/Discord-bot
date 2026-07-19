import {
  ChatInputCommandInteraction, PermissionFlagsBits, SlashCommandBuilder,
  TextChannel, ChannelType, EmbedBuilder, ButtonBuilder, ButtonStyle,
  ActionRowBuilder, ComponentType,
} from "discord.js";
import { isOwner } from "../ownerUtils";

export const data = new SlashCommandBuilder()
  .setName("nuke")
  .setDescription("Kanalı siler ve aynı ayarlarla yeniden oluşturur")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild || !(interaction.channel instanceof TextChannel)) {
    await interaction.reply({ content: "❌ Bu komut sadece metin kanallarında çalışır.", ephemeral: true }); return;
  }
  const guildOwner = interaction.guild.ownerId === interaction.user.id;
  const member = interaction.guild.members.cache.get(interaction.user.id) ?? await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  const hasAdmin = member?.permissions.has(PermissionFlagsBits.Administrator) ?? false;

  if (!isOwner(interaction.user.id) && !guildOwner && !hasAdmin) {
    await interaction.reply({ content: "❌ Sadece sunucu sahibi veya yöneticiler kullanabilir.", ephemeral: true }); return;
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("nuke_confirm").setLabel("💥 NUKE ET").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("nuke_cancel").setLabel("❌ İptal").setStyle(ButtonStyle.Secondary),
  );
  await interaction.reply({
    embeds: [new EmbedBuilder().setColor(0xed4245).setTitle("⚠️ NUKE Onayı")
      .setDescription(`**<#${interaction.channelId}>** kanalını tamamen nuke etmek istediğine emin misin?\n\nKanal silinip aynı ayarlarla yeniden oluşturulacak.`)
      .setFooter({ text: "30 saniye içinde onayla." })],
    components: [row],
  });

  const msg = await interaction.fetchReply();
  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) => i.user.id === interaction.user.id,
    time: 30_000, max: 1,
  });

  collector.on("collect", async (i) => {
    if (i.customId === "nuke_cancel") {
      await i.update({ embeds: [new EmbedBuilder().setColor(0x72767d).setTitle("❌ İptal Edildi")], components: [] }); return;
    }
    await i.update({ embeds: [new EmbedBuilder().setColor(0xed4245).setTitle("💥 Nuke ediliyor...")], components: [] });
    const ch = interaction.channel as TextChannel;
    const { name, topic, nsfw, rateLimitPerUser, position, parentId } = ch;
    const overwrites = ch.permissionOverwrites.cache.map((o) => ({ id: o.id, allow: o.allow, deny: o.deny, type: o.type }));
    await ch.delete(`Nuke — ${interaction.user.tag}`);
    const newCh = await interaction.guild!.channels.create({
      name, type: ChannelType.GuildText, topic: topic ?? undefined, nsfw,
      rateLimitPerUser, position, parent: parentId ?? undefined, permissionOverwrites: overwrites,
    });
    await newCh.send("💥 **NUKE!** Kanal temizlendi ve yeniden oluşturuldu.");
  });

  collector.on("end", async (c) => {
    if (c.size === 0) await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x72767d).setTitle("⏰ Süre Doldu").setDescription("Nuke iptal edildi.")], components: [] });
  });
}
