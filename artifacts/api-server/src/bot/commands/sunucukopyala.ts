import {
  ChatInputCommandInteraction, SlashCommandBuilder, PermissionFlagsBits,
  ChannelType, OverwriteType,
} from "discord.js";

// Yardımcı: Bekleme fonksiyonu (rate-limit önlemi)
function sleep(ms: number) { return new Promise<void>((r) => setTimeout(r, ms)); }

export const data = new SlashCommandBuilder()
  .setName("sunucukopyala")
  .setDescription("🔁 Başka bir sunucuyu bu sunucuya kopyalar (kanallar, kategoriler, roller)")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption((o) =>
    o.setName("sunucu_id")
      .setDescription("Kopyalanacak sunucunun ID'si (bot o sunucuda olmalı)")
      .setRequired(true),
  )
  .addBooleanOption((o) =>
    o.setName("roller")
      .setDescription("Rolleri de kopyala? (varsayılan: evet)")
      .setRequired(false),
  )
  .addBooleanOption((o) =>
    o.setName("emojiler")
      .setDescription("Emojileri de kopyala? (varsayılan: hayır)")
      .setRequired(false),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild || !interaction.guildId) {
    await interaction.reply({ content: "❌ Sadece sunucularda çalışır.", ephemeral: true });
    return;
  }

  const sourceId     = interaction.options.getString("sunucu_id", true).trim();
  const copyRoles    = interaction.options.getBoolean("roller")   ?? true;
  const copyEmojis   = interaction.options.getBoolean("emojiler") ?? false;
  const targetGuild  = interaction.guild;

  // Bot kaynak sunucuda mı?
  const sourceGuild = interaction.client.guilds.cache.get(sourceId);
  if (!sourceGuild) {
    await interaction.reply({
      content:
        "❌ Bot bu sunucuda **değil** ya da ID hatalı!\n" +
        "Botu önce kopyalanacak sunucuya davet et, ardından komutu tekrar çalıştır.",
      ephemeral: true,
    });
    return;
  }

  if (sourceGuild.id === targetGuild.id) {
    await interaction.reply({ content: "❌ Aynı sunucuyu kopyalayamazsın.", ephemeral: true });
    return;
  }

  await interaction.deferReply();

  const log = (msg: string) =>
    interaction.editReply({ content: msg }).catch(() => null);

  let created = 0;
  const errors: string[] = [];

  // Rol eşleştirme: sourceRoleId → targetRoleId
  const roleMap = new Map<string, string>();
  // Hedef sunucudaki @everyone ID
  roleMap.set(sourceGuild.id, targetGuild.id);

  // ── 1. ROL KLONLAMA ───────────────────────────────────────
  if (copyRoles) {
    await log("⏳ **[1/4]** Roller kopyalanıyor...");

    const sortedRoles = [...sourceGuild.roles.cache.values()]
      .filter((r) => !r.managed && r.id !== sourceGuild.id)
      .sort((a, b) => a.position - b.position); // düşükten yükseğe

    for (const role of sortedRoles) {
      try {
        const newRole = await targetGuild.roles.create({
          name:        role.name,
          color:       role.color,
          hoist:       role.hoist,
          permissions: role.permissions,
          mentionable: role.mentionable,
          reason:      `Sunucu kopyalandı: ${sourceGuild.name}`,
        });
        roleMap.set(role.id, newRole.id);
        created++;
      } catch (e) {
        errors.push(`Rol: ${role.name}`);
      }
      await sleep(300); // Rate-limit koruması
    }
  }

  // ── 2. KATEGORİ KLONLAMA ─────────────────────────────────
  await log(`⏳ **[2/4]** Kategoriler oluşturuluyor... (${created} tamamlandı)`);

  const categoryMap = new Map<string, string>(); // sourceCatId → targetCatId

  const categories = [...sourceGuild.channels.cache.values()]
    .filter((c) => c.type === ChannelType.GuildCategory)
    .sort((a, b) => a.position - b.position);

  for (const cat of categories) {
    try {
      // İzin geçişi
      const overwrites = [...cat.permissionOverwrites.cache.values()].map((ow) => ({
        id:    ow.type === OverwriteType.Role ? (roleMap.get(ow.id) ?? targetGuild.id) : ow.id,
        type:  ow.type,
        allow: ow.allow,
        deny:  ow.deny,
      }));

      const newCat = await targetGuild.channels.create({
        name:                 cat.name,
        type:                 ChannelType.GuildCategory,
        position:             cat.position,
        permissionOverwrites: overwrites,
        reason:               `Sunucu kopyalandı: ${sourceGuild.name}`,
      });
      categoryMap.set(cat.id, newCat.id);
      created++;
    } catch {
      errors.push(`Kategori: ${cat.name}`);
    }
    await sleep(400);
  }

  // ── 3. KANAL KLONLAMA ─────────────────────────────────────
  await log(`⏳ **[3/4]** Kanallar oluşturuluyor... (${created} tamamlandı)`);

  const textChannelTypes = [
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
    ChannelType.GuildForum,
  ];

  const channels = [...sourceGuild.channels.cache.values()]
    .filter((c) => c.type !== ChannelType.GuildCategory)
    .sort((a, b) => a.position - b.position);

  for (const ch of channels) {
    try {
      const parentId = "parentId" in ch && ch.parentId ? categoryMap.get(ch.parentId) : undefined;

      const overwrites = [...ch.permissionOverwrites.cache.values()].map((ow) => ({
        id:    ow.type === OverwriteType.Role ? (roleMap.get(ow.id) ?? targetGuild.id) : ow.id,
        type:  ow.type,
        allow: ow.allow,
        deny:  ow.deny,
      }));

      if (textChannelTypes.includes(ch.type as ChannelType)) {
        await targetGuild.channels.create({
          name:                 ch.name,
          type:                 ch.type as ChannelType.GuildText,
          parent:               parentId,
          topic:                "topic" in ch ? (ch.topic ?? undefined) : undefined,
          nsfw:                 "nsfw" in ch ? ch.nsfw : false,
          rateLimitPerUser:     "rateLimitPerUser" in ch ? ch.rateLimitPerUser : 0,
          position:             ch.position,
          permissionOverwrites: overwrites,
          reason:               `Sunucu kopyalandı: ${sourceGuild.name}`,
        });
        created++;
      } else if (ch.type === ChannelType.GuildVoice || ch.type === ChannelType.GuildStageVoice) {
        await targetGuild.channels.create({
          name:                 ch.name,
          type:                 ch.type,
          parent:               parentId,
          bitrate:              "bitrate" in ch ? Math.min(ch.bitrate, 96000) : 64000,
          userLimit:            "userLimit" in ch ? ch.userLimit : 0,
          position:             ch.position,
          permissionOverwrites: overwrites,
          reason:               `Sunucu kopyalandı: ${sourceGuild.name}`,
        });
        created++;
      }
    } catch {
      errors.push(`Kanal: ${ch.name}`);
    }
    await sleep(400);
  }

  // ── 4. EMOJİ KLONLAMA (opsiyonel) ────────────────────────
  if (copyEmojis) {
    await log(`⏳ **[4/4]** Emojiler kopyalanıyor... (${created} tamamlandı)`);
    const emojis = [...sourceGuild.emojis.cache.values()].filter((e) => !e.managed);
    for (const emoji of emojis) {
      if (!emoji.imageURL()) continue;
      try {
        await targetGuild.emojis.create({
          attachment: emoji.imageURL()!,
          name:       emoji.name ?? "emoji",
          reason:     `Sunucu kopyalandı: ${sourceGuild.name}`,
        });
        created++;
      } catch {
        errors.push(`Emoji: ${emoji.name}`);
      }
      await sleep(500);
    }
  }

  // ── SONUÇ ────────────────────────────────────────────────
  const errorSummary = errors.length
    ? `\n\n⚠️ **${errors.length}** öğe atlandı (yetersiz izin veya sınır):\n` +
      errors.slice(0, 10).map((e) => `  • ${e}`).join("\n") +
      (errors.length > 10 ? `\n  • ...ve ${errors.length - 10} daha` : "")
    : "";

  await interaction.editReply({
    content:
      `✅ **Kopyalama tamamlandı!**\n` +
      `📌 Kaynak: **${sourceGuild.name}** (\`${sourceGuild.id}\`)\n` +
      `📥 Hedef:  **${targetGuild.name}**\n\n` +
      `📊 Oluşturulan: **${created}** öğe` +
      (copyRoles  ? ` | Roller ✅` : "") +
      (copyEmojis ? ` | Emojiler ✅` : "") +
      errorSummary,
  });
}
