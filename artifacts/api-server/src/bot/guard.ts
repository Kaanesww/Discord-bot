import { db } from "@workspace/db";
import { guardSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Message, GuildMember, Guild, TextChannel, GuildAuditLogsEntry, PermissionResolvable } from "discord.js";
import { AuditLogEvent } from "discord.js";
import { logger } from "../lib/logger";

// ── DB yardımcıları ──────────────────────────────────────────────────────────

export async function getGuard(guildId: string) {
  const rows = await db.select().from(guardSettingsTable).where(eq(guardSettingsTable.guildId, guildId)).limit(1);
  return rows[0] ?? {
    guildId, spamEnabled: false, spamThreshold: 5, spamAction: "delete",
    linkEnabled: false, linkAction: "delete", linkWhitelist: "[]",
    botEnabled: false, botAction: "kick",
    emojiEnabled: false, emojiMax: 5, emojiAction: "delete",
    roleEnabled: false, channelEnabled: false, logChannelId: null,
  };
}

export async function setGuard(guildId: string, patch: Partial<typeof guardSettingsTable.$inferInsert>): Promise<void> {
  await db.insert(guardSettingsTable)
    .values({ guildId, ...patch })
    .onConflictDoUpdate({ target: guardSettingsTable.guildId, set: patch });
}

// ── Log gönder ───────────────────────────────────────────────────────────────

async function sendLog(guild: Guild, logChannelId: string | null | undefined, msg: string): Promise<void> {
  if (!logChannelId) return;
  try {
    const ch = await guild.channels.fetch(logChannelId) as TextChannel | null;
    if (ch?.isTextBased()) await ch.send(`🛡️ **Guard Log** | ${msg}`);
  } catch { /* log kanalı bulunamadı */ }
}

// ── Spam: in-memory hız limiti ───────────────────────────────────────────────
// guildId -> userId -> timestamp dizisi

const spamMap = new Map<string, Map<string, number[]>>();

export async function handleSpam(message: Message): Promise<boolean> {
  if (!message.guildId || !message.member) return false;
  const cfg = await getGuard(message.guildId);
  if (!cfg.spamEnabled) return false;

  const gMap = spamMap.get(message.guildId) ?? new Map<string, number[]>();
  spamMap.set(message.guildId, gMap);

  const now = Date.now();
  const window = 5_000; // 5 saniye
  const times = (gMap.get(message.author.id) ?? []).filter(t => now - t < window);
  times.push(now);
  gMap.set(message.author.id, times);

  if (times.length < cfg.spamThreshold) return false;

  // Eşik aşıldı — aksiyonu uygula
  gMap.set(message.author.id, []); // sıfırla
  try {
    await message.delete().catch(() => null);
    const action = cfg.spamAction;
    const member = message.member;
    if (action === "warn") {
      await message.channel.send(`⚠️ ${message.author} spam yapıyorsun!`).then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    } else if (action === "mute") {
      await member.timeout(5 * 60_000, "Guard: Spam koruma").catch(() => null);
      await message.channel.send(`🔇 ${message.author} spam yaptığı için 5 dakika susturuldu.`).then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    } else if (action === "kick") {
      await member.kick("Guard: Spam koruma").catch(() => null);
    }
    await sendLog(message.guild!, cfg.logChannelId, `**Spam** → ${message.author.username} (${action}) — ${times.length} mesaj/5sn`);
  } catch (err) {
    logger.error({ err }, "Guard spam aksiyonu hatası");
  }
  return true;
}

// ── Link koruma ──────────────────────────────────────────────────────────────

const LINK_REGEX = /https?:\/\/\S+|discord\.gg\/\S+|www\.\S+\.\S+/gi;

export async function handleLink(message: Message): Promise<boolean> {
  if (!message.guildId || !message.member) return false;
  const cfg = await getGuard(message.guildId);
  if (!cfg.linkEnabled) return false;

  // Yöneticiler ve yetkililer muaf
  const perms: PermissionResolvable[] = ["ManageMessages", "Administrator"];
  if (perms.some(p => message.member!.permissions.has(p))) return false;

  const links = message.content.match(LINK_REGEX);
  if (!links) return false;

  // Whitelist kontrolü
  let whitelist: string[] = [];
  try { whitelist = JSON.parse(cfg.linkWhitelist); } catch { /**/ }
  const blocked = links.filter(l => !whitelist.some(w => l.includes(w)));
  if (!blocked.length) return false;

  try {
    await message.delete().catch(() => null);
    const action = cfg.linkAction;
    if (action === "warn") {
      await message.channel.send(`⚠️ ${message.author} link paylaşımı yasaktır!`).then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    } else if (action === "kick") {
      await message.member.kick("Guard: Link koruma").catch(() => null);
    }
    await sendLog(message.guild!, cfg.logChannelId, `**Link** → ${message.author.username} (${action}) — \`${blocked[0]}\``);
  } catch (err) {
    logger.error({ err }, "Guard link aksiyonu hatası");
  }
  return true;
}

