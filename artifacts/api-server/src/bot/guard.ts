import { db, pool } from "@workspace/db";
import { guardSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type {
  Message,
  PartialMessage,
  GuildMember,
  PartialGuildMember,
  Guild,
  TextChannel,
  GuildAuditLogsEntry,
  PermissionResolvable,
} from "discord.js";
import { AuditLogEvent, EmbedBuilder } from "discord.js";
import { logger } from "../lib/logger";
import { sendMessageChannel } from "./types";

// ── DB yardımcıları ──────────────────────────────────────────────────────────

type GuardConfig = typeof guardSettingsTable.$inferSelect;
const guardCache = new Map<string, { value: GuardConfig; expiresAt: number }>();
const GUARD_CACHE_TTL = 15_000;

const defaultGuard = (guildId: string): GuardConfig => ({
  guildId,
  spamEnabled: false,
  spamThreshold: 5,
  spamAction: "delete",
  linkEnabled: false,
  linkAction: "delete",
  linkWhitelist: "[]",
  botEnabled: false,
  botAction: "kick",
  emojiEnabled: false,
  emojiMax: 5,
  emojiAction: "delete",
  roleEnabled: false,
  channelEnabled: false,
  logsEnabled: false,
  logChannelId: null,
  banLogChannelId: null,
  muteLogChannelId: null,
  messageLogChannelId: null,
  deletedMessageLogChannelId: null,
  generalLogChannelId: null,
  protectionLogChannelId: null,
  memberLogChannelId: null,
});

export async function ensureGuardSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS guard_settings (
      guild_id TEXT PRIMARY KEY NOT NULL,
      spam_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      spam_threshold INTEGER NOT NULL DEFAULT 5,
      spam_action TEXT NOT NULL DEFAULT 'delete',
      link_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      link_action TEXT NOT NULL DEFAULT 'delete',
      link_whitelist TEXT NOT NULL DEFAULT '[]',
      bot_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      bot_action TEXT NOT NULL DEFAULT 'kick',
      emoji_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      emoji_max INTEGER NOT NULL DEFAULT 5,
      emoji_action TEXT NOT NULL DEFAULT 'delete',
      role_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      channel_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      logs_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      log_channel_id TEXT,
      ban_log_channel_id TEXT,
      mute_log_channel_id TEXT,
      message_log_channel_id TEXT,
      deleted_message_log_channel_id TEXT,
      general_log_channel_id TEXT
      , protection_log_channel_id TEXT
      , member_log_channel_id TEXT
    )
  `);
  await pool.query(`
    ALTER TABLE guard_settings
      ADD COLUMN IF NOT EXISTS logs_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS ban_log_channel_id TEXT,
      ADD COLUMN IF NOT EXISTS mute_log_channel_id TEXT,
      ADD COLUMN IF NOT EXISTS message_log_channel_id TEXT,
      ADD COLUMN IF NOT EXISTS deleted_message_log_channel_id TEXT,
      ADD COLUMN IF NOT EXISTS general_log_channel_id TEXT
      , ADD COLUMN IF NOT EXISTS protection_log_channel_id TEXT
      , ADD COLUMN IF NOT EXISTS member_log_channel_id TEXT
  `);
}

export async function getGuard(guildId: string) {
  const cached = guardCache.get(guildId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const rows = await db.select().from(guardSettingsTable).where(eq(guardSettingsTable.guildId, guildId)).limit(1);
  const value = rows[0] ?? defaultGuard(guildId);
  guardCache.set(guildId, { value, expiresAt: Date.now() + GUARD_CACHE_TTL });
  return value;
}

export async function setGuard(guildId: string, patch: Partial<typeof guardSettingsTable.$inferInsert>): Promise<void> {
  await db.insert(guardSettingsTable)
    .values({ guildId, ...patch })
    .onConflictDoUpdate({ target: guardSettingsTable.guildId, set: patch });
  guardCache.delete(guildId);
}

// ── Log gönder ───────────────────────────────────────────────────────────────

export type GuardLogCategory = "guard" | "ban" | "mute" | "message" | "deletedMessage" | "general" | "protection" | "member";

const logTitles: Record<GuardLogCategory, string> = {
  guard: "Guard Olayı",
  ban: "Ban Logu",
  mute: "Mute Logu",
  message: "Mesaj Logu",
  deletedMessage: "Silinen Mesaj Logu",
  general: "Genel İşlem Logu",
  protection: "Sunucu Koruma Logu",
  member: "Giriş / Çıkış Logu",
};

async function sendLogToChannel(guild: Guild, logChannelId: string | null | undefined, category: GuardLogCategory, msg: string): Promise<void> {
  if (!logChannelId) return;
  try {
    const ch = await guild.channels.fetch(logChannelId) as TextChannel | null;
    if (ch?.isSendable()) {
      const embed = new EmbedBuilder()
        .setColor(category === "general" ? 0x5865f2 : 0xed4245)
        .setTitle(`🛡️ ${logTitles[category]}`)
        .setDescription(msg.slice(0, 4000))
        .setFooter({ text: guild.name })
        .setTimestamp();
      await ch.send({ embeds: [embed] });
    }
  } catch { /* log kanalı bulunamadı */ }
}

function uniqueChannelIds(ids: Array<string | null | undefined>): string[] {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

export async function sendGuardLog(guild: Guild, category: GuardLogCategory, msg: string): Promise<void> {
  const cfg = await getGuard(guild.id);
  if (!cfg.logsEnabled) return;
  const specific = category === "ban"
    ? cfg.banLogChannelId
    : category === "mute"
      ? cfg.muteLogChannelId
      : category === "message"
        ? cfg.messageLogChannelId
        : category === "deletedMessage"
          ? cfg.deletedMessageLogChannelId
          : category === "general"
            ? cfg.generalLogChannelId
          : category === "protection"
            ? cfg.protectionLogChannelId
            : category === "member"
              ? cfg.memberLogChannelId
            : cfg.logChannelId;
  const ids = category === "general" || category === "protection" || category === "member"
    ? uniqueChannelIds([specific])
    : uniqueChannelIds([specific, cfg.generalLogChannelId]);
  await Promise.all(ids.map((id) => sendLogToChannel(guild, id, category, msg)));
}

async function sendLog(guild: Guild, logChannelId: string | null | undefined, msg: string): Promise<void> {
  const cfg = await getGuard(guild.id);
  if (!cfg.logsEnabled) return;
  const ids = uniqueChannelIds([logChannelId, cfg.generalLogChannelId]);
  await Promise.all(ids.map((id) => sendLogToChannel(guild, id, "guard", msg)));
}

// ── Genel audit logu ─────────────────────────────────────────────────────────

function auditActionLabel(action: AuditLogEvent): string {
  const labels: Partial<Record<AuditLogEvent, string>> = {
    [AuditLogEvent.MemberBanAdd]: "Üye yasaklandı",
    [AuditLogEvent.MemberBanRemove]: "Üye yasağı kaldırıldı",
    [AuditLogEvent.MemberKick]: "Üye sunucudan atıldı",
    [AuditLogEvent.MemberUpdate]: "Üye güncellendi",
    [AuditLogEvent.MemberRoleUpdate]: "Üye rolü güncellendi",
    [AuditLogEvent.RoleCreate]: "Rol oluşturuldu",
    [AuditLogEvent.RoleDelete]: "Rol silindi",
    [AuditLogEvent.RoleUpdate]: "Rol güncellendi",
    [AuditLogEvent.ChannelCreate]: "Kanal oluşturuldu",
    [AuditLogEvent.ChannelDelete]: "Kanal silindi",
    [AuditLogEvent.ChannelUpdate]: "Kanal güncellendi",
    [AuditLogEvent.MessageDelete]: "Mesaj silindi",
    [AuditLogEvent.MessageBulkDelete]: "Mesajlar toplu silindi",
    [AuditLogEvent.MessagePin]: "Mesaj sabitlendi",
    [AuditLogEvent.MessageUnpin]: "Mesaj sabitlemesi kaldırıldı",
    [AuditLogEvent.WebhookCreate]: "Webhook oluşturuldu",
    [AuditLogEvent.WebhookDelete]: "Webhook silindi",
    [AuditLogEvent.WebhookUpdate]: "Webhook güncellendi",
    [AuditLogEvent.GuildUpdate]: "Sunucu ayarları güncellendi",
    [AuditLogEvent.MemberPrune]: "Üyeler temizlendi",
    [AuditLogEvent.MemberMove]: "Üye taşındı",
    [AuditLogEvent.MemberDisconnect]: "Üyenin ses bağlantısı kesildi",
    [AuditLogEvent.BotAdd]: "Bot eklendi",
  };
  return labels[action] ?? `Discord işlemi (#${action})`;
}

function hasTimeoutChange(entry: GuildAuditLogsEntry): boolean {
  return (entry.changes ?? []).some((change) =>
    String(change.key).includes("communication_disabled_until"),
  );
}

export async function handleAuditLogEntry(guild: Guild, entry: GuildAuditLogsEntry): Promise<void> {
  const executor = entry.executor?.id ? `<@${entry.executor.id}>` : "Bilinmeyen kullanıcı";
  const target = entry.targetId ? `<@${entry.targetId}>` : "Bilinmeyen hedef";
  const reason = entry.reason ? `\n**Sebep:** ${entry.reason}` : "";
  const details = `**İşlemi yapan:** ${executor}\n**Hedef:** ${target}${reason}`;

  if (entry.action === AuditLogEvent.MemberBanAdd || entry.action === AuditLogEvent.MemberBanRemove) {
    await sendGuardLog(guild, "ban", `${auditActionLabel(entry.action)}\n${details}`);
  } else if (entry.action === AuditLogEvent.MemberUpdate && hasTimeoutChange(entry)) {
    await sendGuardLog(guild, "mute", `Üyenin susturma durumu değiştirildi\n${details}`);
  } else {
    await sendGuardLog(guild, "general", `**${auditActionLabel(entry.action)}**\n${details}`);
  }
}

// ── Mesaj logları ────────────────────────────────────────────────────────────

type MessageLogEvent = "message" | "edited" | "deleted";

export async function handleMessageLog(
  guild: Guild,
  message: Message | PartialMessage,
  event: MessageLogEvent,
): Promise<void> {
  if (message.author?.bot) return;
  const content = message.content?.trim() || "(mesaj içeriği önbellekte yok)";
  const attachments = message.attachments?.size
    ? `\n**Ekler:** ${message.attachments.size} dosya`
    : "";
  const eventLabel = event === "message" ? "Yeni mesaj" : event === "edited" ? "Mesaj düzenlendi" : "Mesaj silindi";
  const category: GuardLogCategory = event === "deleted" ? "deletedMessage" : "message";
  await sendGuardLog(
    guild,
    category,
    `**${eventLabel}**\n**Kullanıcı:** ${message.author ? `<@${message.author.id}>` : "Bilinmeyen kullanıcı"}\n` +
      `**Kanal:** <#${message.channelId}>\n**İçerik:** ${content}${attachments}`,
  );
}

export async function handleBulkMessageLog(guild: Guild, channelId: string, count: number): Promise<void> {
  await sendGuardLog(guild, "deletedMessage", `**Toplu mesaj silindi**\n**Kanal:** <#${channelId}>\n**Mesaj sayısı:** ${count}`);
}

export async function handleMemberLog(
  guild: Guild,
  member: GuildMember | PartialGuildMember,
  event: "join" | "leave",
): Promise<void> {
  await sendGuardLog(
    guild,
    "member",
    `${event === "join" ? "📥 Sunucuya giriş" : "📤 Sunucudan çıkış"}\n` +
      `**Kullanıcı:** <@${member.user.id}> (\`${member.user.id}\`)\n` +
      `**Hesap oluşturulma:** <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
  );
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
      await sendMessageChannel(message, `⚠️ ${message.author} spam yapıyorsun!`).then((m) => {
        if (m) setTimeout(() => m.delete().catch(() => null), 5000);
      });
    } else if (action === "mute") {
      await member.timeout(5 * 60_000, "Guard: Spam koruma").catch(() => null);
      await sendMessageChannel(message, `🔇 ${message.author} spam yaptığı için 5 dakika susturuldu.`).then((m) => {
        if (m) setTimeout(() => m.delete().catch(() => null), 5000);
      });
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
      await sendMessageChannel(message, `⚠️ ${message.author} link paylaşımı yasaktır!`).then((m) => {
        if (m) setTimeout(() => m.delete().catch(() => null), 5000);
      });
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
      await sendMessageChannel(message, `⚠️ ${message.author} çok fazla emoji kullandın! (Max: ${cfg.emojiMax})`).then((m) => {
        if (m) setTimeout(() => m.delete().catch(() => null), 5000);
      });
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
