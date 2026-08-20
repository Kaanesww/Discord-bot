import { db } from "@workspace/db";
import { statChannelsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Guild } from "discord.js";
import { ChannelType, PermissionFlagsBits } from "discord.js";
import { logger } from "../lib/logger";

export async function getStatChannels(guildId: string) {
  const rows = await db.select().from(statChannelsTable).where(eq(statChannelsTable.guildId, guildId)).limit(1);
  return rows[0] ?? null;
}

export async function saveStatChannels(data: typeof statChannelsTable.$inferInsert): Promise<void> {
  await db.insert(statChannelsTable)
    .values(data)
    .onConflictDoUpdate({ target: statChannelsTable.guildId, set: data });
}

export async function removeStatChannels(guildId: string): Promise<void> {
  await db.delete(statChannelsTable).where(eq(statChannelsTable.guildId, guildId));
}

// ── İstatistik kanallarını güncelle ─────────────────────────────────────────

export async function updateStatChannels(guild: Guild): Promise<void> {
  const stored = await getStatChannels(guild.id);
  if (!stored) return;

  await guild.members.fetch().catch(() => null); // cache güncelle

  const total   = guild.memberCount;
  const bots    = guild.members.cache.filter(m => m.user.bot).size;
  const humans  = total - bots;
  const online  = guild.members.cache.filter(m => !m.user.bot && m.presence?.status !== "offline" && m.presence !== null).size;
  const chCount = guild.channels.cache.filter(c => c.type !== ChannelType.GuildCategory).size;
  const rlCount = guild.roles.cache.size - 1; // @everyone hariç

  const updates: Array<{ id: string | null | undefined; name: string }> = [
    { id: stored.totalChannelId,    name: `👥 Üyeler: ${humans.toLocaleString("tr-TR")}` },
    { id: stored.onlineChannelId,   name: `🟢 Çevrimiçi: ${online.toLocaleString("tr-TR")}` },
    { id: stored.botsChannelId,     name: `🤖 Botlar: ${bots.toLocaleString("tr-TR")}` },
    { id: stored.chCountChannelId,  name: `📢 Kanallar: ${chCount.toLocaleString("tr-TR")}` },
    { id: stored.roleCountChannelId,name: `🎭 Roller: ${rlCount.toLocaleString("tr-TR")}` },
  ];

  for (const u of updates) {
    if (!u.id) continue;
    try {
      const ch = await guild.channels.fetch(u.id).catch(() => null);
      if (ch) await ch.setName(u.name);
    } catch (err) {
      logger.error({ err, channelId: u.id }, "Stat kanal güncellenemedi");
    }
  }
}

// ── Stat kanalları kur ───────────────────────────────────────────────────────

export async function setupStatChannels(guild: Guild): Promise<void> {
  // Eski kanalları sil
  const existing = await getStatChannels(guild.id);
  if (existing) {
    const ids = [existing.categoryId, existing.totalChannelId, existing.onlineChannelId,
                 existing.botsChannelId, existing.chCountChannelId, existing.roleCountChannelId];
    for (const id of ids) {
      if (!id) continue;
      try { const ch = await guild.channels.fetch(id).catch(() => null); if (ch) await ch.delete(); } catch { /**/ }
    }
    await removeStatChannels(guild.id);
  }

  const denyView = [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.Connect] }];

  // Kategori oluştur
  const category = await guild.channels.create({
    name: "📊 Sunucu İstatistikleri",
    type: ChannelType.GuildCategory,
  });

  const makeVoice = (name: string) => guild.channels.create({
    name,
    type: ChannelType.GuildVoice,
    parent: category.id,
    permissionOverwrites: denyView,
  });

  const [totalCh, onlineCh, botsCh, chCountCh, roleCh] = await Promise.all([
    makeVoice("👥 Üyeler: ..."),
    makeVoice("🟢 Çevrimiçi: ..."),
    makeVoice("🤖 Botlar: ..."),
    makeVoice("📢 Kanallar: ..."),
    makeVoice("🎭 Roller: ..."),
  ]);

  await saveStatChannels({
    guildId:           guild.id,
    categoryId:        category.id,
    totalChannelId:    totalCh.id,
    onlineChannelId:   onlineCh.id,
    botsChannelId:     botsCh.id,
    chCountChannelId:  chCountCh.id,
    roleCountChannelId: roleCh.id,
  });

  // Hemen güncelle
  await updateStatChannels(guild);
}
