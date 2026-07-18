import {
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
  EmbedBuilder,
} from "discord.js";
import { getLevelRoles, setLevelRole, removeLevelRole } from "../leveling";

export const data = new SlashCommandBuilder()
  .setName("levelrol")
  .setDescription("Seviye rol ödüllerini yönet")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addSubcommand((s) =>
    s
      .setName("ekle")
      .setDescription("Belirli bir seviyeye ulaşınca verilecek rol ekle")
      .addIntegerOption((o) =>
        o.setName("seviye").setDescription("Kaçıncı seviyede verilsin?").setMinValue(1).setRequired(true),
      )
      .addRoleOption((o) =>
        o.setName("rol").setDescription("Verilecek rol").setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName("kaldir")
      .setDescription("Seviye rol ödülünü kaldır")
      .addIntegerOption((o) =>
        o.setName("seviye").setDescription("Hangi seviye?").setMinValue(1).setRequired(true),
      ),
  )
  .addSubcommand((s) =>
    s.setName("liste").setDescription("Tüm seviye rol ödüllerini listele"),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: "❌ Bu komut sadece sunucularda çalışır.", ephemeral: true });
    return;
  }

  const sub = interaction.options.getSubcommand();

  if (sub === "ekle") {
    const level = interaction.options.getInteger("seviye", true);
    const role = interaction.options.getRole("rol", true);
    await setLevelRole(guildId, level, role.id);
    await interaction.reply(
      `✅ **${level}. seviye** için ${role} rolü eklendi! Bu seviyeye ulaşan herkes otomatik alacak.`,
    );
  } else if (sub === "kaldir") {
    const level = interaction.options.getInteger("seviye", true);
    const removed = await removeLevelRole(guildId, level);
    if (removed) {
      await interaction.reply(`✅ **${level}. seviye** rol ödülü kaldırıldı.`);
    } else {
      await interaction.reply({ content: `❌ **${level}. seviye** için kayıtlı bir rol bulunamadı.`, ephemeral: true });
    }
  } else {
    // liste
    await interaction.deferReply();
    const roles = await getLevelRoles(guildId);
    if (roles.length === 0) {
      await interaction.editReply("Henüz hiç seviye rol ödülü eklenmemiş.\n`/levelrol ekle` ile ekleyebilirsin.");
      return;
    }
    const embed = new EmbedBuilder()
      .setTitle("🏆 Seviye Rol Ödülleri")
      .setColor(0x5865f2)
      .setDescription(
        roles.map((r) => `**Seviye ${r.level}** → <@&${r.roleId}>`).join("\n"),
      )
      .setFooter({ text: "Seviyeye ulaşınca rol otomatik verilir" });
    await interaction.editReply({ embeds: [embed] });
  }
}
