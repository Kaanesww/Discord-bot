import { ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { getUserLevel, getRank, xpToNextLevel, xpForLevel } from "../leveling";

export const data = new SlashCommandBuilder()
  .setName("level")
  .setDescription("Seviyeni ve XP istatistiklerini gösterir")
  .addUserOption((o) =>
    o.setName("kullanici").setDescription("Başka birinin seviyesini gör").setRequired(false),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: "❌ Bu komut sadece sunucularda çalışır.", ephemeral: true });
    return;
  }

  const target = interaction.options.getUser("kullanici") ?? interaction.user;
  await interaction.deferReply();

  const userData = await getUserLevel(target.id, guildId);
  const rank = await getRank(target.id, guildId);
  const { current: lvlXp, needed } = xpToNextLevel(userData.xp, userData.level);

  const filled = Math.round((lvlXp / needed) * 12);
  const bar = "█".repeat(filled) + "░".repeat(12 - filled);
  const pct = Math.round((lvlXp / needed) * 100);

  // Sonraki 3 seviyeye ne kadar kaldığını hesapla
  let remaining = needed - lvlXp;
  const nextLevels: string[] = [];
  for (let i = 1; i <= 3; i++) {
    nextLevels.push(`**Seviye ${userData.level + i}** — ${remaining.toLocaleString()} XP sonra`);
    remaining += xpForLevel(userData.level + i + 1);
  }

  const embed = new EmbedBuilder()
    .setAuthor({
      name: target.displayName,
      iconURL: target.displayAvatarURL({ size: 64 }),
    })
    .setColor(0x5865f2)
    .setThumbnail(target.displayAvatarURL({ size: 128 }))
    .addFields(
      { name: "🏅 Sıra", value: `#${rank}`, inline: true },
      { name: "⭐ Seviye", value: String(userData.level), inline: true },
      { name: "💬 Mesaj", value: userData.messageCount.toLocaleString(), inline: true },
      { name: "✨ Toplam XP", value: userData.xp.toLocaleString(), inline: true },
      { name: "📊 Bu Seviyede", value: `${lvlXp.toLocaleString()} / ${needed.toLocaleString()} XP`, inline: true },
      { name: "⚡ İlerleme", value: `${pct}%`, inline: true },
      {
        name: `[${bar}] %${pct}`,
        value: nextLevels.join("\n"),
      },
    )
    .setFooter({ text: "v! botu • XP her mesajda kazanılır (60 sn bekleme)" });

  await interaction.editReply({ embeds: [embed] });
}