// ── Emoji koruma ─────────────────────────────────────────────────────────────

const EMOJI_REGEX = /(\p{Emoji_Presentation}|\p{Extended_Pictographic}|<a?:\w+:\d+>)/gu;

export async function handleEmoji(message: Message): Promise<boolean> {
  if (!message.guildId || !message.member) return false;
  const cfg = await getGuard(message.guildId);
  if (!cfg.emojiEnabled) return false;

  const perms: PermissionResolvable[] = ["ManageMessages", "Administrator"];
  if (perms.some(p => message.member!.permissions.has(p))) return false;

  const matches = message.content.match(EMOJI_REGEX) ?? [];
  if (matches.length <= cfg.emojiMax) return false;

  try {
    await message.delete().catch(() => null);
    if (cfg.emojiAction === "warn") {
      await message.channel.send(`⚠️ ${message.author} çok fazla emoji kullandın! (Max: ${cfg.emojiMax})`).then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }
    await sendLog(message.guild!, cfg.logChannelId, `**Emoji** → ${message.author.username} — ${matches.length} emoji (max ${cfg.emojiMax})`);
  } catch (err) {
    logger.error({ err }, "Guard emoji aksiyonu hatası");
  }
  return true;
}

// ── Bot koruma ───────────────────────────────────────────────────────────────

export async function handleBotJoin(member: GuildMember): Promise<void> {
  if (!member.user.bot) return;
  const cfg = await getGuard(member.guild.id);
  if (!cfg.botEnabled) return;

  try {
    if (cfg.botAction === "ban") {
      await member.ban({ reason: "Guard: Bot koruma — bot girişi engellendi" });
    } else {
      await member.kick("Guard: Bot koruma — bot girişi engellendi");
    }
    await sendLog(member.guild, cfg.logChannelId, `**Bot Engel** → \`${member.user.username}\` (${member.user.id}) — ${cfg.botAction}`);
  } catch (err) {
    logger.error({ err }, "Guard bot aksiyonu hatası");
  }
}

// ── Rol koruma (mass role grant/revoke) ──────────────────────────────────────
// Kısa sürede çok fazla rol değişikliği → uyar

const roleChangeMap = new Map<string, { count: number; ts: number }>();

export async function handleRoleUpdate(guild: Guild, entry: GuildAuditLogsEntry): Promise<void> {
  const cfg = await getGuard(guild.id);
  if (!cfg.roleEnabled) return;

  const executorId = entry.executor?.id;
  if (!executorId) return;

  const key = `${guild.id}:${executorId}`;
  const now = Date.now();
  const prev = roleChangeMap.get(key);

  if (prev && now - prev.ts < 10_000) {
    prev.count++;
    roleChangeMap.set(key, prev);
  } else {
    roleChangeMap.set(key, { count: 1, ts: now });
  }

  const record = roleChangeMap.get(key)!;
  if (record.count >= 5) {
    roleChangeMap.set(key, { count: 0, ts: now }); // sıfırla
    await sendLog(guild, cfg.logChannelId, `⚠️ **Rol Saldırısı Şüphesi** → <@${executorId}> 10 saniyede ${record.count}+ rol değişikliği yaptı!`);
    // Moderatörü 5 dakika sustur
    try {
      const member = await guild.members.fetch(executorId);
      if (!member.permissions.has("Administrator")) {
        await member.timeout(5 * 60_000, "Guard: Şüpheli toplu rol değişikliği");
      }
    } catch { /**/ }
  }
}

// ── Kanal koruma (mass create/delete) ────────────────────────────────────────

const channelChangeMap = new Map<string, { count: number; ts: number }>();

export async function handleChannelChange(guild: Guild, entry: GuildAuditLogsEntry): Promise<void> {
  const cfg = await getGuard(guild.id);
  if (!cfg.channelEnabled) return;

  const executorId = entry.executor?.id;
  if (!executorId) return;

  const key = `${guild.id}:${executorId}`;
  const now = Date.now();
  const prev = channelChangeMap.get(key);

  if (prev && now - prev.ts < 10_000) {
    prev.count++;
    channelChangeMap.set(key, prev);
  } else {
    channelChangeMap.set(key, { count: 1, ts: now });
  }

  const record = channelChangeMap.get(key)!;
  if (record.count >= 4) {
    channelChangeMap.set(key, { count: 0, ts: now });
    await sendLog(guild, cfg.logChannelId, `⚠️ **Kanal Saldırısı Şüphesi** → <@${executorId}> 10 saniyede ${record.count}+ kanal değişikliği yaptı!`);
    try {
      const member = await guild.members.fetch(executorId);
      if (!member.permissions.has("Administrator")) {
        await member.timeout(5 * 60_000, "Guard: Şüpheli toplu kanal değişikliği");
      }
    } catch { /**/ }
  }
}
