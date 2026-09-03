import {
  Client, Events, GatewayIntentBits,
  AttachmentBuilder, TextChannel, ChannelType,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ChannelSelectMenuBuilder,
  PermissionFlagsBits, PermissionsBitField, EmbedBuilder,
  Partials,
  type ColorResolvable,
  type Message,
} from "discord.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { logger } from "../lib/logger";
import { handleXp, getUserLevel, getRank, xpToNextLevel, getLeaderboard, getLevelRoles, setLevelRole, removeLevelRole } from "./leveling";
import { getPrefix, setPrefix as setPrefixUtil, getLevelEnabled, setLevelEnabled } from "./guildSettings";
import { generateProfileCard } from "./profileCard";
import { generateLeaderboardCard, type LeaderboardEntry } from "./leaderboardCard";
import { generateLevelUpCard } from "./levelUpCard";
import { generateEconLevelUpCard } from "./econLevelCard";
import { generateSicilCard } from "./sicilCard";
import { generateHelpCard, generateCategoryHelpCard, HELP_CATEGORIES } from "./helpCard";
import { generateEconProfileCard } from "./econProfileCard";
import { generateEconLeaderboardCard, type EconLeaderboardEntry } from "./econLeaderboardCard";
import { generateGuardCard, type GuardModuleInfo } from "./guardCard";
import { startMineGame, handleMineClick, mineGames } from "./mineGame";
import { handleCodeChannel } from "./VBRIaimotor/index";
import { handleAiMessage, clearChannelHistory, getHistorySize } from "./aiChat";
import { resolveCommand } from "./fuzzyCmd";
import {
  setBotOwner, isOwner, isInMaintenance,
  addMaintenance, removeMaintenance, clearAllMaintenance,
  getMaintenanceList, getBotOwner,
} from "./maintenance";
import { isBotOwner } from "./maintenance";
import {
  ensureBotAdminSchema, refreshBotAdminCache, getBotAdminState,
  setBotAdminEnabled, addBotAdmin, removeBotAdmin,
} from "./botAdmin";
import {
  ensureAutoLogChannels, disableAutoLogs,
  getLogStatus, buildUserActivityEmbeds,
} from "./logManager";
import { generateMaintenanceCard } from "./maintenanceCard";
import { logAction, getUserLogs, deactivateLog, getLogById } from "./moderation";
import {
  getBalance, addCoins, takeCoins, claimDaily, getLuck, activatePray, luckRoll,
  addEconXp, getEconRank, getEconLeaderboard,
  econLevelFromXp, xpAtLevel, xpForNextLevel, econLevelReward, econRankTitle,
  type EconXpResult,
} from "./economy";
import { addToQueue, pauseResume, skipTrack, stopAndLeave, getQueue, getNowPlaying, warmupMusic } from "./music";
import { generateMusicCard } from "./musicCard";
import { resumeActiveGiveaways, createGiveaway, getChannelGiveaway, addParticipant, endGiveaway, cancelGiveaway, getActiveGiveaways, setMessageId, startGiveawayTimers } from "./giveaway";
import { generateGiveawayCard } from "./giveawayCard";
import {
  getGuard, setGuard, ensureGuardSchema, handleSpam, handleLink, handleEmoji,
  handleBotJoin, handleRoleUpdate, handleChannelChange, handleAuditLogEntry,
  handleMessageLog, handleBulkMessageLog, handleMemberLog,
} from "./guard";
import {
  ensureServerProtectionSchema, getProtection, createProtectionSetup,
  toggleProtectionSetup, saveProtectionSetup, setProtectionEnabled,
  lockServer, clearProtection, disableProtection, checkProtectionTrigger,
  protectionSetupEmbed, type ProtectionSetupDraft,
} from "./serverProtection";
import { setupStatChannels, updateStatChannels, removeStatChannels, getStatChannels } from "./stat";
import { canUseMod, getModSettings, setModEnabled, setModLogChannel, addRoleForCmd, removeRoleForCmd, isModEnabled, getModTierInfo, setModRoles, setSeniorModRoles, setApprovalChannel, canApproveMod, type ModCommand } from "./moderationSettings";
import { handleApprovalButton, sendApprovalRequest, type PendingRequest } from "./approvalSystem";
import { sendMediaRequest, handleVideoApprovalButton, setVideoModerationChannel, getVideoModerationChannel, getVideoSettings, addApprovalRole, removeApprovalRole, setInviteUrl, getInviteUrl, setShowSharerName } from "./videoRequestSystem";
import { sendMessageChannel, sendMessageTyping } from "./types";

import { generateWarnCard } from "./warnCard";
import { applyAutoRoles, getAutoRoles, getAllAutoRoles, addAutoRole, removeAutoRole, toggleAutoRole, clearAutoRoles } from "./autoRole";
import { AuditLogEvent, type GuildMember } from "discord.js";
import {
  getAnonymousChat, setAnonymousChat, resetAnonymousChannel, disableAnonymousChat, anonymousStatus,
  handleAnonymousMessage, handleAnonymousButton, sendAnonymousProfileDm,
  ensureAnonymousSchema, setupAnonymousApprovalPanel,
  leaveAnonymousAccount,
  getOwnAnonymousProfile, getAnonymousProfileEmbed,
  changeAnonymousAvatar,
  sendAnonymousMessage, updateAnonymousProfile, blockAnonymousAccount,
  unblockAnonymousAccount, getBlockedAnonymousAccounts,
  startAnonymousConversation, stopAnonymousConversation,
  closeAnonymousChannelConversation,
  relayAnonymousConversationMessage,
  relayAnonymousChannelMessage, requestAnonymousConversation, resolveAnonymousConversation,
  requestAnonymousIdChange, resolveAnonymousIdChange, getAnonymousPointLeaderboard,
  grantAnonymousPoints,
} from "./anonymousChat";
import {
  getTagRoleSettings,
  setTagRoleSettings,
  removeTagRoleSettings,
  syncMemberTagRole,
  syncGuildTagRoles,
  removeManagedRoleFromGuild,
} from "./tagRole";
import { getRemoteModChannel, setRemoteModChannel, removeRemoteModChannel } from "./remoteMod";
import { addRemoteModAuth, removeRemoteModAuth, isRemoteModAuthorized, listRemoteModAuth } from "./remoteModAuth";

// ── Vivincy coin emoji (startup'ta register edilir) ───────────────────────────
let COIN = "🪙"; // fallback, uygulama emojisi yüklenince güncellenir

// ── Tip tanımları ─────────────────────────────────────────────────────────────

type PfxHandler = (m: Message, args: string[]) => Promise<void>;

// ── Ses XP takibi ─────────────────────────────────────────────────────────────

const voiceSessions = new Map<string, number>();
const VOICE_XP_PER_MIN = 10;

type AnonymousSetupSession = {
  guildId: string;
  userId: string;
  generalChannelId?: string;
  approvalChannelId?: string;
  categoryId?: string;
};
const anonymousSetupSessions = new Map<string, AnonymousSetupSession>();
const protectionSetupSessions = new Map<string, ProtectionSetupDraft>();

// ── Sunucu Kur yapısı ─────────────────────────────────────────────────────────

const SUNUCU_YAPISI = [
  { name: "📂 ① BİLGİLENDİRME", channels: [
    { name: "📜・bilgiler", voice: false }, { name: "📖・kurallar", voice: false },
    { name: "📢・duyurular", voice: false }, { name: "📅・etkinlikler", voice: false },
    { name: "🎁・çekilişler", voice: false }, { name: "💎・boost-ödülleri", voice: false },
  ]},
  { name: "🌍 ② GENEL", channels: [
    { name: "💬・topluluk", voice: false }, { name: "💬・genel-sohbet", voice: false },
    { name: "🤖・bot-komut", voice: false }, { name: "😂・meme", voice: false },
    { name: "📸・medya", voice: false }, { name: "🎤・ses-kanalı", voice: true },
  ]},
  { name: "🦉 ③ OWO", channels: [
    { name: "🐾・owo-dünya", voice: false }, { name: "🦉・owo-chat", voice: false },
    { name: "⚔️・battle", voice: false }, { name: "🎰・gambling", voice: false },
    { name: "💰・trade-market", voice: false }, { name: "🐉・pet-showcase", voice: false },
    { name: "📦・loot-flex", voice: false }, { name: "📊・leaderboard", voice: false },
  ]},
  { name: "👑 ④ VIP", channels: [
    { name: "✨・vip-lounge", voice: false }, { name: "💬・vip-chat", voice: false },
    { name: "🦉・vip-owo", voice: false }, { name: "🎤・vip-ses", voice: true },
  ]},
  { name: "💠 ⑤ PREMIUM", channels: [
    { name: "💎・premium-lounge", voice: false }, { name: "💬・premium-chat", voice: false },
    { name: "🦉・premium-owo", voice: false }, { name: "🤖・premium-bot", voice: false },
    { name: "🎤・premium-ses", voice: true },
  ]},
  { name: "🌸 ⑥ DESTEK", channels: [
    { name: "🎫・ticket", voice: false }, { name: "❓・yardım", voice: false },
    { name: "📩・öneriler", voice: false },
  ]},
];

// ── Yardımcı fonksiyonlar ─────────────────────────────────────────────────────

function parseDuration(str: string): number | null {
  const m = str.match(/^(\d+)(sn|sa|s|m|h|g|d)$/i);
  if (!m) return null;
  const val = parseInt(m[1]!);
  const unit = m[2]!.toLowerCase();
  const map: Record<string, number> = {
    sn: 1000, s: 1000,
    m: 60_000,
    sa: 3_600_000, h: 3_600_000,
    g: 86_400_000, d: 86_400_000,
  };
  return val * (map[unit] ?? 0);
}

// Blackjack kart yardımcıları
type Card = string;
function createDeck(): Card[] {
  const suits = ["♠", "♥", "♦", "♣"];
  const vals = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const deck: Card[] = [];
  for (const s of suits) for (const v of vals) deck.push(`${v}${s}`);
  return deck.sort(() => Math.random() - 0.5);
}
function drawCard(deck: Card[]): Card {
  return deck.splice(Math.floor(Math.random() * deck.length), 1)[0]!;
}
function cardVal(c: Card): number {
  const v = c.slice(0, -1);
  if (v === "A") return 11;
  if (["J", "Q", "K"].includes(v)) return 10;
  return parseInt(v);
}
function handValue(hand: Card[]): number {
  let total = hand.reduce((s, c) => s + cardVal(c), 0);
  let aces = hand.filter((c) => c.startsWith("A")).length;
  while (total > 21 && aces-- > 0) total -= 10;
  return total;
}

// ── Prefix handler fonksiyonları ──────────────────────────────────────────────

// LEVEL / PROFIL
async function pfxLevel(m: Message): Promise<void> {
  if (!m.guildId) return;
  try {
    const target = m.mentions.users.first() ?? m.author;
    const ud = await getUserLevel(target.id, m.guildId);
    const rank = await getRank(target.id, m.guildId);
    const { current, needed } = xpToNextLevel(ud.xp, ud.level);
    const bal = await getBalance(target.id).catch(() => ({ coins: 0 }));
    const buf = await generateProfileCard({
      username: target.displayName,
      avatarUrl: target.displayAvatarURL({ extension: "png", size: 256 }),
      level: ud.level, xp: current, xpNeeded: needed, rank,
      messageCount: ud.messageCount, coins: bal.coins,
    });
    await m.reply({ files: [new AttachmentBuilder(buf, { name: "level.png" })] });
  } catch (err: any) {
    logger.error({ err }, "pfxLevel hata");
    await m.reply(`❌ Profil kartı oluşturulamadı: ${err?.message ?? "Bilinmeyen hata"}`).catch(() => null);
  }
}

// LEADERBOARD
async function pfxLeaderboard(m: Message): Promise<void> {
  if (!m.guildId) return;
  try {
    const top = await getLeaderboard(m.guildId, 10);
    if (!top.length) { await m.reply("Henüz kimse mesaj atmamış! 🦗"); return; }
    const entries: LeaderboardEntry[] = await Promise.all(top.map(async (e, i) => {
      let username = "Kullanıcı"; let avatarUrl = "";
      try { const u = await m.client.users.fetch(e.userId); username = u.displayName; avatarUrl = u.displayAvatarURL({ extension: "png", size: 64 }); } catch { /**/ }
      const { current, needed } = xpToNextLevel(e.xp, e.level);
      return { rank: i + 1, userId: e.userId, username, avatarUrl, level: e.level, xp: e.xp, xpCurrent: current, xpNeeded: needed };
    }));
    const buf = await generateLeaderboardCard(entries);
    await m.reply({ files: [new AttachmentBuilder(buf, { name: "lb.png" })] });
  } catch (err: any) {
    logger.error({ err }, "pfxLeaderboard hata");
    await m.reply(`❌ Liderboard oluşturulamadı: ${err?.message ?? "Bilinmeyen hata"}`).catch(() => null);
  }
}

// LEVELROL
async function pfxLevelRol(m: Message, args: string[]): Promise<void> {
  if (!m.guildId || !m.member) return;
  if (!isOwner(m.author.id) && !m.member.permissions.has("ManageRoles")) {
    await m.reply("❌ **Manage Roles** iznin yok."); return;
  }
  const sub = args[0]?.toLowerCase();
  if (sub === "ekle") {
    const lvl = parseInt(args[1] ?? "0");
    const role = m.mentions.roles.first();
    if (isNaN(lvl) || lvl < 1 || !role) { await m.reply("❌ Kullanım: `levelrol ekle <seviye> @rol`"); return; }
    await setLevelRole(m.guildId, lvl, role.id);
    await m.reply(`✅ **${lvl}. seviye** için ${role} rolü eklendi!`);
  } else if (sub === "kaldir") {
    const lvl = parseInt(args[1] ?? "0");
    if (isNaN(lvl) || lvl < 1) { await m.reply("❌ Kullanım: `levelrol kaldir <seviye>`"); return; }
    const removed = await removeLevelRole(m.guildId, lvl);
    await m.reply(removed ? `✅ **${lvl}. seviye** rol ödülü kaldırıldı.` : `❌ **${lvl}. seviye** için kayıtlı rol bulunamadı.`);
  } else if (sub === "liste") {
    const roles = await getLevelRoles(m.guildId);
    if (!roles.length) { await m.reply("Henüz seviye rol ödülü eklenmemiş."); return; }
    await m.reply(`🏆 **Seviye Rol Ödülleri:**\n${roles.map((r) => `**Seviye ${r.level}** → <@&${r.roleId}>`).join("\n")}`);
  } else {
    await m.reply("❌ Kullanım: `levelrol ekle|kaldir|liste`");
  }
}

// SİCİL
async function pfxSicil(m: Message): Promise<void> {
  if (!m.guildId || !m.member) return;
  if (!isOwner(m.author.id) && !m.member.permissions.has("ModerateMembers")) { await m.reply("❌ **Moderate Members** iznin yok."); return; }
  const target = m.mentions.users.first();
  if (!target) { await m.reply("❌ Kullanım: `sicil @kullanici`"); return; }
  try {
    const logs = await getUserLogs(target.id, m.guildId);
    const counts = {
      warn: logs.filter((l) => l.action === "warn").length,
      kick: logs.filter((l) => l.action === "kick").length,
      ban: logs.filter((l) => l.action === "ban").length,
      timeout: logs.filter((l) => l.action === "timeout").length,
    };
    const recent = logs.slice(0, 8);
    const embed = new EmbedBuilder()
      .setColor("#5865f2")
      .setAuthor({ name: `${target.displayName} — Moderasyon Sicil Kaydı`, iconURL: target.displayAvatarURL({ extension: "png", size: 128 }) })
      .setThumbnail(target.displayAvatarURL({ extension: "png", size: 256 }))
      .setDescription(
        `**Toplam kayıt:** ${logs.length}\n` +
        `⚠️ Uyarı: **${counts.warn}**  •  👢 Kick: **${counts.kick}**  •  🔨 Ban: **${counts.ban}**  •  🔇 Timeout: **${counts.timeout}**`
      )
      .addFields({
        name: "Son işlemler",
        value: recent.length
          ? recent.map((l) =>
            `${l.action === "warn" ? "⚠️" : l.action === "kick" ? "👢" : l.action === "ban" ? "🔨" : l.action === "timeout" ? "🔇" : "•"} ` +
            `**#${l.id} ${l.action.toUpperCase()}** — ${l.reason ?? "Sebep belirtilmedi"} · <t:${Math.floor(l.createdAt.getTime() / 1000)}:R>`
          ).join("\n")
          : "Bu kullanıcıya ait moderasyon kaydı bulunamadı.",
      })
      .setFooter({ text: `${m.guild?.name ?? "Sunucu"} • Yalnızca yetkililer görebilir` })
      .setTimestamp();
    await m.reply({ embeds: [embed] });
  } catch (err: any) {
    logger.error({ err }, "pfxSicil hata");
    await m.reply(`❌ Sicil kartı oluşturulamadı: ${err?.message ?? "Bilinmeyen hata"}`).catch(() => null);
  }
}

// ── Mod log helper ─────────────────────────────────────────────────────────────
async function sendModLog(m: Message, guildId: string, text: string): Promise<void> {
  try {
    const guard = await getGuard(guildId);
    if (!guard.logsEnabled) return;
    const s = await getModSettings(guildId);
    if (!s?.logChannelId) return;
    const ch = await m.guild?.channels.fetch(s.logChannelId).catch(() => null);
    if (ch?.isTextBased()) {
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("🛡️ Moderasyon İşlemi")
        .setDescription(text.slice(0, 4000))
        .setFooter({ text: m.guild?.name ?? "Moderasyon" })
        .setTimestamp();
      await (ch as TextChannel).send({ embeds: [embed] });
    }
  } catch { /**/ }
}

// MODERASYon
async function pfxBan(m: Message, args: string[]): Promise<void> {
  if (!m.guild || !m.member || !m.guildId) return;
  const target = m.mentions.users.first();
  if (!target) { await m.reply("❌ Kullanım: `ban @kullanici [sebep]`"); return; }
  if (target.id === m.author.id) { await m.reply("❌ Kendini yasaklayamazsın!"); return; }
  const sebep = args.slice(1).join(" ") || "Sebep belirtilmedi";

  const tierInfo = await getModTierInfo(m.guildId);
  const isSeniorOrOwner = isOwner(m.author.id)
    || m.guild.ownerId === m.author.id
    || tierInfo.seniorModRoles.some((r) => m.member!.roles.cache.has(r));

  if (!isSeniorOrOwner) {
    const directPerm = await canUseMod(m.member, m.guildId, "ban");
    if (!directPerm.ok) {
      // Yetkili rolü var mı? → onay kanalına gönder
      const isYetkili = tierInfo.modRoles.some((r) => m.member!.roles.cache.has(r));
      if (!isYetkili) { await m.reply(directPerm.reason ?? "❌ Bu komutu kullanmak için yetkin yok."); return; }
      if (!tierInfo.approvalChannelId) {
        await m.reply("❌ Onay kanalı ayarlanmamış. Sunucu sahibi `modsetup onaykanal #kanal` ile ayarlasın."); return;
      }
      const req: PendingRequest = {
        type: "ban", guildId: m.guildId,
        targetUserId: target.id, targetTag: target.tag,
        targetAvatar: target.displayAvatarURL({ extension: "png", size: 256 }),
        requestorId: m.author.id, requestorTag: m.author.tag,
        reason: sebep, requestChannelId: m.channelId, createdAt: Date.now(),
      };
      await sendApprovalRequest(m.client, tierInfo.approvalChannelId, req);
      await m.reply(`📨 **Ban isteğin** onay kanalına gönderildi. Üst Yetkili onayını bekliyor.`);
      return;
    }
  }

  // Direkt yürüt
  try {
    await m.guild.bans.create(target.id, { reason: sebep });
    const log = await logAction({ guildId: m.guildId, userId: target.id, moderatorId: m.author.id, action: "ban", reason: sebep });
    await m.reply(`🔨 **${target.username}** yasaklandı. Sebep: ${sebep}`);
    await sendModLog(m, m.guildId, `🔨 **Ban** | <@${target.id}> (${target.tag}) | Mod: <@${m.author.id}> | Sebep: ${sebep} | #${log.id}`);
  } catch {
    await m.reply("❌ Bu kullanıcıyı yasaklayamıyorum. (Bot yetki hiyerarşisinde kullanıcının altında olabilir.)");
  }
}

async function pfxKick(m: Message, args: string[]): Promise<void> {
  if (!m.guild || !m.member || !m.guildId) return;
  const target = m.mentions.members?.first();
  if (!target) { await m.reply("❌ Kullanım: `kick @kullanici [sebep]`"); return; }
  if (target.id === m.author.id) { await m.reply("❌ Kendini atamazsın!"); return; }
  const sebep = args.slice(1).join(" ") || "Sebep belirtilmedi";

  const tierInfo = await getModTierInfo(m.guildId);
  const isSeniorOrOwner = isOwner(m.author.id)
    || m.guild.ownerId === m.author.id
    || tierInfo.seniorModRoles.some((r) => m.member!.roles.cache.has(r));

  if (!isSeniorOrOwner) {
    const directPerm = await canUseMod(m.member, m.guildId, "kick");
    if (!directPerm.ok) {
      const isYetkili = tierInfo.modRoles.some((r) => m.member!.roles.cache.has(r));
      if (!isYetkili) { await m.reply(directPerm.reason ?? "❌ Bu komutu kullanmak için yetkin yok."); return; }
      if (!tierInfo.approvalChannelId) {
        await m.reply("❌ Onay kanalı ayarlanmamış. Sunucu sahibi `modsetup onaykanal #kanal` ile ayarlasın."); return;
      }
      const req: PendingRequest = {
        type: "kick", guildId: m.guildId,
        targetUserId: target.id, targetTag: target.user.tag,
        targetAvatar: target.displayAvatarURL({ extension: "png", size: 256 }),
        requestorId: m.author.id, requestorTag: m.author.tag,
        reason: sebep, requestChannelId: m.channelId, createdAt: Date.now(),
      };
      await sendApprovalRequest(m.client, tierInfo.approvalChannelId, req);
      await m.reply(`📨 **Kick isteğin** onay kanalına gönderildi. Üst Yetkili onayını bekliyor.`);
      return;
    }
  }

  if (!target.kickable && !isOwner(m.author.id)) { await m.reply("❌ Bu kullanıcıyı atamıyorum. (Yetki hiyerarşisi)"); return; }
  try {
    await target.kick(sebep);
    const log = await logAction({ guildId: m.guildId, userId: target.id, moderatorId: m.author.id, action: "kick", reason: sebep });
    await m.reply(`👢 **${target.user.username}** atıldı. Sebep: ${sebep}`);
    await sendModLog(m, m.guildId, `👢 **Kick** | <@${target.id}> (${target.user.tag}) | Mod: <@${m.author.id}> | Sebep: ${sebep} | #${log.id}`);
  } catch {
    await m.reply("❌ Bu kullanıcıyı atamıyorum. (Bot yetki hiyerarşisinde kullanıcının altında olabilir.)");
  }
}

async function pfxWarn(m: Message, args: string[]): Promise<void> {
  if (!m.guildId || !m.member) return;
  const perm = await canUseMod(m.member, m.guildId, "warn");
  if (!perm.ok) { await m.reply(perm.reason!); return; }
  const target = m.mentions.users.first();
  if (!target) { await m.reply("❌ Kullanım: `warn @kullanici [sebep]`"); return; }
  const sebep = args.slice(1).join(" ") || "Sebep belirtilmedi";
  const log = await logAction({ guildId: m.guildId, userId: target.id, moderatorId: m.author.id, action: "warn", reason: sebep });
  const allWarns = (await getUserLogs(target.id, m.guildId)).filter((l) => l.action === "warn" && l.active);

  const warnColor = allWarns.length >= 5 ? "#ed4245" : allWarns.length >= 3 ? "#faa61a" : "#57f287";
  const warnEmbed = new EmbedBuilder()
    .setColor(warnColor)
    .setAuthor({ name: "Uyarı Verildi", iconURL: target.displayAvatarURL({ extension: "png", size: 128 }) })
    .setTitle(`${target.displayName} uyarıldı`)
    .setThumbnail(target.displayAvatarURL({ extension: "png", size: 256 }))
    .addFields(
      { name: "Uyarı ID", value: `#${log.id}`, inline: true },
      { name: "Toplam aktif uyarı", value: String(allWarns.length), inline: true },
      { name: "Moderatör", value: `${m.author}`, inline: true },
      { name: "Sebep", value: sebep.slice(0, 1024), inline: false },
    )
    .setFooter({ text: m.guild?.name ?? "Moderasyon" })
    .setTimestamp();
  await m.reply({ embeds: [warnEmbed] });
  await sendModLog(m, m.guildId, `⚠️ **Uyarı** | <@${target.id}> (${target.tag}) | Mod: <@${m.author.id}> | Sebep: ${sebep} | #${log.id}`);

  // ── DM ────────────────────────────────────────────────────────────────────
  try {
    await target.send({ content: `⚠️ ${m.guild?.name ?? "Bir sunucu"} sunucusunda uyarı aldın.`, embeds: [warnEmbed] });
  } catch { /**/ }
}

async function pfxTimeout(m: Message, args: string[]): Promise<void> {
  if (!m.guild || !m.member || !m.guildId) return;
  const perm = await canUseMod(m.member, m.guildId, "timeout");
  if (!perm.ok) { await m.reply(perm.reason!); return; }
  const target = m.mentions.members?.first();
  if (!target) { await m.reply("❌ Kullanım: `timeout @kişi <süre> [sebep]`\nSüre örn: `10m`, `1sa`, `1g`"); return; }
  const durationStr = args[1];
  if (!durationStr) { await m.reply("❌ Süre belirt. Örn: `timeout @user 10m`"); return; }
  const ms = parseDuration(durationStr);
  if (!ms || ms < 1000 || ms > 28 * 24 * 60 * 60 * 1000) { await m.reply("❌ Geçersiz süre. Min: 1sn, Maks: 28g. Örn: `10m`, `1sa`, `2g`"); return; }
  const sebep = args.slice(2).join(" ") || "Sebep belirtilmedi";
  await target.timeout(ms, sebep);
  const log = await logAction({ guildId: m.guildId, userId: target.id, moderatorId: m.author.id, action: "timeout", reason: sebep });
  await m.reply(`⏰ **${target.user.tag}** ${durationStr} susturuldu. Sebep: ${sebep}`);
  await sendModLog(m, m.guildId, `⏰ **Timeout** | <@${target.id}> (${target.user.tag}) | Süre: ${durationStr} | Mod: <@${m.author.id}> | Sebep: ${sebep} | #${log.id}`);
}

async function pfxUntimeout(m: Message, args: string[]): Promise<void> {
  if (!m.guild || !m.member || !m.guildId) return;
  const perm = await canUseMod(m.member, m.guildId, "timeout");
  if (!perm.ok) { await m.reply(perm.reason!); return; }
  const target = m.mentions.members?.first();
  if (!target) { await m.reply("❌ Kullanım: `untimeout @kullanici [sebep]`"); return; }
  const sebep = args.slice(1).join(" ") || "Susturma kaldırıldı";
  await target.timeout(null, sebep);
  await m.reply(`✅ **${target.user.tag}** susturması kaldırıldı.`);
  await sendModLog(m, m.guildId, `🔊 **Untimeout** | <@${target.id}> (${target.user.tag}) | Mod: <@${m.author.id}>`);
}

async function pfxUnban(m: Message, args: string[]): Promise<void> {
  if (!m.guild || !m.member || !m.guildId) return;
  const perm = await canUseMod(m.member, m.guildId, "ban");
  if (!perm.ok) { await m.reply(perm.reason!); return; }
  const userId = args[0];
  if (!userId) { await m.reply("❌ Kullanım: `unban <kullanıcı-id> [sebep]`"); return; }
  const sebep = args.slice(1).join(" ") || "Sebep belirtilmedi";
  try {
    const bannedUser = await m.guild.bans.fetch(userId);
    await m.guild.bans.remove(userId, `${m.author.tag}: ${sebep}`);
    const log = await logAction({ guildId: m.guildId, userId, moderatorId: m.author.id, action: "unban", reason: sebep });
    await m.reply(`✅ **${bannedUser.user.tag}** yasağı kaldırıldı. Sebep: ${sebep}`);
    await sendModLog(m, m.guildId, `✅ **Unban** | <@${userId}> (${bannedUser.user.tag}) | Mod: <@${m.author.id}> | Sebep: ${sebep} | #${log.id}`);
  } catch {
    await m.reply("❌ Bu ID ile yasaklı bir kullanıcı bulunamadı.");
  }
}

async function pfxIdBan(m: Message, args: string[]): Promise<void> {
  if (!m.guild || !m.guildId || !m.member) return;
  const perm = await canUseMod(m.member, m.guildId, "ban");
  if (!perm.ok) { await m.reply(perm.reason ?? "❌ Bu komutu kullanmak için yetkin yok."); return; }

  const userId = (args[0] ?? "").replace(/[<@!>]/g, "");
  if (!/^\d{15,22}$/.test(userId)) {
    await m.reply("❌ Kullanım: `idban <kullanıcı-id> [sebep]`");
    return;
  }
  if (userId === m.author.id) { await m.reply("❌ Kendini yasaklayamazsın."); return; }
  const reason = args.slice(1).join(" ") || "ID ban";

  try {
    const user = await m.client.users.fetch(userId);
    await m.guild.bans.create(userId, { reason: `${m.author.tag}: ${reason}` });
    const log = await logAction({
      guildId: m.guildId, userId, moderatorId: m.author.id, action: "ban", reason,
    });
    await m.reply(`🔨 **${user.tag}** (` + `\`${userId}\`` + `) yasaklandı. Sebep: ${reason}`);
    await sendModLog(m, m.guildId, `🔨 **ID Ban** | <@${userId}> (${user.tag}) | Mod: <@${m.author.id}> | Sebep: ${reason} | #${log.id}`);
  } catch (err) {
    logger.warn({ err, userId }, "ID ban başarısız");
    await m.reply("❌ Bu ID ile kullanıcı yasaklanamadı. Botun **Ban Members** yetkisini ve rol hiyerarşisini kontrol et.");
  }
}

async function pfxGiveRole(m: Message, args: string[]): Promise<void> {
  if (!m.guild || !m.guildId || !m.member) return;
  if (!isOwner(m.author.id) && !m.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
    await m.reply("❌ Rol vermek için **Rolleri Yönet** yetkisine ihtiyacın var.");
    return;
  }

  const target = m.mentions.members?.first();
  const role = m.mentions.roles?.first();
  if (!target || !role) {
    await m.reply("❌ Kullanım: `rolver @kullanıcı @rol`");
    return;
  }
  const botMember = m.guild.members.me;
  if (!botMember) {
    await m.reply("❌ Bot üye bilgisi alınamadı.");
    return;
  }
  if (target.id === m.guild.ownerId || role.managed || role.position >= botMember.roles.highest.position) {
    await m.reply("❌ Bu rol botun en yüksek rolünün altında olmalı ve entegre rol olmamalı.");
    return;
  }
  if (!isOwner(m.author.id) && role.position >= m.member.roles.highest.position) {
    await m.reply("❌ Kendi en yüksek rolünün üstündeki veya aynı seviyedeki rolü veremezsin.");
    return;
  }
  try {
    await target.roles.add(role, `${m.author.tag} tarafından verildi`);
    await m.reply(`✅ ${target} kullanıcısına ${role} rolü verildi.`);
  } catch {
    await m.reply("❌ Rol verilemedi. Botun **Manage Roles** yetkisini ve rol hiyerarşisini kontrol et.");
  }
}

async function pfxUyariKaldir(m: Message, args: string[]): Promise<void> {
  if (!m.guildId || !m.member) return;
  const perm = await canUseMod(m.member, m.guildId, "warn");
  if (!perm.ok) { await m.reply(perm.reason!); return; }
  const id = parseInt(args[0] ?? "0");
  if (isNaN(id) || id < 1) { await m.reply("❌ Kullanım: `uyarikaldir <uyarı-id>`"); return; }
  const existing = await getLogById(id, m.guildId);
  if (!existing || existing.action !== "warn") { await m.reply(`❌ #${id} numaralı uyarı kaydı bulunamadı.`); return; }
  if (!existing.active) { await m.reply(`❌ #${id} numaralı uyarı zaten kaldırılmış.`); return; }
  await deactivateLog(id, m.guildId);
  await m.reply(`✅ **#${id}** numaralı uyarı <@${existing.userId}> için kaldırıldı.`);
}

async function pfxTemizle(m: Message, args: string[]): Promise<void> {
  if (!m.guild || !m.member || !m.guildId || !(m.channel instanceof TextChannel)) return;
  const perm = await canUseMod(m.member, m.guildId, "temizle");
  if (!perm.ok) { await m.reply(perm.reason!); return; }
  const n = Math.min(parseInt(args[0] ?? "10") || 10, 100);
  const msgs = await m.channel.messages.fetch({ limit: n + 1 });
  const deleted = await m.channel.bulkDelete(msgs, true);
  const reply = await sendMessageChannel(m, `🗑️ **${Math.max(deleted.size - 1, 0)}** mesaj silindi.`);
  if (reply) setTimeout(() => reply.delete().catch(() => null), 4000);
}

async function pfxTagRol(m: Message, args: string[]): Promise<void> {
  if (!m.guild || !m.guildId || !m.member) return;

  const canConfigure =
    m.guild.ownerId === m.author.id ||
    m.member.permissions.has(PermissionFlagsBits.ManageGuild);
  if (!canConfigure) {
    await m.reply("❌ Bu ayarı sadece sunucu sahibi veya Sunucuyu Yönet yetkisi olanlar değiştirebilir.");
    return;
  }

  const sub = args[0]?.toLowerCase();
  const current = await getTagRoleSettings(m.guildId);

  if (!sub || sub === "durum" || sub === "status") {
    if (!current) {
      await m.reply(
        "ℹ️ Etiket rolü ayarlanmamış.\n" +
        "Kullanım: `v!tagrol ayarla ETIKET @rol`",
      );
      return;
    }
    await m.reply(
      `✅ Etiket rolü aktif.\n` +
      `Etiket: **${current.tag}**\n` +
      `Rol: <@&${current.roleId}>`,
    );
    return;
  }

  if (sub === "kaldır" || sub === "kaldir" || sub === "sil" || sub === "off") {
    if (!current) {
      await m.reply("ℹ️ Etiket rolü ayarı zaten bulunmuyor.");
      return;
    }
    await removeTagRoleSettings(m.guildId);
    const removed = await removeManagedRoleFromGuild(m.guild, current.roleId);
    await m.reply(`✅ Etiket rolü ayarı kaldırıldı. ${removed} üyeden rol geri çekildi.`);
    return;
  }

  if (sub !== "ayarla" && sub !== "kur" && sub !== "set") {
    await m.reply(
      "❌ Kullanım:\n" +
      "`v!tagrol ayarla ETIKET @rol`\n" +
      "`v!tagrol durum`\n" +
      "`v!tagrol kaldır`",
    );
    return;
  }

  const tag = args[1]?.trim();
  const role = m.mentions.roles.first();
  if (!tag || !role) {
    await m.reply("❌ Kullanım: `v!tagrol ayarla ETIKET @rol`");
    return;
  }
  if (tag.length > 4) {
    await m.reply("❌ Discord sunucu etiketleri en fazla 4 karakter olabilir.");
    return;
  }
  if (role.managed) {
    await m.reply("❌ Entegrasyon tarafından yönetilen bir rol seçilemez.");
    return;
  }
  const botMember = m.guild.members.me;
  if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles) || role.position >= botMember.roles.highest.position) {
    await m.reply("❌ Botun bu rolü yönetebilmesi için **Rolleri Yönet** yetkisi ve rolden daha yüksek bir bot rolü olmalı.");
    return;
  }

  await setTagRoleSettings(m.guildId, tag, role.id);
  const result = await syncGuildTagRoles(m.guild);
  await m.reply(
    `✅ **${tag}** etiketi için <@&${role.id}> rolü ayarlandı.\n` +
    `Senkronizasyon: **${result.added}** rol verildi, **${result.removed}** rol geri çekildi.`,
  );
}

async function pfxNuke(m: Message): Promise<void> {
  if (!m.guild || !m.guildId || !(m.channel instanceof TextChannel)) return;
  // Nuke sadece sunucu sahibi veya Admin — temizle iznini de kontrol et
  const perm = await canUseMod(m.member!, m.guildId, "temizle");
  const isAdmin = m.member?.permissions.has("Administrator") ?? false;
  if (!perm.ok && !isAdmin && m.guild.ownerId !== m.author.id) { await m.reply("❌ Sadece sunucu sahibi veya yöneticiler kullanabilir."); return; }
  const ch = m.channel;
  const { name, topic, nsfw, rateLimitPerUser, position, parentId } = ch;
  const overwrites = ch.permissionOverwrites.cache.map((o) => ({ id: o.id, allow: o.allow, deny: o.deny, type: o.type }));
  await ch.delete(`Nuke — ${m.author.tag}`);
  const newCh = await m.guild.channels.create({ name, type: ChannelType.GuildText, topic: topic ?? undefined, nsfw, rateLimitPerUser, position, parent: parentId ?? undefined, permissionOverwrites: overwrites });
  await newCh.send("💥 **NUKE!** Kanal temizlendi ve yeniden oluşturuldu.");
}

async function pfxKilitle(m: Message): Promise<void> {
  if (!m.guild || !m.member || !m.guildId || !(m.channel instanceof TextChannel)) return;
  const perm = await canUseMod(m.member, m.guildId, "mute");
  if (!perm.ok) { await m.reply(perm.reason!); return; }
  await m.channel.permissionOverwrites.edit(m.guild.id, { SendMessages: false });
  await m.reply("🔒 Kanal kilitlendi.");
  await sendModLog(m, m.guildId, `🔒 **Kanal Kilidi** | <#${m.channel.id}> | Mod: <@${m.author.id}>`);
}

async function pfxAc(m: Message): Promise<void> {
  if (!m.guild || !m.member || !m.guildId || !(m.channel instanceof TextChannel)) return;
  const perm = await canUseMod(m.member, m.guildId, "mute");
  if (!perm.ok) { await m.reply(perm.reason!); return; }
  await m.channel.permissionOverwrites.edit(m.guild.id, { SendMessages: null });
  await m.reply("🔓 Kanal kilidi açıldı.");
  await sendModLog(m, m.guildId, `🔓 **Kanal Kilidi Açıldı** | <#${m.channel.id}> | Mod: <@${m.author.id}>`);
}

// ── EMOJİ EKLE ────────────────────────────────────────────────────────────────
async function pfxEmojiEkle(m: Message, args: string[]): Promise<void> {
  if (!m.guild || !m.member) return;
  if (!isOwner(m.author.id) && !m.member.permissions.has(PermissionFlagsBits.ManageGuildExpressions) && !m.member.permissions.has(PermissionFlagsBits.Administrator)) {
    await m.reply("❌ **Manage Expressions** iznin yok."); return;
  }

  const sub = args[0]?.toLowerCase() ?? "";

  // liste
  if (sub === "liste" || sub === "list") {
    const emojis = [...m.guild.emojis.cache.values()];
    if (emojis.length === 0) { await m.reply("📭 Sunucuda özel emoji yok."); return; }
    const lines = emojis.map((e) => `${e.animated ? "(GIF) " : ""}${e} \`:${e.name}:\``);
    const chunks: string[] = [];
    let cur = `📋 **Sunucu Emojileri** (${emojis.length})\n`;
    for (const l of lines) {
      if ((cur + l + "\n").length > 1900) { chunks.push(cur); cur = ""; }
      cur += l + "\n";
    }
    if (cur) chunks.push(cur);
    for (const chunk of chunks) await sendMessageChannel(m, chunk);
    return;
  }

  // sil
  if (sub === "sil" || sub === "kaldir") {
    const name = args[1]?.replace(/:/g, "");
    if (!name) { await m.reply("❌ Kullanım: `v!emojiekle sil <emoji-ismi>`"); return; }
    const emoji = m.guild.emojis.cache.find((e) => e.name === name);
    if (!emoji) { await m.reply(`❌ \`:${name}:\` emojisi bulunamadı.`); return; }
    await emoji.delete("Bot komutuyla silindi");
    await m.reply(`✅ \`:${name}:\` emojisi silindi.`);
    return;
  }

  // Ekleme: v!emojiekle <url-veya-ek> [isim]
  // URL ile
  let imageSource: string | Buffer | null = null;
  let emojiName: string | null = null;

  const attachment = m.attachments.first();
  if (attachment) {
    // Ek dosyadan
    const res = await fetch(attachment.url).catch(() => null);
    if (!res?.ok) { await m.reply("❌ Dosya indirilemedi."); return; }
    imageSource = Buffer.from(await res.arrayBuffer());
    emojiName = (args[0] ?? attachment.name.split(".")[0] ?? "emoji").replace(/[^a-zA-Z0-9_]/g, "").slice(0, 32);
  } else if (args[0]?.startsWith("http")) {
    imageSource = args[0];
    emojiName = (args[1] ?? "emoji").replace(/[^a-zA-Z0-9_]/g, "").slice(0, 32);
  } else {
    await m.reply(
      "❌ **Kullanım:**\n" +
      "`v!emojiekle <url> <isim>` — URL'den emoji ekle\n" +
      "`v!emojiekle <isim>` + dosya ek — Ek dosyadan emoji ekle\n" +
      "`v!emojiekle liste` — Sunucu emojilerini listele\n" +
      "`v!emojiekle sil <isim>` — Emojiyi sil"
    );
    return;
  }

  if (emojiName.length < 2) { await m.reply("❌ Emoji ismi en az 2 karakter olmalı."); return; }

  try {
    const emoji = await m.guild.emojis.create({ attachment: imageSource as any, name: emojiName, reason: `v!emojiekle — ${m.author.tag}` });
    await m.reply(`✅ ${emoji} \`:${emoji.name}:\` emojisi eklendi!`);
  } catch (err: any) {
    const msg: string = err?.message ?? "";
    if (msg.includes("File cannot be larger")) await m.reply("❌ Dosya çok büyük. Emoji maks **256 KB** olabilir.");
    else if (msg.includes("Maximum number")) await m.reply("❌ Sunucu emoji limiti doldu.");
    else await m.reply(`❌ Emoji eklenemedi: ${msg}`);
  }
}

// ── SES KANALI ────────────────────────────────────────────────────────────────
async function pfxSesKanal(m: Message, args: string[]): Promise<void> {
  if (!m.guild || !m.member) return;
  const isAdmin = m.member.permissions.has(PermissionFlagsBits.Administrator);
  const hasManage = m.member.permissions.has(PermissionFlagsBits.ManageChannels);
  if (!isOwner(m.author.id) && !isAdmin && !hasManage) {
    await m.reply("❌ **Kanalları Yönet** iznin yok."); return;
  }

  const sub = args[0]?.toLowerCase() ?? "";

  // yardım / boş
  if (!sub || sub === "yardim" || sub === "help") {
    await m.reply(
      "🔊 **Ses Kanalı Komutları**\n" +
      "`v!seskanal <isim>` — Ses kanalı oluştur\n" +
      "`v!seskanal <isim> <limit>` — Kullanıcı limitiyle oluştur (1-99)\n" +
      "`v!seskanal <isim> <limit> <bitrate>` — Bitrate de belirt (8-384 kbps)\n" +
      "`v!seskanal sil <#kanal>` — Ses kanalını sil\n" +
      "`v!seskanal yeniden <#kanal> <yeni-isim>` — Kanalı yeniden adlandır\n" +
      "`v!seskanal limit <#kanal> <limit>` — Kullanıcı limitini değiştir"
    );
    return;
  }

  // sil
  if (sub === "sil" || sub === "delete") {
    const ch = m.mentions.channels.first();
    if (!ch || ch.type !== ChannelType.GuildVoice) { await m.reply("❌ Geçerli bir ses kanalı etiketle."); return; }
    await ch.delete("v!seskanal sil komutu");
    await m.reply(`✅ **${ch.name}** ses kanalı silindi.`);
    return;
  }

  // yeniden adlandır
  if (sub === "yeniden" || sub === "rename" || sub === "isim") {
    const ch = m.mentions.channels.first();
    if (!ch || ch.type !== ChannelType.GuildVoice) { await m.reply("❌ Geçerli bir ses kanalı etiketle."); return; }
    const newName = args.slice(2).join(" ").trim();
    if (!newName) { await m.reply("❌ Yeni isim gir."); return; }
    await ch.setName(newName);
    await m.reply(`✅ Ses kanalı **${newName}** olarak yeniden adlandırıldı.`);
    return;
  }

  // kullanıcı limitini değiştir
  if (sub === "limit") {
    const ch = m.mentions.channels.first();
    if (!ch || ch.type !== ChannelType.GuildVoice) { await m.reply("❌ Geçerli bir ses kanalı etiketle."); return; }
    const lim = parseInt(args[2] ?? "0", 10);
    if (isNaN(lim) || lim < 0 || lim > 99) { await m.reply("❌ Limit 0-99 arasında olmalı (0 = sınırsız)."); return; }
    await (ch as any).setUserLimit(lim);
    await m.reply(`✅ Kullanıcı limiti **${lim === 0 ? "sınırsız" : lim}** olarak ayarlandı.`);
    return;
  }

  // Oluştur: v!seskanal <isim> [limit] [bitrate]
  const channelName = sub.replace(/[^a-z0-9ğüşıöç\-_ ]/gi, "").slice(0, 100).trim();
  if (!channelName || channelName.length < 2) { await m.reply("❌ Geçerli bir kanal ismi gir (en az 2 karakter)."); return; }

  const userLimit = parseInt(args[1] ?? "0", 10);
  const bitrateKbps = parseInt(args[2] ?? "64", 10);

  const limitVal   = isNaN(userLimit) || userLimit < 0 || userLimit > 99  ? 0   : userLimit;
  const bitrateVal = isNaN(bitrateKbps) || bitrateKbps < 8 || bitrateKbps > 384 ? 64000 : bitrateKbps * 1000;

  const parentId = m.channel instanceof TextChannel ? m.channel.parentId ?? undefined : undefined;

  try {
    const ch = await m.guild.channels.create({
      name:      channelName,
      type:      ChannelType.GuildVoice,
      userLimit: limitVal,
      bitrate:   bitrateVal,
      parent:    parentId,
      reason:    `v!seskanal — ${m.author.tag}`,
    });
    await m.reply(
      `✅ 🔊 **${ch.name}** ses kanalı oluşturuldu!\n` +
      `👥 Limit: **${limitVal === 0 ? "Sınırsız" : limitVal}** | ` +
      `📶 Bitrate: **${bitrateVal / 1000} kbps**`
    );
  } catch (err: any) {
    await m.reply(`❌ Ses kanalı oluşturulamadı: ${(err as Error).message}`);
  }
}

// ── KANAL AÇ ──────────────────────────────────────────────────────────────────

async function pfxKanalAc(m: Message, args: string[]): Promise<void> {
  if (!m.guild || !m.guildId) return;

  // Yetki kontrolü: ManageChannels veya Yönetici
  const member = m.guild.members.cache.get(m.author.id)
    ?? await m.guild.members.fetch(m.author.id).catch(() => null);
  const hasPermission =
    isOwner(m.author.id) ||
    m.guild.ownerId === m.author.id ||
    member?.permissions.has(PermissionFlagsBits.ManageChannels) ||
    member?.permissions.has(PermissionFlagsBits.Administrator);

  if (!hasPermission) {
    await m.reply("❌ Kanal oluşturmak için **Kanalları Yönet** yetkisine ihtiyacın var.");
    return;
  }

  if (args.length === 0) {
    await m.reply(
      "❌ **Kullanım:**\n" +
      "`v!kanalac <kanal-ismi>` — Normal kanal\n" +
      "`v!kanalac <kanal-ismi> nsfw` — 18+ yaş sınırlı kanal\n\n" +
      "Kanal ismi boşluk içeriyorsa tire kullan: `v!kanalac genel-sohbet`"
    );
    return;
  }

  // Son argüman "nsfw", "yaş", "18" veya "18+" ise yaş sınırlı
  const lastArg = args[args.length - 1]!.toLowerCase();
  const isNsfw = ["nsfw", "yaş", "yas", "18", "18+", "yetişkin", "yetiskin"].includes(lastArg);
  const nameParts = isNsfw ? args.slice(0, -1) : args;
  const channelName = nameParts.join("-").toLowerCase().replace(/[^a-z0-9ğüşıöç\-_]/gi, "").slice(0, 100);

  if (!channelName) {
    await m.reply("❌ Geçerli bir kanal ismi gir.");
    return;
  }

  // Kanalı oluşturan kişinin bulunduğu kategoriyi al (opsiyonel)
  const parentId = m.channel instanceof TextChannel ? m.channel.parentId ?? undefined : undefined;

  try {
    const newChannel = await m.guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      nsfw: isNsfw,
      parent: parentId,
      permissionOverwrites: [
        {
          id: m.guild.id, // @everyone
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        },
      ],
    });

    const embed = new EmbedBuilder()
      .setColor(isNsfw ? 0xed4245 : 0x57f287)
      .setTitle(`${isNsfw ? "🔞" : "✅"} Kanal Oluşturuldu`)
      .addFields(
        { name: "📺 Kanal", value: `<#${newChannel.id}>`, inline: true },
        { name: "👤 Oluşturan", value: `<@${m.author.id}>`, inline: true },
        { name: "🔞 Yaş Sınırı", value: isNsfw ? "**18+ (NSFW)**" : "Yok", inline: true },
      )
      .setTimestamp();

    await m.reply({ embeds: [embed] });

    // Yeni kanalda hoş geldin mesajı
    const welcomeMsg = isNsfw
      ? `🔞 **Bu kanal 18+ içerik için ayrılmıştır.**\n<@${m.author.id}> tarafından oluşturuldu. Lütfen sunucu kurallarına uy.`
      : `👋 **${channelName}** kanalına hoş geldiniz!\n<@${m.author.id}> tarafından oluşturuldu. Mesaj atmaya başlayabilirsiniz.`;

    await newChannel.send(welcomeMsg);
  } catch (err) {
    logger.error({ err }, "Kanal oluşturma hatası");
    await m.reply(`❌ Kanal oluşturulamadı: ${(err as Error).message}`);
  }
}

// ── MESAJ AT ─────────────────────────────────────────────────────────────────
// Kullanım:
//   v!mesajat #kanal Mesaj metni          → normal mesaj
//   v!mesajat embed #kanal Başlık | Açıklama → embed mesaj

async function pfxMesajAt(m: Message, args: string[]): Promise<void> {
  if (!m.guild || !m.guildId) return;

  // Yetki: Yönetici veya ManageMessages
  const member = m.guild.members.cache.get(m.author.id)
    ?? await m.guild.members.fetch(m.author.id).catch(() => null);
  const hasPermission =
    isOwner(m.author.id) ||
    m.guild.ownerId === m.author.id ||
    member?.permissions.has(PermissionFlagsBits.Administrator) ||
    member?.permissions.has(PermissionFlagsBits.ManageMessages);

  if (!hasPermission) {
    await m.reply("❌ Bu komutu kullanmak için **Mesajları Yönet** veya **Yönetici** yetkisine ihtiyacın var.");
    return;
  }

  if (args.length < 2) {
    await m.reply(
      "❌ **Kullanım:**\n" +
      "`v!mesajat #kanal Mesaj metni` — Normal mesaj gönderir\n" +
      "`v!mesajat embed #kanal Başlık | Açıklama` — Embed gönderir\n" +
      "`v!mesajat embed #kanal Açıklama` — Embed gönderir (sadece açıklama)\n\n" +
      "💡 Embed'de `|` ile başlık ve açıklamayı ayırabilirsin."
    );
    return;
  }

  // embed mi normal mi?
  const isEmbed = args[0]!.toLowerCase() === "embed";
  const remaining = isEmbed ? args.slice(1) : args;

  // Kanal mention'ı bul
  const channelArg = remaining[0]!;
  const channelId = channelArg.replace(/[<#>]/g, "");
  const targetChannel = m.guild.channels.cache.get(channelId);

  if (!targetChannel || !(targetChannel instanceof TextChannel)) {
    await m.reply("❌ Geçerli bir yazı kanalı belirt. Örnek: `v!mesajat #genel Merhaba!`");
    return;
  }

  const messageText = remaining.slice(1).join(" ").trim();
  if (!messageText) {
    await m.reply("❌ Gönderilecek mesaj boş olamaz.");
    return;
  }

  try {
    if (isEmbed) {
      // Başlık | Açıklama ayrımı (| karakteri varsa)
      const pipeIdx = messageText.indexOf("|");
      const title = pipeIdx !== -1 ? messageText.slice(0, pipeIdx).trim() : null;
      const description = pipeIdx !== -1 ? messageText.slice(pipeIdx + 1).trim() : messageText;

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setDescription(description)
        .setTimestamp()
        .setFooter({ text: m.guild.name, iconURL: m.guild.iconURL() ?? undefined });

      if (title) embed.setTitle(title);

      await targetChannel.send({ embeds: [embed] });
    } else {
      await targetChannel.send(messageText);
    }

    // Komutu kullanan kişiye onay ver (ephemeral-benzeri: silinir)
    const confirm = await m.reply(
      `✅ Mesaj **#${targetChannel.name}** kanalına ${isEmbed ? "embed olarak" : "normal şekilde"} gönderildi.`
    );
    setTimeout(() => {
      confirm.delete().catch(() => null);
      m.delete().catch(() => null);
    }, 5000);

  } catch (err) {
    logger.error({ err }, "Mesaj gönderme hatası");
    await m.reply(`❌ Mesaj gönderilemedi: ${(err as Error).message}`);
  }
}

// ── UZAK MODERASYon ───────────────────────────────────────────────────────────
// v!uzakmod <alt-komut> [sunucuID] [userID] [...]
// Sadece bot sahibi kullanabilir.

async function sendRemoteLog(client: import("discord.js").Client, guildId: string, text: string): Promise<void> {
  try {
    const channelId = await getRemoteModChannel(guildId);
    if (!channelId) return;
    const ch = await client.channels.fetch(channelId).catch(() => null);
    if (ch?.isTextBased()) await (ch as TextChannel).send(text);
  } catch { /**/ }
}

async function pfxUzakMod(m: Message, args: string[]): Promise<void> {
  const owner = isOwner(m.author.id);
  const authorized = owner || await isRemoteModAuthorized(m.author.id);

  const sub = args[0]?.toLowerCase() ?? "";

  // Yetki yönetimi alt komutları sadece bot sahibine açık
  const ownerOnlySubs = new Set(["yetki", "setup", "kur", "sil", "kaldır", "kaldir", "sunucular", "list"]);
  if (ownerOnlySubs.has(sub) && !owner) {
    await m.reply("❌ Bu alt komutu yalnızca **bot sahibi** kullanabilir.");
    return;
  }

  // Diğer komutlar: owner veya yetkili kullanıcı
  if (!authorized) {
    await m.reply("❌ Bu komutu kullanma yetkin yok. Bot sahibinden yetki talep et.");
    return;
  }

  // ── Yardım / boş ──────────────────────────────────────────────────────────
  if (!sub || sub === "yardım" || sub === "yardim" || sub === "help") {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("🌐 Uzak Moderasyon — Komutlar")
      .setDescription("Başka sunucularda moderasyon işlemi yapmanı sağlar.")
      .addFields(
        { name: "🔧 Kurulum (bot sahibi)", value: [
          "`v!uzakmod setup <sunucuID>` — Log kanalı oluşturur",
          "`v!uzakmod sil <sunucuID>` — Log kaydını siler",
          "`v!uzakmod sunucular` — Bot'un bulunduğu sunucular",
          "`v!uzakmod yetki ekle <userID>` — Yetkili ekler",
          "`v!uzakmod yetki kaldır <userID>` — Yetkiyi alır",
          "`v!uzakmod yetki liste` — Yetkilileri listeler",
        ].join("\n"), inline: false },
        { name: "⚖️ Moderasyon (yetkili + bot sahibi)", value: [
          "`v!uzakmod kick <sunucuID> <userID> [sebep]`",
          "`v!uzakmod ban <sunucuID> <userID> [sebep]`",
          "`v!uzakmod unban <sunucuID> <userID> [sebep]`",
          "`v!uzakmod warn <sunucuID> <userID> <sebep>`",
          "`v!uzakmod timeout <sunucuID> <userID> <süre> [sebep]`",
          "`v!uzakmod sicil <sunucuID> <userID>`",
        ].join("\n"), inline: false },
      )
      .setFooter({ text: "Tüm işlemler log kanalına kaydedilir" });
    await m.reply({ embeds: [embed] });
    return;
  }

  // ── Yetki yönetimi ────────────────────────────────────────────────────────
  if (sub === "yetki") {
    const yetSub = args[1]?.toLowerCase() ?? "";

    if (yetSub === "ekle" || yetSub === "add") {
      const userId = args[2];
      if (!userId) { await m.reply("❌ Kullanım: `v!uzakmod yetki ekle <userID>`"); return; }
      const user = await m.client.users.fetch(userId).catch(() => null);
      if (!user) { await m.reply("❌ Kullanıcı bulunamadı."); return; }
      await addRemoteModAuth(userId, m.author.id);
      await m.reply(`✅ **${user.tag}** uzak moderasyon yetkisi verildi.`);
      return;
    }

    if (yetSub === "kaldır" || yetSub === "kaldir" || yetSub === "sil" || yetSub === "remove") {
      const userId = args[2];
      if (!userId) { await m.reply("❌ Kullanım: `v!uzakmod yetki kaldır <userID>`"); return; }
      const removed = await removeRemoteModAuth(userId);
      const user = await m.client.users.fetch(userId).catch(() => null);
      await m.reply(removed
        ? `✅ **${user?.tag ?? userId}** uzak moderasyon yetkisi kaldırıldı.`
        : `⚠️ **${user?.tag ?? userId}** zaten yetkili listesinde değildi.`
      );
      return;
    }

    if (yetSub === "liste" || yetSub === "list" || !yetSub) {
      const list = await listRemoteModAuth();
      if (list.length === 0) {
        await m.reply("📋 Yetkili listesi boş. `v!uzakmod yetki ekle <userID>` ile ekleyebilirsin.");
        return;
      }
      const lines = await Promise.all(
        list.map(async (e) => {
          const u = await m.client.users.fetch(e.userId).catch(() => null);
          return `• **${u?.tag ?? e.userId}** (\`${e.userId}\`)`;
        })
      );
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`👥 Uzak Mod Yetkilileri — ${list.length} kişi`)
        .setDescription(lines.join("\n"))
        .setTimestamp();
      await m.reply({ embeds: [embed] });
      return;
    }

    await m.reply("❌ Kullanım: `v!uzakmod yetki ekle/kaldır/liste`");
    return;
  }

  // ── Sunucu listesi ─────────────────────────────────────────────────────────
  if (sub === "sunucular" || sub === "list") {
    const guilds = [...m.client.guilds.cache.values()];
    const lines = guilds.map((g, i) => `\`${i + 1}.\` **${g.name}** — \`${g.id}\` (${g.memberCount} üye)`).join("\n");
    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle(`🌐 Bot — ${guilds.length} Sunucu`)
      .setDescription(lines.slice(0, 4000) || "Sunucu yok")
      .setTimestamp();
    await m.reply({ embeds: [embed] });
    return;
  }

  // ── Setup: hedef sunucuda log kanalı oluştur ───────────────────────────────
  if (sub === "setup" || sub === "kur") {
    const guildId = args[1];
    if (!guildId) { await m.reply("❌ Kullanım: `v!uzakmod setup <sunucuID>`"); return; }

    const targetGuild = m.client.guilds.cache.get(guildId)
      ?? await m.client.guilds.fetch(guildId).catch(() => null);
    if (!targetGuild) { await m.reply("❌ Sunucu bulunamadı veya bot o sunucuda değil."); return; }

    // Mevcut kanal var mı?
    const existing = await getRemoteModChannel(guildId);
    if (existing) {
      const ch = await m.client.channels.fetch(existing).catch(() => null);
      if (ch) {
        await m.reply(`⚠️ **${targetGuild.name}** için zaten bir log kanalı var: <#${existing}>\nSilmek için: \`v!uzakmod sil ${guildId}\``);
        return;
      }
    }

    // Kanal oluştur
    try {
      const logCh = await targetGuild.channels.create({
        name: "🔧・uzak-mod-log",
        type: ChannelType.GuildText,
        topic: "Bot sahibi tarafından uzaktan yapılan moderasyon işlemleri bu kanala kaydedilir.",
        permissionOverwrites: [
          { id: targetGuild.roles.everyone.id, deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ViewChannel] },
        ],
      });
      await setRemoteModChannel(guildId, logCh.id);
      await logCh.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("🌐 Uzak Moderasyon Log Kanalı Kuruldu")
            .setDescription("Bu kanal, bot sahibinin bu sunucuda uzaktan yaptığı moderasyon işlemlerini kayıt altına almak için oluşturulmuştur.")
            .setTimestamp(),
        ],
      });
      await m.reply(`✅ **${targetGuild.name}** sunucusunda uzak-mod log kanalı oluşturuldu: \`#${logCh.name}\``);
    } catch (err) {
      await m.reply(`❌ Kanal oluşturulamadı: ${(err as Error).message}`);
    }
    return;
  }

  // ── Sil: log kanalı kaydını kaldır ────────────────────────────────────────
  if (sub === "sil" || sub === "kaldır" || sub === "kaldir") {
    const guildId = args[1];
    if (!guildId) { await m.reply("❌ Kullanım: `v!uzakmod sil <sunucuID>`"); return; }
    await removeRemoteModChannel(guildId);
    await m.reply(`✅ \`${guildId}\` için uzak-mod log kanalı kaydı silindi.`);
    return;
  }

  // ── Sicil (moderasyon geçmişi) ─────────────────────────────────────────────
  if (sub === "sicil" || sub === "logs" || sub === "geçmiş" || sub === "gecmis") {
    const guildId = args[1];
    const userId = args[2];
    if (!guildId || !userId) { await m.reply("❌ Kullanım: `v!uzakmod sicil <sunucuID> <userID>`"); return; }

    const targetGuild = m.client.guilds.cache.get(guildId)
      ?? await m.client.guilds.fetch(guildId).catch(() => null);
    if (!targetGuild) { await m.reply("❌ Sunucu bulunamadı."); return; }

    const targetUser = await m.client.users.fetch(userId).catch(() => null);
    const logs = await getUserLogs(userId, guildId);

    if (logs.length === 0) {
      await m.reply(`✅ **${targetUser?.tag ?? userId}** kullanıcısının **${targetGuild.name}** sunucusunda moderasyon kaydı yok.`);
      return;
    }

    const active = logs.filter((l) => l.active);
    const lines = logs.slice(0, 15).map((l) =>
      `\`#${l.id}\` ${l.action === "warn" ? "⚠️" : l.action === "kick" ? "👢" : l.action === "ban" ? "🔨" : l.action === "timeout" ? "🔇" : "✅"} **${l.action.toUpperCase()}** — ${l.reason ?? "Sebep yok"} ${l.active ? "" : "~~(pasif)~~"}`
    ).join("\n");

    const embed = new EmbedBuilder()
      .setColor(0xfaa61a)
      .setTitle(`📋 Sicil — ${targetUser?.tag ?? userId}`)
      .setDescription(lines)
      .addFields({ name: "Sunucu", value: targetGuild.name, inline: true }, { name: "Toplam", value: `${logs.length} kayıt (${active.length} aktif)`, inline: true })
      .setThumbnail(targetUser?.displayAvatarURL({ extension: "png", size: 128 }) ?? null)
      .setTimestamp();
    await m.reply({ embeds: [embed] });
    return;
  }

  // ── Ortak: sunucuID ve userID al ─────────────────────────────────────────
  const targetGuildId = args[1];
  const targetUserId  = args[2];
  if (!targetGuildId || !targetUserId) {
    await m.reply(`❌ Kullanım: \`v!uzakmod ${sub} <sunucuID> <userID> [ek-argümanlar]\``);
    return;
  }

  const targetGuild = m.client.guilds.cache.get(targetGuildId)
    ?? await m.client.guilds.fetch(targetGuildId).catch(() => null);
  if (!targetGuild) { await m.reply("❌ Sunucu bulunamadı veya bot o sunucuda değil."); return; }

  const targetUser = await m.client.users.fetch(targetUserId).catch(() => null);
  if (!targetUser) { await m.reply("❌ Kullanıcı bulunamadı."); return; }

  // ── KICK ──────────────────────────────────────────────────────────────────
  if (sub === "kick" || sub === "at") {
    const sebep = args.slice(3).join(" ") || "Uzak moderasyon — sebep belirtilmedi";
    try {
      const member = await targetGuild.members.fetch(targetUserId).catch(() => null);
      if (!member) { await m.reply("❌ Kullanıcı o sunucuda bulunamadı."); return; }
      await member.kick(sebep);
      const log = await logAction({ guildId: targetGuildId, userId: targetUserId, moderatorId: m.author.id, action: "kick", reason: sebep });
      const line = `👢 **UZAK KICK** | <@${targetUserId}> (${targetUser.tag}) | Mod: <@${m.author.id}> | Sebep: ${sebep} | #${log.id}`;
      await sendRemoteLog(m.client, targetGuildId, line);
      await m.reply(`✅ **${targetUser.tag}**, **${targetGuild.name}** sunucusundan atıldı.\n> Sebep: ${sebep}`);
    } catch (err) {
      await m.reply(`❌ Kick başarısız: ${(err as Error).message}`);
    }
    return;
  }

  // ── BAN ───────────────────────────────────────────────────────────────────
  if (sub === "ban" || sub === "yasakla") {
    const sebep = args.slice(3).join(" ") || "Uzak moderasyon — sebep belirtilmedi";
    try {
      await targetGuild.bans.create(targetUserId, { reason: `${m.author.tag}: ${sebep}` });
      const log = await logAction({ guildId: targetGuildId, userId: targetUserId, moderatorId: m.author.id, action: "ban", reason: sebep });
      const line = `🔨 **UZAK BAN** | <@${targetUserId}> (${targetUser.tag}) | Mod: <@${m.author.id}> | Sebep: ${sebep} | #${log.id}`;
      await sendRemoteLog(m.client, targetGuildId, line);
      await m.reply(`✅ **${targetUser.tag}**, **${targetGuild.name}** sunucusunda yasaklandı.\n> Sebep: ${sebep}`);
    } catch (err) {
      await m.reply(`❌ Ban başarısız: ${(err as Error).message}`);
    }
    return;
  }

  // ── UNBAN ─────────────────────────────────────────────────────────────────
  if (sub === "unban" || sub === "yasakkaldır" || sub === "yasakkaldir") {
    const sebep = args.slice(3).join(" ") || "Uzak moderasyon — yasak kaldırıldı";
    try {
      await targetGuild.bans.remove(targetUserId, `${m.author.tag}: ${sebep}`);
      const log = await logAction({ guildId: targetGuildId, userId: targetUserId, moderatorId: m.author.id, action: "unban", reason: sebep });
      const line = `✅ **UZAK UNBAN** | <@${targetUserId}> (${targetUser.tag}) | Mod: <@${m.author.id}> | Sebep: ${sebep} | #${log.id}`;
      await sendRemoteLog(m.client, targetGuildId, line);
      await m.reply(`✅ **${targetUser.tag}** için **${targetGuild.name}** sunucusundaki yasak kaldırıldı.`);
    } catch (err) {
      await m.reply(`❌ Unban başarısız: ${(err as Error).message}`);
    }
    return;
  }

  // ── WARN ──────────────────────────────────────────────────────────────────
  if (sub === "warn" || sub === "uyar") {
    const sebep = args.slice(3).join(" ");
    if (!sebep) { await m.reply("❌ Kullanım: `v!uzakmod warn <sunucuID> <userID> <sebep>`"); return; }

    const log = await logAction({ guildId: targetGuildId, userId: targetUserId, moderatorId: m.author.id, action: "warn", reason: sebep });
    const allWarns = (await getUserLogs(targetUserId, targetGuildId)).filter((l) => l.action === "warn" && l.active);

    // Warn kartı oluştur
    let warnBuf: Buffer | null = null;
    try {
      warnBuf = await generateWarnCard({
        username: targetUser.displayName,
        avatarUrl: targetUser.displayAvatarURL({ extension: "png", size: 256 }),
        moderatorName: m.author.displayName,
        reason: sebep,
        warnId: log.id,
        totalWarns: allWarns.length,
        guildName: targetGuild.name,
      });
    } catch { /**/ }

    // DM gönder
    try {
      if (warnBuf) {
        await targetUser.send({
          content: `⚠️ **${targetGuild.name}** sunucusunda uyarı aldın!\n**Sebep:** ${sebep} | **ID:** #${log.id}`,
          files: [new AttachmentBuilder(warnBuf, { name: "warn.png" })],
        });
      } else {
        await targetUser.send(`⚠️ **${targetGuild.name}** sunucusunda uyarı aldın!\nSebep: ${sebep} | #${log.id}`);
      }
    } catch { /**/ }

    const line = `⚠️ **UZAK WARN** | <@${targetUserId}> (${targetUser.tag}) | Mod: <@${m.author.id}> | Sebep: ${sebep} | #${log.id}`;
    await sendRemoteLog(m.client, targetGuildId, line);

    if (warnBuf) {
      await m.reply({ content: `✅ **${targetUser.tag}** uyarıldı (DM gönderildi). | **${targetGuild.name}** | #${log.id}`, files: [new AttachmentBuilder(warnBuf, { name: "warn.png" })] });
    } else {
      await m.reply(`✅ **${targetUser.tag}** uyarıldı. | **${targetGuild.name}** | #${log.id}`);
    }
    return;
  }

  // ── TIMEOUT ───────────────────────────────────────────────────────────────
  if (sub === "timeout" || sub === "sustur") {
    const durationStr = args[3];
    if (!durationStr) { await m.reply("❌ Kullanım: `v!uzakmod timeout <sunucuID> <userID> <süre> [sebep]`\nÖrn: `10m`, `1sa`, `2g`"); return; }
    const ms = parseDuration(durationStr);
    if (!ms || ms < 1000 || ms > 28 * 24 * 60 * 60 * 1000) { await m.reply("❌ Geçersiz süre. Min: 1sn, Maks: 28g."); return; }
    const sebep = args.slice(4).join(" ") || "Uzak moderasyon — sebep belirtilmedi";

    try {
      const member = await targetGuild.members.fetch(targetUserId).catch(() => null);
      if (!member) { await m.reply("❌ Kullanıcı o sunucuda bulunamadı."); return; }
      await member.timeout(ms, sebep);
      const log = await logAction({ guildId: targetGuildId, userId: targetUserId, moderatorId: m.author.id, action: "timeout", reason: sebep, duration: ms });
      const line = `🔇 **UZAK TIMEOUT** | <@${targetUserId}> (${targetUser.tag}) | Süre: ${durationStr} | Mod: <@${m.author.id}> | Sebep: ${sebep} | #${log.id}`;
      await sendRemoteLog(m.client, targetGuildId, line);
      await m.reply(`✅ **${targetUser.tag}**, **${targetGuild.name}** sunucusunda **${durationStr}** susturuldu.\n> Sebep: ${sebep}`);
    } catch (err) {
      await m.reply(`❌ Timeout başarısız: ${(err as Error).message}`);
    }
    return;
  }

  await m.reply(`❌ Bilinmeyen alt komut: \`${sub}\`\nYardım için: \`v!uzakmod yardım\``);
}

// ── SUNUCU MESAJ ──────────────────────────────────────────────────────────────
// v!sunucumesaj <sunucuID> <kanalID> <mesaj>
// Bot sahibine özel: başka bir sunucunun kanalına mesaj gönderir. Onay butonlu.

async function pfxSunucuMesaj(m: Message, args: string[]): Promise<void> {
  // Sadece bot sahibi kullanabilir
  if (!isOwner(m.author.id)) {
    await m.reply("❌ Bu komutu yalnızca **bot sahibi** kullanabilir.");
    return;
  }

  // Kullanım: v!sunucumesaj <sunucuID> <kanalID> <mesaj...>
  if (args.length < 3) {
    await m.reply(
      "❌ **Kullanım:**\n" +
      "`v!sunucumesaj <sunucuID> <kanalID> <mesaj>` — Belirtilen sunucunun kanalına mesaj gönderir\n" +
      "`v!sunucumesaj <sunucuID> <kanalID> embed <Başlık|Açıklama>` — Embed gönderir\n\n" +
      "**Örnek:**\n" +
      "`v!sunucumesaj 1234567890 9876543210 Merhaba!`\n" +
      "`v!sunucumesaj 1234567890 9876543210 embed Başlık|Açıklama metni`"
    );
    return;
  }

  const targetGuildId = args[0]!;
  const targetChannelId = args[1]!;
  const isEmbed = args[2]?.toLowerCase() === "embed";
  const messageText = isEmbed ? args.slice(3).join(" ").trim() : args.slice(2).join(" ").trim();

  if (!messageText) {
    await m.reply("❌ Gönderilecek mesaj boş olamaz.");
    return;
  }

  // Hedef sunucu ve kanalı bul
  const targetGuild = m.client.guilds.cache.get(targetGuildId)
    ?? await m.client.guilds.fetch(targetGuildId).catch(() => null);

  if (!targetGuild) {
    await m.reply(`❌ **${targetGuildId}** ID'li sunucu bulunamadı veya bot o sunucuda değil.`);
    return;
  }

  const targetChannel = targetGuild.channels.cache.get(targetChannelId)
    ?? await targetGuild.channels.fetch(targetChannelId).catch(() => null);

  if (!targetChannel || !(targetChannel instanceof TextChannel)) {
    await m.reply(`❌ **${targetChannelId}** ID'li kanal bulunamadı veya yazı kanalı değil.`);
    return;
  }

  // Önizleme embed'i oluştur
  const previewEmbed = new EmbedBuilder()
    .setColor(0xf0a500)
    .setTitle("📤 Sunucuya Mesaj Onayı")
    .addFields(
      { name: "🏠 Hedef Sunucu", value: `**${targetGuild.name}** (\`${targetGuild.id}\`)`, inline: false },
      { name: "📢 Hedef Kanal", value: `**#${targetChannel.name}** (\`${targetChannel.id}\`)`, inline: false },
      { name: "💬 Mesaj Türü", value: isEmbed ? "Embed" : "Normal Metin", inline: true },
      { name: "📝 İçerik", value: `\`\`\`${messageText.slice(0, 900)}\`\`\``, inline: false },
    )
    .setFooter({ text: "Bu mesajı göndermek istiyor musun?" })
    .setTimestamp();

  // Onay butonları
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`smesaj_onayla_${m.id}`)
      .setLabel("✅ Gönder")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`smesaj_iptal_${m.id}`)
      .setLabel("❌ İptal")
      .setStyle(ButtonStyle.Danger),
  );

  const confirmMsg = await m.reply({ embeds: [previewEmbed], components: [row] });

  // Buton dinleyici — sadece komut sahibi basabilir, 60 saniye timeout
  const collector = confirmMsg.createMessageComponentCollector({
    filter: (i) => i.user.id === m.author.id && (i.customId === `smesaj_onayla_${m.id}` || i.customId === `smesaj_iptal_${m.id}`),
    time: 60_000,
    max: 1,
  });

  collector.on("collect", async (interaction) => {
    await interaction.deferUpdate().catch(() => null);

    if (interaction.customId === `smesaj_iptal_${m.id}`) {
      const cancelEmbed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle("❌ İptal Edildi")
        .setDescription("Mesaj gönderme işlemi iptal edildi.");
      await confirmMsg.edit({ embeds: [cancelEmbed], components: [] }).catch(() => null);
      return;
    }

    // Gönder
    try {
      if (isEmbed) {
        const pipeIdx = messageText.indexOf("|");
        const title = pipeIdx !== -1 ? messageText.slice(0, pipeIdx).trim() : null;
        const description = pipeIdx !== -1 ? messageText.slice(pipeIdx + 1).trim() : messageText;

        const sendEmbed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setDescription(description)
          .setTimestamp();
        if (title) sendEmbed.setTitle(title);

        await (targetChannel as TextChannel).send({ embeds: [sendEmbed] });
      } else {
        await (targetChannel as TextChannel).send(messageText);
      }

      const successEmbed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("✅ Mesaj Gönderildi")
        .addFields(
          { name: "Sunucu", value: `${targetGuild.name}`, inline: true },
          { name: "Kanal", value: `#${targetChannel.name}`, inline: true },
        )
        .setTimestamp();

      await confirmMsg.edit({ embeds: [successEmbed], components: [] }).catch(() => null);
    } catch (err) {
      logger.error({ err }, "Sunucu mesaj gönderme hatası");
      const errEmbed = new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle("❌ Gönderilemedi")
        .setDescription(`Hata: ${(err as Error).message}`);
      await confirmMsg.edit({ embeds: [errEmbed], components: [] }).catch(() => null);
    }
  });

  collector.on("end", async (collected) => {
    if (collected.size === 0) {
      const timeoutEmbed = new EmbedBuilder()
        .setColor(0x99aab5)
        .setTitle("⏱️ Zaman Aşımı")
        .setDescription("60 saniye içinde yanıt verilmediği için işlem iptal edildi.");
      await confirmMsg.edit({ embeds: [timeoutEmbed], components: [] }).catch(() => null);
    }
  });
}

// ── KATEGORİ AÇ ───────────────────────────────────────────────────────────────
// v!kategoriac <isim> [#kanal1 #kanal2 ...]
// Kategori oluşturur; mention'lı kanalları o kategoriye taşır.

async function pfxKategoriAc(m: Message, args: string[]): Promise<void> {
  if (!m.guild || !m.guildId) return;

  const member = m.guild.members.cache.get(m.author.id)
    ?? await m.guild.members.fetch(m.author.id).catch(() => null);
  const hasPermission =
    isOwner(m.author.id) ||
    m.guild.ownerId === m.author.id ||
    member?.permissions.has(PermissionFlagsBits.ManageChannels) ||
    member?.permissions.has(PermissionFlagsBits.Administrator);

  if (!hasPermission) {
    await m.reply("❌ Kategori oluşturmak için **Kanalları Yönet** yetkisine ihtiyacın var.");
    return;
  }

  // İsim: mention'lardan önceki kelimeler
  const mentionedChannels = [...m.mentions.channels.values()].filter(
    (ch) => ch instanceof TextChannel
  ) as TextChannel[];
  const mentionedIds = new Set(mentionedChannels.map((c) => c.id));

  // Args'tan kanal mention'larını çıkar, geri kalanı isim yap
  const nameWords = args.filter((a) => !a.startsWith("<#") && !a.startsWith("#"));
  const categoryName = nameWords.join(" ").trim();

  if (!categoryName) {
    await m.reply(
      "❌ **Kullanım:**\n" +
      "`v!kategoriac <isim>` — Boş kategori oluşturur\n" +
      "`v!kategoriac <isim> #kanal1 #kanal2` — Kategori oluşturur ve kanalları taşır"
    );
    return;
  }

  try {
    // Kategori oluştur
    const category = await m.guild.channels.create({
      name: categoryName,
      type: ChannelType.GuildCategory,
    });

    // Mention'lanan kanalları bu kategoriye taşı
    const moved: string[] = [];
    for (const ch of mentionedChannels) {
      await ch.setParent(category.id, { lockPermissions: false }).catch(() => null);
      moved.push(`<#${ch.id}>`);
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("📁 Kategori Oluşturuldu")
      .addFields(
        { name: "📂 Kategori", value: `**${category.name}**`, inline: true },
        { name: "👤 Oluşturan", value: `<@${m.author.id}>`, inline: true },
      );

    if (moved.length > 0) {
      embed.addFields({ name: `📦 Taşınan Kanallar (${moved.length})`, value: moved.join("\n") });
    } else {
      embed.addFields({ name: "💡 İpucu", value: "Kanal taşımak için: `v!kategoriac <isim> #kanal1 #kanal2`" });
    }

    embed.setTimestamp();
    await m.reply({ embeds: [embed] });
  } catch (err) {
    logger.error({ err }, "Kategori oluşturma hatası");
    await m.reply(`❌ Kategori oluşturulamadı: ${(err as Error).message}`);
  }
}

// ── MODSETUP ──────────────────────────────────────────────────────────────────

const MOD_CMD_NAMES: Record<string, ModCommand> = {
  ban: "ban", unban: "ban",
  kick: "kick",
  warn: "warn", uyarikaldir: "warn",
  timeout: "timeout", sustur: "timeout", untimeout: "timeout",
  kilitle: "mute", kilitac: "mute",
  temizle: "temizle", nuke: "temizle",
};

const MOD_CMD_LABELS: Record<ModCommand, string> = {
  ban:     "ban / unban",
  kick:    "kick",
  warn:    "warn / uyarikaldir",
  timeout: "timeout / sustur / untimeout",
  mute:    "kilitle / kanal aç",
  temizle: "temizle / nuke",
};

async function pfxModSetup(m: Message, args: string[]): Promise<void> {
  if (!m.guild || !m.guildId) return;
  // Sunucu sahibi, bot sahibi veya Administrator yetkisine sahip kişiler
  const isAdmin = m.member?.permissions.has("Administrator") ?? false;
  if (!isOwner(m.author.id) && m.guild.ownerId !== m.author.id && !isAdmin) {
    await m.reply("❌ Bu komutu kullanmak için **Administrator** yetkisine veya sunucu sahipliğine ihtiyacın var."); return;
  }

  const sub = args[0]?.toLowerCase();

  // ── modsetup durum ────────────────────────────────────────────────────────
  if (!sub || sub === "durum" || sub === "status") {
    const s = await getModSettings(m.guildId);
    const enabled = s?.enabled ?? false;
    const log = s?.logChannelId ? `<#${s.logChannelId}>` : "Ayarlanmamış";

    const cmdList = (Object.entries(MOD_CMD_LABELS) as [ModCommand, string][]).map(([cmd, label]) => {
      const roles: string[] = s ? JSON.parse((s as any)[`${cmd}Roles`] ?? "[]") : [];
      const roleStr = roles.length ? roles.map(r => `<@&${r}>`).join(", ") : "*(sadece Discord izni)*";
      return `**${label}** → ${roleStr}`;
    });

    await m.reply(
      `🛡️ **Moderasyon Sistemi** — ${m.guild.name}\n` +
      `Durum: ${enabled ? "🟢 **Aktif**" : "🔴 **Kapalı**"}\n` +
      `📋 Log kanalı: ${log}\n\n` +
      `**Komut Rol İzinleri:**\n${cmdList.join("\n")}\n\n` +
      `**Komutlar:**\n` +
      "`modsetup aç/kapat` — Sistemi aç/kapat\n" +
      "`modsetup log #kanal` — Log kanalı ayarla\n" +
      "`modsetup rol <komut> @rol` — Role izin ver\n" +
      "`modsetup rolkaldir <komut> @rol` — Rolü kaldır\n" +
      `Komutlar: \`${Object.keys(MOD_CMD_NAMES).join(", ")}\``
    );
    return;
  }

  // ── modsetup aç / kapat ───────────────────────────────────────────────────
  if (sub === "aç" || sub === "ac" || sub === "on" || sub === "enable") {
    await setModEnabled(m.guildId, true);
    await m.reply(
      "🟢 **Moderasyon sistemi aktif edildi!**\n" +
      "Şu an tüm mod komutları Discord native iznine bakıyor.\n" +
      "`modsetup rol <komut> @rol` ile rollere özel izin tanımlayabilirsin.\n" +
      "`modsetup log #kanal` ile mod loglarını bir kanala yönlendir."
    );
    return;
  }

  if (sub === "kapat" || sub === "off" || sub === "disable") {
    await setModEnabled(m.guildId, false);
    await m.reply("🔴 **Moderasyon sistemi kapatıldı.** Tüm mod komutları devre dışı.");
    return;
  }

  // ── modsetup log #kanal ───────────────────────────────────────────────────
  if (sub === "log") {
    const ch = m.mentions.channels.first();
    if (!ch) { await m.reply("❌ Kullanım: `modsetup log #kanal`"); return; }
    await setModLogChannel(m.guildId, ch.id);
    await m.reply(`✅ Mod log kanalı <#${ch.id}> olarak ayarlandı.`);
    return;
  }

  // ── modsetup rol <komut> @rol ─────────────────────────────────────────────
  if (sub === "rol" || sub === "role") {
    const cmdKey = args[1]?.toLowerCase();
    const role   = m.mentions.roles.first();
    if (!cmdKey || !role) { await m.reply("❌ Kullanım: `modsetup rol <komut> @rol`\nKomutlar: `ban, kick, warn, timeout, kilitle, temizle`"); return; }
    const cmd = MOD_CMD_NAMES[cmdKey];
    if (!cmd) { await m.reply(`❌ Geçersiz komut: \`${cmdKey}\`\nGeçerli: \`${Object.keys(MOD_CMD_NAMES).join(", ")}\``); return; }
    const roles = await addRoleForCmd(m.guildId, cmd, role.id);
    await m.reply(`✅ **${role.name}** rolüne \`${MOD_CMD_LABELS[cmd]}\` izni verildi.\nToplam roller: ${roles.map(r => `<@&${r}>`).join(", ")}`);
    return;
  }

  // ── modsetup rolkaldir <komut> @rol ──────────────────────────────────────
  if (sub === "rolkaldir" || sub === "rolkaldır" || sub === "removerole") {
    const cmdKey = args[1]?.toLowerCase();
    const role   = m.mentions.roles.first();
    if (!cmdKey || !role) { await m.reply("❌ Kullanım: `modsetup rolkaldir <komut> @rol`"); return; }
    const cmd = MOD_CMD_NAMES[cmdKey];
    if (!cmd) { await m.reply(`❌ Geçersiz komut: \`${cmdKey}\``); return; }
    const roles = await removeRoleForCmd(m.guildId, cmd, role.id);
    await m.reply(`✅ **${role.name}** rolünün \`${MOD_CMD_LABELS[cmd]}\` izni kaldırıldı.\nKalan roller: ${roles.length ? roles.map(r => `<@&${r}>`).join(", ") : "*(yok)*"}`);
    return;
  }

  // ── modsetup yetkili ekle/kaldir @rol ────────────────────────────────────
  if (sub === "yetkili") {
    const action = args[1]?.toLowerCase();
    const role = m.mentions.roles.first();
    if (!role) { await m.reply("❌ Kullanım: `modsetup yetkili ekle @rol` / `modsetup yetkili kaldir @rol`"); return; }
    const tierInfo = await getModTierInfo(m.guildId);
    let roles = [...tierInfo.modRoles];
    if (action === "ekle" || action === "add") {
      if (!roles.includes(role.id)) roles.push(role.id);
      await setModRoles(m.guildId, roles);
      await m.reply(
        `✅ **${role.name}** rolü **Yetkili** olarak eklendi.\n` +
        `Bu roldeki üyeler \`ban\`/\`kick\` komutunu kullanabilir — Üst Yetkili onayı gerekir.\n` +
        `Toplam yetkili roller: ${roles.map((r) => `<@&${r}>`).join(", ")}`
      );
    } else if (action === "kaldir" || action === "kaldır" || action === "remove") {
      roles = roles.filter((r) => r !== role.id);
      await setModRoles(m.guildId, roles);
      await m.reply(`✅ **${role.name}** rolü Yetkili listesinden kaldırıldı.`);
    } else {
      await m.reply("❌ Kullanım: `modsetup yetkili ekle @rol` / `modsetup yetkili kaldir @rol`");
    }
    return;
  }

  // ── modsetup üstyetkili ekle/kaldir @rol ──────────────────────────────────
  if (sub === "üstyetkili" || sub === "ustyetkili" || sub === "senior" || sub === "üst") {
    const action = args[1]?.toLowerCase();
    const role = m.mentions.roles.first();
    if (!role) { await m.reply("❌ Kullanım: `modsetup üstyetkili ekle @rol` / `modsetup üstyetkili kaldir @rol`"); return; }
    const tierInfo = await getModTierInfo(m.guildId);
    let roles = [...tierInfo.seniorModRoles];
    if (action === "ekle" || action === "add") {
      if (!roles.includes(role.id)) roles.push(role.id);
      await setSeniorModRoles(m.guildId, roles);
      await m.reply(
        `✅ **${role.name}** rolü **Üst Yetkili** olarak eklendi.\n` +
        `Bu roldeki üyeler ban/kick isteklerini onaylayabilir ve doğrudan yürütebilir.\n` +
        `Toplam üst yetkili roller: ${roles.map((r) => `<@&${r}>`).join(", ")}`
      );
    } else if (action === "kaldir" || action === "kaldır" || action === "remove") {
      roles = roles.filter((r) => r !== role.id);
      await setSeniorModRoles(m.guildId, roles);
      await m.reply(`✅ **${role.name}** rolü Üst Yetkili listesinden kaldırıldı.`);
    } else {
      await m.reply("❌ Kullanım: `modsetup üstyetkili ekle @rol` / `modsetup üstyetkili kaldir @rol`");
    }
    return;
  }

  // ── modsetup onaykanal #kanal / kaldır ────────────────────────────────────
  if (sub === "onaykanal" || sub === "onay" || sub === "approvalchannel") {
    const action = args[1]?.toLowerCase();
    if (action === "kaldir" || action === "kaldır" || action === "remove" || action === "sil") {
      await setApprovalChannel(m.guildId, null);
      await m.reply("✅ Onay kanalı kaldırıldı. Artık ban/kick istekleri gönderilmeyecek.");
      return;
    }
    const ch = m.mentions.channels.first();
    if (!ch) { await m.reply("❌ Kullanım: `modsetup onaykanal #kanal` / `modsetup onaykanal kaldir`"); return; }
    await setApprovalChannel(m.guildId, ch.id);
    await m.reply(
      `✅ Ban/kick onay kanalı <#${ch.id}> olarak ayarlandı.\n` +
      `Yetkili rolündeki üyeler ban/kick isteğinde bulunduğunda buraya bildirim gelecek.`
    );
    return;
  }

  await m.reply(
    "❌ Geçersiz alt komut.\n" +
    "`modsetup aç` / `modsetup kapat` / `modsetup durum`\n" +
    "`modsetup log #kanal`\n" +
    "`modsetup rol <komut> @rol` / `modsetup rolkaldir <komut> @rol`\n" +
    "**Kademeli yetki sistemi:**\n" +
    "`modsetup yetkili ekle/kaldir @rol` — ban/kick onay ister\n" +
    "`modsetup üstyetkili ekle/kaldir @rol` — istekleri onaylar\n" +
    "`modsetup onaykanal #kanal` — onay mesajlarının gittiği kanal"
  );
}

// ── Ekonomi seviye-atlama bildirimi ───────────────────────────────────────────
async function notifyEconLevelUp(m: Message, result: EconXpResult): Promise<void> {
  if (!result.leveled) return;
  const highest = result.newLevels[result.newLevels.length - 1]!;
  const title = econRankTitle(highest);
  try {
    const buf = await generateEconLevelUpCard({
      username: m.author.displayName,
      avatarUrl: m.author.displayAvatarURL({ extension: "png", size: 256 }),
      newLevel: highest,
      reward: result.totalReward,
      rankTitle: title,
      coinSymbol: COIN,
    });
    await sendMessageChannel(m, {
      content: `${m.author}`,
      files: [new AttachmentBuilder(buf, { name: "ekon-levelup.png" })],
    });
  } catch {
    const nextReward = econLevelReward(highest + 1);
    await sendMessageChannel(m,
      `💹 **${m.author.displayName}** ekonomi seviye **${highest}**'e ulaştı — ${title}!\n` +
      `${COIN} **+${result.totalReward.toLocaleString("en-US")} vivincy** ödülü eklendi!\n` +
      `\u200b *Sonraki seviye ödülü: ${COIN} ${nextReward.toLocaleString("en-US")} vivincy*`
    ).catch(() => null);
  }
}

// EKONOMİ
async function pfxBakiye(m: Message): Promise<void> {
  const target = m.mentions.users.first() ?? m.author;
  const bal = await getBalance(target.id);
  const luck = await getLuck(target.id);
  const luckLine = luck > 0 ? "\n🍀 **|** Luck is currently **active**!" : "";
  await m.reply(
    `${COIN} **| ${target.displayName}**, you currently have **__${bal.coins.toLocaleString("en-US")}__ vivincy**!\n` +
    `\u200b **|** 🔥 Daily streak: **${bal.streak} days**${luckLine}`
  );
}

async function pfxGunlukodul(m: Message): Promise<void> {
  const formatTime = (ms: number): string => {
    const s = Math.ceil(ms / 1000);
    const h = Math.floor(s / 3600);
    const mn = Math.floor((s % 3600) / 60);
    const sc = s % 60;
    return `${h}H ${mn}M ${sc}S`;
  };

  const r = await claimDaily(m.author.id);

  if (r.alreadyClaimed) {
    await m.reply(
      `⏰ **|** You already claimed your daily, **${m.author.displayName}**!\n` +
      `**⏱️ |** Your next daily is in: **${formatTime(r.remainingMs ?? 0)}**`
    );
    return;
  }

  let msg =
    `💰 **| ${m.author.displayName}**, Here is your daily **${COIN} ${r.reward.toLocaleString("en-US")} vivincy**!\n` +
    `\u200b **|** You're on a **${r.streak} daily streak**!\n`;

  if (r.lootbox) {
    msg += `**📦 |** You received a **lootbox**! **${COIN} +${r.lootboxAmount.toLocaleString("en-US")} vivincy** bonus!\n`;
  }

  msg += `**⏱️ |** Your next daily is in: **${formatTime(20 * 60 * 60 * 1000)}**`;

  await m.reply(msg);
  const xpR = await addEconXp(m.author.id, 100).catch(() => null);
  if (xpR) await notifyEconLevelUp(m, xpR);
}

async function pfxTransfer(m: Message, args: string[]): Promise<void> {
  const target = m.mentions.users.first();
  const amount = parseInt(args[1] ?? "0");
  if (!target || isNaN(amount) || amount < 1) { await m.reply("❌ Kullanım: `transfer @kişi <miktar>`"); return; }
  if (target.id === m.author.id) { await m.reply("❌ Kendine coin gönderemezsin."); return; }
  const bal = await getBalance(m.author.id);
  if (bal.coins < amount) { await m.reply(`❌ Yetersiz bakiye: **${COIN} ${bal.coins.toLocaleString("en-US")} vivincy**`); return; }
  await takeCoins(m.author.id, amount);
  const newTarget = await addCoins(target.id, amount);
  await m.reply(`💸 **${m.author.displayName}** → **${target.displayName}** | **${COIN} ${amount.toLocaleString("en-US")} vivincy** gönderildi!\n${target.displayName} yeni bakiye: **${COIN} ${newTarget.toLocaleString("en-US")} vivincy**`);
  const xpR = await addEconXp(m.author.id, 10).catch(() => null);
  if (xpR) await notifyEconLevelUp(m, xpR);
}

async function pfxKumar(m: Message, args: string[]): Promise<void> {
  const bet = parseInt(args[0] ?? "0");
  if (isNaN(bet) || bet < 10) { await m.reply("❌ Kullanım: `slot <bahis>` (min 10)"); return; }
  const bal = await getBalance(m.author.id);
  if (bal.coins < bet) { await m.reply(`❌ Yetersiz bakiye: **${COIN} ${bal.coins.toLocaleString("en-US")} vivincy**`); return; }

  const luck = await getLuck(m.author.id);
  const SLOTS = ["🍒", "🍋", "🍊", "🍇", "💎", "7️⃣", "⭐"];

  function spin(): string {
    if (luck > 0 && Math.random() < 0.12)
      return SLOTS[4 + Math.floor(Math.random() * 3)]!;
    return SLOTS[Math.floor(Math.random() * SLOTS.length)]!;
  }

  const s1 = spin(), s2 = spin(), s3 = spin();
  const luckTag = luck > 0 ? " 🍀" : "";
  const betStr = bet.toLocaleString("en-US");
  const name = m.author.displayName;

  function frame(r1: string, r2: string, r3: string, resultLine = ""): string {
    return (
      `**\`___SLOTS___\`**${luckTag}\n` +
      `\` \` ${r1} ${r2} ${r3} \` \` ${name} bet ${COIN} ${betStr}\n` +
      `\`|         |\`${resultLine ? `   ${resultLine}` : ""}\n` +
      `\`|         |\``
    );
  }

  const SPN = "🎰";
  const msg = await m.reply(frame(SPN, SPN, SPN));
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  await sleep(700);
  await msg.edit(frame(s1, SPN, SPN)).catch(() => null);
  await sleep(700);
  await msg.edit(frame(s1, s2, SPN)).catch(() => null);
  await sleep(700);

  function calcWin(a: string, b: string, c: string): { multiplier: number; label: string } {
    if (a === b && b === c) {
      if (a === "7️⃣") return { multiplier: 20, label: "**JACKPOT!** 🎉 x20" };
      if (a === "💎") return { multiplier: 12, label: "**DIAMONDS!** 💎 x12" };
      if (a === "⭐") return { multiplier: 8, label: "**STARS!** ⭐ x8" };
      return { multiplier: 4, label: "**Three of a kind!** 🎉 x4" };
    }
    if (a === b || b === c || a === c) return { multiplier: 1.5, label: "Two of a kind! ✨ x1.5" };
    return { multiplier: 0, label: "and won nothing... :c" };
  }

  const { multiplier, label } = calcWin(s1, s2, s3);
  const winAmount = Math.round(bet * multiplier);
  const diff = winAmount - bet;

  let newBal: number;
  if (multiplier === 0) { newBal = await takeCoins(m.author.id, bet); }
  else if (diff > 0) { newBal = await addCoins(m.author.id, diff); }
  else { newBal = bal.coins; }

  const resultLine = multiplier > 0
    ? `${label} **${COIN} +${diff.toLocaleString("en-US")} vivincy** | Total: ${newBal.toLocaleString("en-US")}`
    : `${label} **${COIN} -${bet.toLocaleString("en-US")} vivincy** | Total: ${newBal.toLocaleString("en-US")}`;

  await msg.edit(frame(s1, s2, s3, resultLine)).catch(() => null);
  const xpR = await addEconXp(m.author.id, multiplier > 0 ? 20 : 8).catch(() => null);
  if (xpR) await notifyEconLevelUp(m, xpR);
}

async function pfxRulet(m: Message, args: string[]): Promise<void> {
  const secim = args[0]?.toLowerCase().trim();
  const bet = parseInt(args[1] ?? "0");
  if (!secim || isNaN(bet) || bet < 10) { await m.reply("❌ Kullanım: `rulet <kirmizi|siyah|yesil|0-36> <bahis>`"); return; }
  const bal = await getBalance(m.author.id);
  if (bal.coins < bet) { await m.reply(`❌ Yetersiz bakiye: **${COIN} ${bal.coins.toLocaleString("en-US")} vivincy**`); return; }

  const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
  const luck = await getLuck(m.author.id);

  const isNumber = /^\d+$/.test(secim) && Number(secim) >= 0 && Number(secim) <= 36;
  const validColors = ["kirmizi", "kırmızı", "siyah", "yesil", "yeşil"];
  if (!validColors.includes(secim) && !isNumber) { await m.reply("❌ Geçersiz seçim. `kirmizi`, `siyah`, `yesil` veya `0-36`"); return; }

  // Şanslıyken rulet sayısını hafif yönlendir
  let result = Math.floor(Math.random() * 37);
  if (luck > 0 && isNumber && Math.random() < 0.08) result = Number(secim); // %8 direkt isabet
  if (luck > 0 && !isNumber && Math.random() < 0.10) {
    // %10 ihtimalle seçilen renge düşür
    if (secim.startsWith("kır") || secim === "kirmizi") {
      result = [...RED][Math.floor(Math.random() * RED.size)]!;
    } else if (secim === "siyah") {
      const blacks = Array.from({ length: 36 }, (_, i) => i + 1).filter((n) => !RED.has(n));
      result = blacks[Math.floor(Math.random() * blacks.length)]!;
    }
  }

  const resultColor = result === 0 ? "green" : RED.has(result) ? "red" : "black";
  const colorEmoji = resultColor === "red" ? "🔴" : resultColor === "black" ? "⚫" : "🟢";

  let win = false; let multiplier = 0;
  if (isNumber) { win = result === Number(secim); multiplier = 36; }
  else if (secim.startsWith("kır") || secim === "kirmizi") { win = resultColor === "red"; multiplier = 2; }
  else if (secim === "siyah") { win = resultColor === "black"; multiplier = 2; }
  else { win = resultColor === "green"; multiplier = 35; }

  let newBal: number; let diffText: string;
  if (win) { const profit = bet * multiplier - bet; newBal = await addCoins(m.author.id, profit); diffText = `+${profit.toLocaleString("en-US")}`; }
  else { newBal = await takeCoins(m.author.id, bet); diffText = `-${bet.toLocaleString("en-US")}`; }

  const luckStr = luck > 0 ? " 🍀" : "";
  await m.reply(
    `🎡 **Rulet**${luckStr}\nTop düştü: **${colorEmoji} ${result}** | Seçimin: **${secim}**\n\n` +
    `${win ? "🏆 **KAZANDIN!**" : "💸 **Kaybettin!**"}\n` +
    `Bahis: **${COIN} ${bet.toLocaleString("en-US")} vivincy** | ${win ? "Kazanç" : "Kayıp"}: **${COIN} ${diffText} vivincy** | Çarpan: x${multiplier}\n` +
    `Yeni bakiye: **${COIN} ${newBal.toLocaleString("en-US")} vivincy**`
  );
  const xpR = await addEconXp(m.author.id, win ? 15 : 5).catch(() => null);
  if (xpR) await notifyEconLevelUp(m, xpR);
}

async function pfxCoinflip(m: Message, args: string[]): Promise<void> {
  const choice = args[0]?.toLowerCase();
  const bet = parseInt(args[1] ?? "0");

  const pickedTas  = !!choice && ["taş", "tas", "t"].some((x) => choice === x || choice.startsWith(x));
  const pickedYazi = !!choice && ["yazı", "yazi", "yaz", "y"].some((x) => choice === x || choice.startsWith(x));

  if (!pickedTas && !pickedYazi || isNaN(bet) || bet < 10) {
    await m.reply("❌ Kullanım: `coinflip <taş/yazı> <bahis>` (min 10)"); return;
  }
  const bal = await getBalance(m.author.id);
  if (bal.coins < bet) { await m.reply(`❌ Yetersiz bakiye: **${COIN} ${bal.coins.toLocaleString("en-US")} vivincy**`); return; }

  const luck = await getLuck(m.author.id);

  // Madeni para atılıyor — şans aktifse %57 ihtimalle oyuncunun seçimine düşer
  let coinResult: "taş" | "yazı";
  if (luck > 0) {
    const favoursPlayer = luckRoll(luck) < 0.57;
    coinResult = favoursPlayer
      ? (pickedTas ? "taş" : "yazı")
      : (pickedTas ? "yazı" : "taş");
  } else {
    coinResult = Math.random() < 0.5 ? "taş" : "yazı";
  }

  const win = (pickedTas && coinResult === "taş") || (pickedYazi && coinResult === "yazı");
  const resultDisplay = coinResult === "taş" ? "🪙 TAŞ" : "✍️ YAZI";
  const playerChoice  = pickedTas ? "Taş" : "Yazı";
  const luckStr = luck > 0 ? " 🍀" : "";

  if (win) {
    const newBal = await addCoins(m.author.id, bet);
    await m.reply(
      `${resultDisplay} ← Para düştü!\nSeçimin: **${playerChoice}**\n` +
      `✅ **KAZANDIN!${luckStr} ${COIN} +${bet.toLocaleString("en-US")} vivincy** | Bakiye: **${COIN} ${newBal.toLocaleString("en-US")} vivincy**`
    );
  } else {
    const newBal = await takeCoins(m.author.id, bet);
    await m.reply(
      `${resultDisplay} ← Para düştü!\nSeçimin: **${playerChoice}**\n` +
      `💸 **Kaybettin!${luckStr} ${COIN} -${bet.toLocaleString("en-US")} vivincy** | Bakiye: **${COIN} ${newBal.toLocaleString("en-US")} vivincy**`
    );
  }
  const xpR = await addEconXp(m.author.id, win ? 15 : 5).catch(() => null);
  if (xpR) await notifyEconLevelUp(m, xpR);
}

async function pfxBlackjack(m: Message, args: string[]): Promise<void> {
  const bet = parseInt(args[0] ?? "0");
  if (isNaN(bet) || bet < 10) { await m.reply("❌ Kullanım: `blackjack <bahis>` (min 10)"); return; }
  const bal = await getBalance(m.author.id);
  if (bal.coins < bet) { await m.reply(`❌ Yetersiz bakiye: **${COIN} ${bal.coins.toLocaleString("en-US")} vivincy**`); return; }

  const luck = await getLuck(m.author.id);
  const deck = createDeck();
  const playerHand: Card[] = [drawCard(deck), drawCard(deck)];
  const dealerHand: Card[] = [drawCard(deck), drawCard(deck)];

  const showHands = (hideDealer = true) =>
    `🃏 **Senin elin:** ${playerHand.join(" ")} = **${handValue(playerHand)}**\n` +
    `🎰 **Krupiye:** ${hideDealer ? `${dealerHand[0]} 🂠` : dealerHand.join(" ")} = **${hideDealer ? cardVal(dealerHand[0]!) : handValue(dealerHand)}**`;

  // Blackjack instant win check
  if (handValue(playerHand) === 21) {
    const newBal = await addCoins(m.author.id, Math.round(bet * 1.5));
    await m.reply(`${showHands(false)}\n\n🃏 **BLACKJACK! ${COIN} +${Math.round(bet * 1.5).toLocaleString("en-US")} vivincy** | Bakiye: **${COIN} ${newBal.toLocaleString("en-US")} vivincy**`);
    const xpR = await addEconXp(m.author.id, 25).catch(() => null);
    if (xpR) await notifyEconLevelUp(m, xpR);
    return;
  }

  const msg = await m.reply(`🃏 **Blackjack** (Bahis: **${COIN} ${bet.toLocaleString("en-US")} vivincy**)\n${showHands()}`);

  // ── Çok turlu hit/stand döngüsü ─────────────────────────────────────────
  let playerBusted = false;

  while (handValue(playerHand) < 21) {
    // Her tur için yeni prompt mesajı gönder (eski reaksiyon sorununu önler)
    await msg.edit(`🃏 **Blackjack** (Bahis: **${COIN} ${bet.toLocaleString("en-US")} vivincy**)\n${showHands()}`).catch(() => null);
    const promptMsg = await sendMessageChannel(m, `${m.author} → ✅ **Kart al** | ❌ **Dur** *(15 sn)*`);
    if (!promptMsg) {
      await m.reply("❌ Bu kanala mesaj gönderilemiyor.");
      return;
    }
    try { await promptMsg.react("✅"); await promptMsg.react("❌"); } catch { /**/ }

    let hit = false;
    try {
      const col = await promptMsg.awaitReactions({
        filter: (r, u) => ["✅", "❌"].includes(r.emoji.name ?? "") && u.id === m.author.id,
        max: 1, time: 15_000, errors: ["time"],
      });
      hit = col.first()?.emoji.name === "✅";
    } catch { /* timeout = dur */ }
    await promptMsg.delete().catch(() => null);

    if (!hit) break; // Dur seçildi veya süre doldu

    playerHand.push(drawCard(deck));

    if (handValue(playerHand) > 21) {
      playerBusted = true;
      break;
    }
  }

  if (playerBusted) {
    const newBal = await takeCoins(m.author.id, bet);
    await msg.edit(`${showHands(false)}\n\n💥 **Battın! ${COIN} -${bet.toLocaleString("en-US")} vivincy** | Bakiye: **${COIN} ${newBal.toLocaleString("en-US")} vivincy**`);
    const xpR = await addEconXp(m.author.id, 8).catch(() => null);
    if (xpR) await notifyEconLevelUp(m, xpR);
    return;
  }

  // ── Krupiye oynuyor ──────────────────────────────────────────────────────
  while (handValue(dealerHand) < 17) dealerHand.push(drawCard(deck));

  const pv = handValue(playerHand);
  const dv = handValue(dealerHand);
  const luckSave = luck > 0 && dv <= 21 && pv < dv && Math.random() < 0.12;

  let result: string; let newBal: number;
  if (dv > 21 || luckSave || pv > dv)  { newBal = await addCoins(m.author.id, bet);  result = `🏆 Kazandın! ${COIN} +${bet.toLocaleString("en-US")} vivincy${luckSave ? " 🍀 Şans!" : ""}`; }
  else if (pv === dv)                   { newBal = bal.coins;                          result = "🤝 Berabere!"; }
  else                                  { newBal = await takeCoins(m.author.id, bet); result = `💸 Kaybettin! ${COIN} -${bet.toLocaleString("en-US")} vivincy`; }

  await msg.edit(`${showHands(false)}\n\n**${result}** | Bakiye: **${COIN} ${newBal.toLocaleString("en-US")} vivincy**`);
  const bjWon = dv > 21 || luckSave || pv > dv;
  const xpR = await addEconXp(m.author.id, bjWon ? 20 : 8).catch(() => null);
  if (xpR) await notifyEconLevelUp(m, xpR);
}

async function pfxDuel(m: Message, args: string[]): Promise<void> {
  const target = m.mentions.users.first();
  const bet = parseInt(args[1] ?? "0");
  if (!target || isNaN(bet) || bet < 10) { await m.reply("❌ Kullanım: `duel @kişi <bahis>`"); return; }
  if (target.id === m.author.id || target.bot) { await m.reply("❌ Geçersiz hedef."); return; }
  const balA = await getBalance(m.author.id);
  const balB = await getBalance(target.id);
  if (balA.coins < bet) { await m.reply(`❌ Yetersiz bakiye: **${COIN} ${balA.coins.toLocaleString("en-US")} vivincy**`); return; }
  if (balB.coins < bet) { await m.reply(`❌ **${target.displayName}** yetersiz bakiye.`); return; }

  const challenge = await m.reply(`⚔️ **${m.author.displayName}** vs **${target.displayName}** — Bahis: **${COIN} ${bet.toLocaleString("en-US")} vivincy**\n${target}, katılmak için ✅, reddetmek için ❌ ekle. (30 sn)`);
  try { await challenge.react("✅"); await challenge.react("❌"); } catch { /**/ }

  let accepted = false;
  try {
    const col = await challenge.awaitReactions({
      filter: (r, u) => ["✅", "❌"].includes(r.emoji.name ?? "") && u.id === target.id,
      max: 1, time: 30000, errors: ["time"],
    });
    accepted = col.first()?.emoji.name === "✅";
  } catch { /**/ }

  if (!accepted) { await challenge.edit(`⚔️ **${target.displayName}** meydan okumayı reddetti.`); return; }

  const luckA = await getLuck(m.author.id);
  const luckB = await getLuck(target.id);
  const winA = luckRoll(luckA) > luckRoll(luckB);

  const winner = winA ? m.author : target;
  const loser = winA ? target : m.author;
  await takeCoins(loser.id, bet);
  const newBal = await addCoins(winner.id, bet);

  await challenge.edit(
    `⚔️ **Düello Sonucu**\n\`\`\`\n🪙 Yazı-Tura\`\`\`\n` +
    `🏆 **${winner.displayName}** kazandı! **${COIN} +${bet.toLocaleString("en-US")} vivincy**${(winA ? luckA : luckB) > 0 ? " 🍀" : ""}\n` +
    `Kazanan yeni bakiye: **${COIN} ${newBal.toLocaleString("en-US")} vivincy**`
  );
  const [wXp, lXp] = await Promise.all([
    addEconXp(winner.id, 25).catch(() => null),
    addEconXp(loser.id, 10).catch(() => null),
  ]);
  // Notify level-ups: m.author = challenger, use their channel
  for (const [xpR, user] of [[wXp, winner], [lXp, loser]] as const) {
    if (xpR?.leveled) {
      const highest = xpR.newLevels[xpR.newLevels.length - 1]!;
      await sendMessageChannel(m,
        `🎉 **${(user as typeof winner).displayName}** reached **Economy Level ${highest}** — ${econRankTitle(highest)}!\n` +
        `${COIN} **+${xpR.totalReward.toLocaleString("en-US")} vivincy** reward added!`
      ).catch(() => null);
    }
  }
}

async function pfxPray(m: Message): Promise<void> {
  const result = await activatePray(m.author.id);
  if (!result.ok) {
    const min = Math.floor((result.remainSec ?? 0) / 60);
    const sec = (result.remainSec ?? 0) % 60;
    const timeStr = min > 0 ? `${min}dk ${sec}sn` : `${sec}sn`;
    await m.reply(`🙏 Dua henüz hazır değil. **${timeStr}** sonra tekrar dene.`);
    return;
  }
  await m.reply(
    `🙏 **${m.author.displayName}** dua etti!\n` +
    `🍀 **Şans 2 dakika boyunca artacak!**\n` +
    `Kumar, rulet, coinflip ve blackjack'te avantajlısın.\n` +
    `⏰ Komut tekrar kullanılabilir: **4 dakika sonra**`
  );
}

// OYUNLAR
async function pfxRps(m: Message, args: string[]): Promise<void> {
  const target = m.mentions.users.first();
  const bet = parseInt(args[1] ?? "0");
  if (!target) { await m.reply("❌ Kullanım: `rps @kişi [bahis]`"); return; }
  if (target.id === m.author.id || target.bot) { await m.reply("❌ Geçersiz hedef."); return; }

  const choices = ["🪨 Taş", "📄 Kağıt", "✂️ Makas"];
  const msg = await m.reply(
    `🎮 **Taş-Kağıt-Makas**\n` +
    `${m.author.displayName} vs ${target.displayName}${bet >= 10 ? ` — Bahis: **${COIN} ${bet.toLocaleString("en-US")} vivincy**` : ""}\n\n` +
    `Her ikisi de seçim yapın: 🪨 = Taş, 📄 = Kağıt, ✂️ = Makas (20 sn)`
  );
  try { await msg.react("🪨"); await msg.react("📄"); await msg.react("✂️"); } catch { /**/ }

  const getChoice = async (userId: string): Promise<number | null> => {
    try {
      const col = await msg.awaitReactions({
        filter: (r, u) => ["🪨", "📄", "✂️"].includes(r.emoji.name ?? "") && u.id === userId,
        max: 1, time: 20000, errors: ["time"],
      });
      return ["🪨", "📄", "✂️"].indexOf(col.first()?.emoji.name ?? "");
    } catch { return null; }
  };

  const [cA, cB] = await Promise.all([getChoice(m.author.id), getChoice(target.id)]);
  if (cA === null || cB === null) { await msg.edit("⏰ Süre doldu, oyun iptal."); return; }

  const wins = [[false, false, true], [true, false, false], [false, true, false]];
  const aWins = wins[cA]?.[cB] ?? false;
  const bWins = wins[cB]?.[cA] ?? false;

  let result: string;
  if (!aWins && !bWins) {
    result = `🤝 **Berabere!** İkisi de ${choices[cA]}`;
  } else {
    const winner = aWins ? m.author : target;
    const loser = aWins ? target : m.author;
    const wChoice = aWins ? choices[cA] : choices[cB];
    const lChoice = aWins ? choices[cB] : choices[cA];
    result = `🏆 **${winner.displayName}** kazandı! ${wChoice} > ${lChoice}`;

    if (bet >= 10) {
      const balLoser = await getBalance(loser.id);
      if (balLoser.coins >= bet) {
        await takeCoins(loser.id, bet);
        const newWin = await addCoins(winner.id, bet);
        result += `\n**${COIN} +${bet.toLocaleString("en-US")} vivincy** | Kazanan bakiye: **${COIN} ${newWin.toLocaleString("en-US")} vivincy**`;
      } else {
        result += "\n⚠️ Kaybeden yetersiz bakiye — para transferi yapılamadı.";
      }
    }
  }

  await msg.edit(`🎮 **TKM Sonucu**\n${m.author.displayName}: ${choices[cA]!} | ${target.displayName}: ${choices[cB]!}\n\n${result}`);

  // XP for both players
  const draw = !aWins && !bWins;
  const [xpA, xpB] = await Promise.all([
    addEconXp(m.author.id, aWins ? 15 : draw ? 5 : 5).catch(() => null),
    addEconXp(target.id,   aWins ? 5  : draw ? 5 : 15).catch(() => null),
  ]);
  for (const [xpR, user] of [[xpA, m.author], [xpB, target]] as const) {
    if (xpR?.leveled) {
      const highest = xpR.newLevels[xpR.newLevels.length - 1]!;
      await sendMessageChannel(m,
        `🎉 **${(user as typeof m.author).displayName}** reached **Economy Level ${highest}** — ${econRankTitle(highest)}!\n` +
        `${COIN} **+${xpR.totalReward.toLocaleString("en-US")} vivincy** reward added!`
      ).catch(() => null);
    }
  }
}

// EKONOMİ SEVİYE PROFİLİ
async function pfxEkono(m: Message): Promise<void> {
  const target = m.mentions.users.first() ?? m.author;
  await sendMessageTyping(m).catch(() => null);
  const bal = await getBalance(target.id);
  const xp = (bal as any).econXp as number ?? 0;
  const level = (bal as any).econLevel as number ?? 0;
  const luck = await getLuck(target.id);
  const rank = await getEconRank(target.id);

  const xpStart = xpAtLevel(level);
  const xpNeeded = xpForNextLevel(level);
  const xpProgress = xp - xpStart;
  const nextReward = econLevelReward(level + 1);

  try {
    const buf = await generateEconProfileCard({
      username: target.displayName,
      avatarUrl: target.displayAvatarURL({ extension: "png", size: 256 }),
      level,
      xpProgress,
      xpNeeded,
      coins: bal.coins,
      streak: bal.streak,
      rank,
      luckActive: luck > 0,
      nextReward,
      coinSymbol: COIN,
    });
    await m.reply({ files: [new AttachmentBuilder(buf, { name: "ekono.png" })] });
  } catch (err) {
    // Görsel üretme başarısız — metin fallback
    const title = econRankTitle(level);
    const pct = Math.min(100, Math.floor((xpProgress / xpNeeded) * 100));
    const bar = "█".repeat(Math.round(pct / 5)) + "░".repeat(20 - Math.round(pct / 5));
    await m.reply(
      `🏦 **${target.displayName}** · Ekonomi Profili\n` +
      `⭐ **Seviye ${level}** — ${title}\n` +
      `📊 XP: **${xpProgress.toLocaleString("tr-TR")} / ${xpNeeded.toLocaleString("tr-TR")}** *(${pct}%)*\n` +
      `\`[${bar}]\`\n` +
      `${COIN} Bakiye: **${bal.coins.toLocaleString("tr-TR")} vivincy**\n` +
      `🔥 Streak: **${bal.streak} gün** | 🏆 Sıra: **#${rank}**\n` +
      `🎁 Sonraki ödül: **${COIN} ${nextReward.toLocaleString("tr-TR")} vivincy**`
    );
  }
}

async function pfxEkonLider(m: Message): Promise<void> {
  const top = await getEconLeaderboard(10);
  if (!top.length) { await m.reply("❌ Henüz ekonomi verisi yok."); return; }
  await sendMessageTyping(m).catch(() => null);

  const entries: EconLeaderboardEntry[] = await Promise.all(top.map(async (row, i) => {
    let username = "Kullanıcı";
    let avatarUrl = "";
    try {
      const u = await m.client.users.fetch(row.userId);
      username = u.displayName;
      avatarUrl = u.displayAvatarURL({ extension: "png", size: 64 });
    } catch { /**/ }
    return {
      rank: i + 1,
      userId: row.userId,
      username,
      avatarUrl,
      econLevel: (row as any).econLevel as number ?? 0,
      econXp: (row as any).econXp as number ?? 0,
      coins: row.coins,
    };
  }));

  try {
    const buf = await generateEconLeaderboardCard(entries, COIN);
    await m.reply({ files: [new AttachmentBuilder(buf, { name: "ekonlider.png" })] });
  } catch {
    // Metin fallback
    let msg = `🏦 **Ekonomi Liderboard** — Top ${entries.length}\n`;
    for (const e of entries) {
      const medal = (["🥇", "🥈", "🥉"] as string[])[e.rank - 1] ?? `**${e.rank}.**`;
      msg += `${medal} **${e.username}** — Lv.**${e.econLevel}** ${econRankTitle(e.econLevel)} · ${e.econXp.toLocaleString("tr-TR")} XP\n`;
    }
    await m.reply(msg);
  }
}

// MINE OYUNU
async function pfxMine(m: Message, args: string[]): Promise<void> {
  if (!m.guildId) { await m.reply("❌ Bu komut sadece sunucularda çalışır."); return; }

  const bombs = parseInt(args[0] ?? "5");
  const bet = Math.max(0, parseInt(args[1] ?? "0"));

  if (isNaN(bombs) || bombs < 1 || bombs > 22) {
    await m.reply(
      "❌ **Kullanım:** `mine <bomba_sayısı> [bahis]`\n" +
      "Bomba sayısı: **1-22** arası (5×5 = 25 kare)\n" +
      "Örnek: `mine 5` · `mine 10 500`\n" +
      "Daha fazla bomba = daha yüksek ödül çarpanı! 💥"
    );
    return;
  }

  await startMineGame(m, bombs, bet, COIN);
}

async function pfxPatla(m: Message): Promise<void> {
  const target = m.mentions.users.first() ?? m.author;
  const arts = ["💥", "🔥", "💣", "🌋", "⚡"];
  const art = arts[Math.floor(Math.random() * arts.length)]!;
  await m.reply(`${art} **${target.displayName} PATLADI!** ${art}\n\`\`\`\n   *BOOM*\n  /||\\\n /||||\\ \n\`\`\``);
}

async function pfxZar(m: Message, args: string[]): Promise<void> {
  const count = Math.min(Math.max(parseInt(args[0] ?? "1") || 1, 1), 5);
  const results: number[] = [];
  for (let i = 0; i < count; i++) results.push(Math.ceil(Math.random() * 6));
  const faces = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣"];
  const display = results.map((r) => faces[r - 1]).join(" ");
  const total = results.reduce((a, b) => a + b, 0);
  await m.reply(`🎲 **${count} zar:** ${display}\nToplam: **${total}**`);
}

async function pfxTop8(m: Message, args: string[]): Promise<void> {
  if (!args.length) { await m.reply("❌ Kullanım: `8top <soru>`"); return; }
  const yanıtlar = [
    { text: "Kesinlikle evet! ✅", color: "🟢" }, { text: "Evet ✅", color: "🟢" },
    { text: "Büyük ihtimalle evet ✅", color: "🟢" }, { text: "Olabilir 🤔", color: "🟡" },
    { text: "Emin değilim 🤷", color: "🟡" }, { text: "Belki 🌀", color: "🟡" },
    { text: "Pek sanmıyorum ❌", color: "🔴" }, { text: "Hayır ❌", color: "🔴" },
    { text: "Kesinlikle hayır ❌", color: "🔴" }, { text: "Asla değil ❌", color: "🔴" },
    { text: "Sonraki soruya geç 🌀", color: "🟣" }, { text: "Şimdi değil ⏳", color: "🟣" },
    { text: "Cevap belirsiz 🔮", color: "🟣" }, { text: "Tekrar sor 🔄", color: "🟣" },
    { text: "Bu soruyu sormak tehlikeli 😈", color: "🟣" },
  ];
  const yanıt = yanıtlar[Math.floor(Math.random() * yanıtlar.length)]!;
  await m.reply(`🎱 **Sihirli 8 Top**\nSoru: *${args.join(" ")}*\n\n${yanıt.color} **${yanıt.text}**`);
}

// MÜZİK
async function pfxCal(m: Message, args: string[]): Promise<void> {
  if (!m.guild || !m.guildId) { await m.reply("❌ Bu komut sadece sunucularda çalışır."); return; }
  const voiceChannel = m.member?.voice.channel;
  if (!voiceChannel) { await m.reply("❌ Önce bir ses kanalına gir."); return; }
  if (!args.length) { await m.reply("❌ Kullanım: `çal <şarkı adı veya YouTube/SoundCloud URL>`"); return; }

  const query = args.join(" ");
  const statusMsg = await m.reply(`🔍 **Aranıyor:** \`${query}\`...`);

  const { track, position, error } = await addToQueue(m.guildId, voiceChannel, m.channel, query, m.author.displayName);

  if (error || !track) {
    await statusMsg.edit(`❌ ${error ?? "Bilinmeyen hata"}`);
    return;
  }

  // position === 1 → music.ts zaten "Çalınıyor" kartını gönderiyor
  // position > 1 → kuyruğa eklendi kartı burada göster
  if (position > 1) {
    try {
      const buf = await generateMusicCard(track, "queued", position);
      await statusMsg.delete().catch(() => null);
      await sendMessageChannel(m, {
        content: `➕ **Kuyruğa eklendi (#${position})**`,
        files: [new AttachmentBuilder(buf, { name: "queued.png" })],
      });
    } catch {
      await statusMsg.edit(`➕ **Kuyruğa eklendi (#${position}):** [${track.title}](${track.url}) — ${track.duration}`);
    }
  } else {
    // İlk şarkı: kart music.ts içinden gönderildi, sadece ara mesajı sil
    await statusMsg.delete().catch(() => null);
  }
}

async function pfxDur(m: Message): Promise<void> {
  if (!m.guildId) return;
  const state = pauseResume(m.guildId);
  if (state === "not_playing") { await m.reply("❌ Şu an çalan bir şey yok."); return; }
  await m.reply(state === "paused" ? "⏸️ **Duraklatıldı.**" : "▶️ **Devam ediliyor.**");
}

async function pfxAtla(m: Message): Promise<void> {
  if (!m.guildId) return;
  const skipped = skipTrack(m.guildId);
  if (!skipped) { await m.reply("❌ Atlayacak şarkı yok."); return; }
  await m.reply(`⏭️ **Atlandı:** ${skipped.title}`);
}

async function pfxKuyruk(m: Message): Promise<void> {
  if (!m.guildId) return;
  const queue = getQueue(m.guildId);
  if (!queue || queue.tracks.length === 0) { await m.reply("📭 Kuyruk boş."); return; }
  const srcEmoji = (s?: string) => s === "youtube" ? "🔴" : s === "soundcloud" ? "🟠" : "🎵";
  const list = queue.tracks.slice(0, 10).map((t, i) =>
    `${i === 0 ? "▶️" : `\`${i}.\``} ${srcEmoji(t.source)} **${t.title}** \`[${t.duration}]\` — *${t.requestedBy}*`
  ).join("\n");
  const more = queue.tracks.length > 10 ? `\n…ve **${queue.tracks.length - 10}** şarkı daha` : "";
  const { EmbedBuilder } = await import("discord.js");
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`🎵 Müzik Kuyruğu — ${queue.tracks.length} şarkı`)
    .setDescription(list + more)
    .setFooter({ text: "🔴 YouTube · 🟠 SoundCloud" });
  await m.reply({ embeds: [embed] });
}

async function pfxDurdur(m: Message): Promise<void> {
  if (!m.guildId) return;
  const stopped = stopAndLeave(m.guildId);
  await m.reply(stopped ? "⏹️ **Durduruldu ve kanaldan çıkıldı.**" : "❌ Bot şu an ses kanalında değil.");
}

async function pfxSarki(m: Message): Promise<void> {
  if (!m.guildId) return;
  const track = getNowPlaying(m.guildId);
  if (!track) { await m.reply("❌ Şu an çalan bir şarkı yok."); return; }
  try {
    const buf = await generateMusicCard(track, "playing");
    await m.reply({
      content: `🎵 **Şu an çalıyor**`,
      files: [new AttachmentBuilder(buf, { name: "nowplaying.png" })],
    });
  } catch {
    await m.reply(`🎵 **Şu an çalıyor:**\n**${track.title}**\n⏱️ ${track.duration} | 👤 ${track.requestedBy}`);
  }
}

// SUNUCU YÖNETİMİ
async function pfxSunucuKur(m: Message): Promise<void> {
  if (!m.guild || !m.member) return;
  const isAdmin = m.member.permissions.has("Administrator");
  if (!isOwner(m.author.id) && m.guild.ownerId !== m.author.id && !isAdmin) { await m.reply("❌ Sadece sunucu sahibi veya yöneticiler kullanabilir."); return; }
  const status = await m.reply("⏳ Kategori ve kanallar oluşturuluyor...");
  let created = 0;
  for (const catDef of SUNUCU_YAPISI) {
    const cat = await m.guild.channels.create({ name: catDef.name, type: ChannelType.GuildCategory }).catch(() => null);
    if (!cat) continue;
    created++;
    for (const ch of catDef.channels) {
      await m.guild.channels.create({ name: ch.name, type: ch.voice ? ChannelType.GuildVoice : ChannelType.GuildText, parent: cat.id }).catch(() => null);
      created++;
    }
  }
  await status.edit(`✅ Tamamlandı! **${created}** kategori/kanal oluşturuldu.`);
}

async function pfxSunucuKopyala(m: Message, args: string[]): Promise<void> {
  if (!m.guild || !m.member) return;
  const isAdmin = m.member.permissions.has("Administrator");
  if (!isOwner(m.author.id) && !isAdmin) { await m.reply("❌ **Administrator** iznin yok."); return; }
  const sourceId = args[0]?.trim();
  if (!sourceId) { await m.reply("❌ Kullanım: `sunucukopyala <sunucu-id>`"); return; }
  const sourceGuild = m.client.guilds.cache.get(sourceId);
  if (!sourceGuild) { await m.reply("❌ Bot bu sunucuda değil ya da ID hatalı."); return; }
  if (sourceGuild.id === m.guildId) { await m.reply("❌ Aynı sunucuyu kopyalayamazsın."); return; }

  const status = await m.reply("⏳ **[1/3]** Kategoriler kopyalanıyor...");
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const categoryMap = new Map<string, string>();
  let created = 0;

  const categories = [...sourceGuild.channels.cache.values()].filter((c) => c.type === ChannelType.GuildCategory).sort((a, b) => a.position - b.position);
  for (const cat of categories) {
    const newCat = await m.guild.channels.create({ name: cat.name, type: ChannelType.GuildCategory }).catch(() => null);
    if (newCat) { categoryMap.set(cat.id, newCat.id); created++; }
    await sleep(300);
  }

  await status.edit(`⏳ **[2/3]** Kanallar kopyalanıyor... (${created} tamamlandı)`);
  const channels = [...sourceGuild.channels.cache.values()]
    .filter((c) => c.type !== ChannelType.GuildCategory)
    .filter((c) => "position" in c)
    .sort((a, b) => Number("position" in a ? a.position : 0) - Number("position" in b ? b.position : 0));
  for (const ch of channels) {
    const parentId = "parentId" in ch && ch.parentId ? categoryMap.get(ch.parentId) : undefined;
    if (ch.type === ChannelType.GuildText) {
      await m.guild.channels.create({ name: ch.name, type: ChannelType.GuildText, parent: parentId }).catch(() => null);
      created++;
    } else if (ch.type === ChannelType.GuildVoice) {
      await m.guild.channels.create({ name: ch.name, type: ChannelType.GuildVoice, parent: parentId }).catch(() => null);
      created++;
    }
    await sleep(350);
  }

  await status.edit(`✅ **Kopyalama tamamlandı!** Kaynak: **${sourceGuild.name}** | Oluşturulan: **${created}** öğe`);
}

// ── ROL KOPYALA ───────────────────────────────────────────────────────────────
async function pfxRolKopya(m: Message, args: string[]): Promise<void> {
  if (!m.guild || !m.member) return;
  if (!isOwner(m.author.id) && !m.member.permissions.has("Administrator")) {
    await m.reply("❌ **Administrator** iznin yok."); return;
  }
  const sourceId = args[0]?.trim();
  if (!sourceId) {
    await m.reply("❌ Kullanım: `v!rolkopya <kaynak-sunucu-id>`\nBot o sunucuda da bulunmalıdır.");
    return;
  }
  const sourceGuild = m.client.guilds.cache.get(sourceId);
  if (!sourceGuild) { await m.reply("❌ Bot bu sunucuda değil ya da ID hatalı."); return; }
  if (sourceGuild.id === m.guildId) { await m.reply("❌ Aynı sunucudan kopyalayamazsın."); return; }

  const status = await m.reply("⏳ Roller kopyalanıyor...");
  const sleep  = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  // @everyone ve yönetilen (bot) rolleri hariç, pozisyona göre küçükten büyüğe
  const roles = [...sourceGuild.roles.cache.values()]
    .filter((r) => r.id !== sourceGuild.id && !r.managed)
    .sort((a, b) => a.position - b.position);

  const hasRoleIcons = m.guild.features.includes("ROLE_ICONS" as any);
  let created = 0, failed = 0;

  for (const role of roles) {
    try {
      let iconData: Buffer | string | undefined;

      // İkon kopyalama — yalnızca hedef sunucu Rol İkonu özelliğine sahipse
      if (hasRoleIcons && role.icon) {
        const iconUrl = role.iconURL({ size: 64 });
        if (iconUrl) {
          const res = await fetch(iconUrl).catch(() => null);
          if (res?.ok) {
            const buf = Buffer.from(await res.arrayBuffer());
            iconData = `data:image/png;base64,${buf.toString("base64")}`;
          }
        }
      }

      await m.guild.roles.create({
        name:         role.name,
        color:        role.color,
        hoist:        role.hoist,
        mentionable:  role.mentionable,
        permissions:  role.permissions,
        ...(iconData ? { icon: iconData } : {}),
        reason:       `v!rolkopya — Kaynak: ${sourceGuild.name}`,
      });
      created++;
    } catch { failed++; }
    await sleep(350); // Rate limit önlemi
  }

  await status.edit(
    `✅ **Rol kopyalama tamamlandı!**\n` +
    `📦 Kaynak: **${sourceGuild.name}** | ` +
    `✅ Oluşturulan: **${created}** | ` +
    `❌ Başarısız: **${failed}**\n` +
    (hasRoleIcons ? "" : "ℹ️ Bu sunucunun Rol İkonu özelliği yok (Boost 2 gerekir) — ikonlar kopyalanmadı.")
  );
}

// ── SUNUCU AÇIKLAMASI DÜZENLE ─────────────────────────────────────────────────
async function pfxSunucuAciklama(m: Message, args: string[]): Promise<void> {
  if (!m.guild || !m.member) return;
  if (!isOwner(m.author.id) && m.guild.ownerId !== m.author.id && !m.member.permissions.has("ManageGuild")) {
    await m.reply("❌ **Manage Server** iznin yok."); return;
  }
  if (!m.guild.features.includes("COMMUNITY" as any)) {
    await m.reply("❌ Bu komut yalnızca **Topluluk** sunucularında çalışır."); return;
  }

  const sub = args[0]?.toLowerCase();

  // Kaldır
  if (sub === "kaldir" || sub === "kaldır" || sub === "sil") {
    await m.guild.edit({ description: null }).catch(() => null);
    await m.reply("✅ Sunucu açıklaması kaldırıldı.");
    return;
  }

  // Mevcut açıklamayı göster
  if (!sub || sub === "durum" || sub === "goster" || sub === "göster") {
    const desc = m.guild.description;
    await m.reply(desc
      ? `📝 **Mevcut Sunucu Açıklaması:**\n>>> ${desc}`
      : "📝 Sunucunun açıklaması yok.\n💡 Ayarlamak için: `v!sunucuaciklama <metin>`"
    );
    return;
  }

  // Yeni açıklama ayarla (tüm args birleştir)
  const newDesc = args.join(" ").trim();
  if (newDesc.length > 120) {
    await m.reply(`❌ Açıklama en fazla **120 karakter** olabilir. (${newDesc.length}/120)`); return;
  }

  try {
    await m.guild.edit({ description: newDesc });
    await m.reply(`✅ Sunucu açıklaması güncellendi:\n>>> ${newDesc}`);
  } catch (err) {
    await m.reply(`❌ Açıklama güncellenemedi: ${(err as Error).message}`);
  }
}

// ── OTOROL ────────────────────────────────────────────────────────────────────
async function pfxOtorol(m: Message, args: string[]): Promise<void> {
  if (!m.guild || !m.member || !m.guildId) return;
  if (!isOwner(m.author.id) && !m.member.permissions.has("ManageRoles")) {
    await m.reply("❌ **Manage Roles** iznin yok."); return;
  }

  const sub  = args[0]?.toLowerCase() ?? "";
  const gid  = m.guildId;

  // ── durum ──────────────────────────────────────────────────────────────────
  if (!sub || sub === "durum" || sub === "liste" || sub === "list") {
    const rows = await getAllAutoRoles(gid);
    if (rows.length === 0) {
      await m.reply(
        "📋 **Otorol Sistemi** — Henüz rol eklenmemiş.\n\n" +
        "**Kullanım:**\n" +
        "`v!otorol ekle @rol` — Tüm üyelere ver\n" +
        "`v!otorol ekle @rol insan` — Yalnızca insanlara ver\n" +
        "`v!otorol ekle @rol bot` — Yalnızca botlara ver\n" +
        "`v!otorol ekle @rol insan 7` — En az 7 günlük hesaplara ver\n" +
        "`v!otorol kaldir @rol` — Rolü otorol listesinden çıkar\n" +
        "`v!otorol durdur @rol` — Rolü geçici devre dışı bırak\n" +
        "`v!otorol baslat @rol` — Rolü yeniden etkinleştir\n" +
        "`v!otorol temizle` — Tüm otorolleri sil"
      );
      return;
    }

    const lines = rows.map((r) => {
      const role   = m.guild!.roles.cache.get(r.roleId);
      const name   = role ? `<@&${r.roleId}>` : `~~${r.roleId}~~ (silinmiş)`;
      const target = r.target === "human" ? "👤 İnsan" : r.target === "bot" ? "🤖 Bot" : "👥 Hepsi";
      const age    = r.minAccountAgeDays > 0 ? ` | min ${r.minAccountAgeDays} gün` : "";
      const status = r.enabled ? "🟢" : "🔴";
      return `${status} ${name} — ${target}${age}`;
    });
    await m.reply(`📋 **Otorol Listesi** (${rows.length} rol)\n${lines.join("\n")}`);
    return;
  }

  // ── ekle ──────────────────────────────────────────────────────────────────
  if (sub === "ekle" || sub === "add") {
    const role = m.mentions.roles.first();
    if (!role) { await m.reply("❌ Kullanım: `v!otorol ekle @rol [hepsi|insan|bot] [min-gün]`"); return; }
    if (role.managed) { await m.reply("❌ Bot yönetimindeki rolleri otorol olarak ekleyemezsin."); return; }
    if (role.position >= m.guild.members.me!.roles.highest.position) {
      await m.reply("❌ Bu rol botun en yüksek rolünden yukarıda, atayamam."); return;
    }

    const targetArg = args[2]?.toLowerCase() ?? "hepsi";
    const target: "all" | "human" | "bot" =
      targetArg === "insan" || targetArg === "human" ? "human" :
      targetArg === "bot"                            ? "bot"   : "all";

    const minDays = parseInt(args[3] ?? "0", 10);
    const minAccountAgeDays = isNaN(minDays) || minDays < 0 ? 0 : minDays;

    await addAutoRole(gid, role.id, target, minAccountAgeDays);

    const targetLabel = target === "human" ? "👤 Yalnızca insanlar" : target === "bot" ? "🤖 Yalnızca botlar" : "👥 Tüm üyeler";
    const ageLabel    = minAccountAgeDays > 0 ? ` | En az **${minAccountAgeDays}** günlük hesap` : "";
    await m.reply(`✅ <@&${role.id}> otorol listesine eklendi!\n${targetLabel}${ageLabel}`);
    return;
  }

  // ── kaldır ────────────────────────────────────────────────────────────────
  if (sub === "kaldir" || sub === "kaldır" || sub === "sil" || sub === "remove") {
    const role = m.mentions.roles.first();
    if (!role) { await m.reply("❌ Kullanım: `v!otorol kaldir @rol`"); return; }
    const removed = await removeAutoRole(gid, role.id);
    await m.reply(removed ? `✅ <@&${role.id}> otorol listesinden kaldırıldı.` : "❌ Bu rol zaten listede değil.");
    return;
  }

  // ── durdur ────────────────────────────────────────────────────────────────
  if (sub === "durdur" || sub === "devre" || sub === "disable") {
    const role = m.mentions.roles.first();
    if (!role) { await m.reply("❌ Kullanım: `v!otorol durdur @rol`"); return; }
    await toggleAutoRole(gid, role.id, false);
    await m.reply(`🔴 <@&${role.id}> geçici olarak devre dışı bırakıldı.`);
    return;
  }

  // ── başlat ────────────────────────────────────────────────────────────────
  if (sub === "baslat" || sub === "başlat" || sub === "enable" || sub === "aktif") {
    const role = m.mentions.roles.first();
    if (!role) { await m.reply("❌ Kullanım: `v!otorol baslat @rol`"); return; }
    await toggleAutoRole(gid, role.id, true);
    await m.reply(`🟢 <@&${role.id}> yeniden etkinleştirildi.`);
    return;
  }

  // ── temizle ───────────────────────────────────────────────────────────────
  if (sub === "temizle" || sub === "sifirla" || sub === "sıfırla" || sub === "clear") {
    await clearAutoRoles(gid);
    await m.reply("✅ Tüm otoroller temizlendi.");
    return;
  }

  await m.reply("❓ Bilinmeyen alt komut. `v!otorol` yazarak yardıma bakabilirsin.");
}

async function pfxUserinfo(m: Message): Promise<void> {
  if (!m.guild) return;
  const target = m.mentions.members?.first() ?? m.member;
  if (!target) return;
  const u = target.user;
  const roles = [...target.roles.cache.values()].filter((r) => r.id !== m.guildId).map((r) => `<@&${r.id}>`).join(", ") || "Yok";
  const joined = target.joinedAt ? `<t:${Math.floor(target.joinedAt.getTime() / 1000)}:R>` : "Bilinmiyor";
  const created = `<t:${Math.floor(u.createdAt.getTime() / 1000)}:R>`;
  await m.reply(
    `👤 **Kullanıcı Bilgisi: ${u.tag}**\n` +
    `🆔 ID: \`${u.id}\`\n` +
    `📅 Hesap oluşturuldu: ${created}\n` +
    `🚪 Sunucuya katıldı: ${joined}\n` +
    `🎭 Roller: ${roles}`
  );
}

async function pfxSetPrefix(m: Message, args: string[]): Promise<void> {
  if (!m.guildId || !m.member) return;
  if (!isOwner(m.author.id) && !m.member.permissions.has("ManageGuild")) { await m.reply("❌ **Manage Server** iznin yok."); return; }
  const np = args[0];
  if (!np || np.length > 5) { await m.reply("❌ Kullanım: `setprefix <yeni>` (maks 5 karakter)"); return; }
  const old = await getPrefix(m.guildId);
  await setPrefixUtil(m.guildId, np);
  await m.reply(`✅ Prefix **\`${old}\`** → **\`${np}\`** olarak değiştirildi.`);
}

async function pfxPing(m: Message): Promise<void> {
  const msg = await m.reply("🏓 Ölçülüyor...");
  const lat = msg.createdTimestamp - m.createdTimestamp;
  await msg.edit(`🏓 **Pong!** Round-trip: **${lat}ms** | API: **${Math.round(m.client.ws.ping)}ms**`);
}

function buildHelpButtons(): ActionRowBuilder<ButtonBuilder>[] {
  // Kategorileri 5'erli gruplara böl (Discord'un satır başına 5 buton limiti)
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < HELP_CATEGORIES.length; i += 5) {
    const chunk = HELP_CATEGORIES.slice(i, i + 5);
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        chunk.map((cat) =>
          new ButtonBuilder()
            .setCustomId(`help_cat_${cat.key}`)
            .setLabel(`${cat.icon} ${cat.label}`)
            .setStyle(ButtonStyle.Secondary)
        )
      )
    );
  }
  // Discord maksimum 5 satır — fazlasını kes
  return rows.slice(0, 5);
}

function buildHelpOverviewEmbed(prefix: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor("#5865f2")
    .setTitle("📖 VBRI Bot Komut Rehberi")
    .setDescription(
      `Toplam **${HELP_CATEGORIES.reduce((sum, cat) => sum + cat.commands.length, 0)} komut** bulunuyor.\n` +
      `Detayları görmek için aşağıdaki kategori butonlarından birine tıkla. Prefix: \`${prefix}\``
    )
    .addFields(HELP_CATEGORIES.map((cat) => ({
      name: `${cat.icon} ${cat.label} · ${cat.commands.length} komut`,
      value: cat.commands.slice(0, 5).map((cmd) => `\`${prefix}${cmd.name}\` — ${cmd.desc}`).join("\n") +
        (cat.commands.length > 5 ? `\n… ve ${cat.commands.length - 5} komut daha` : ""),
      inline: true,
    })))
    .setFooter({ text: "Bir kategori seçerek tüm komutları görüntüle" })
    .setTimestamp();
}

function buildHelpCategoryEmbed(prefix: string, catKey: string): EmbedBuilder | null {
  const cat = HELP_CATEGORIES.find(
    (item) => item.key === catKey || item.label.toLowerCase() === catKey.toLowerCase()
  );
  if (!cat) return null;

  const commandLines = cat.commands.map((cmd) => `\`${prefix}${cmd.name}\` — ${cmd.desc}`);
  const commandFields = [];
  for (let i = 0; i < commandLines.length; i += 8) {
    commandFields.push({
      name: i === 0 ? "Komutlar" : "Komutlar (devamı)",
      value: commandLines.slice(i, i + 8).join("\n"),
    });
  }

  return new EmbedBuilder()
    .setColor(cat.color as ColorResolvable)
    .setTitle(`${cat.icon} ${cat.label} Komutları`)
    .setDescription(`Bu kategoride **${cat.commands.length} komut** var. Prefix: \`${prefix}\``)
    .addFields(commandFields)
    .setFooter({ text: `Ana yardım menüsüne dönmek için butona tıkla • ${prefix}yardim` })
    .setTimestamp();
}

async function pfxYardim(m: Message, args: string[]): Promise<void> {
  const prefix = m.guildId ? await getPrefix(m.guildId).catch(() => "v!") : "v!";
  const catKey = args[0]?.toLowerCase();
  if (catKey) {
    const embed = buildHelpCategoryEmbed(prefix, catKey);
    if (!embed) {
       await m.reply(`❌ Kategori bulunamadı. Mevcut kategoriler: ${HELP_CATEGORIES.map((cat) => `\`${cat.key}\``).join(" ")}`);
      return;
    }
    // Kategori kartı + geri dön butonu
    const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("help_overview")
        .setLabel("◀ Tüm Kategoriler")
        .setStyle(ButtonStyle.Primary)
    );
    await m.reply({
      embeds: [embed],
      components: [backRow],
    });
  } else {
    await m.reply({
      embeds: [buildHelpOverviewEmbed(prefix)],
      components: buildHelpButtons(),
    });
  }
}

// ── GUARD ─────────────────────────────────────────────────────────────────────

const GUARD_MODULES = ["spam", "link", "bot", "emoji", "rol", "kanal"] as const;
type GuardModule = typeof GUARD_MODULES[number];

const EXTERNAL_APP_PERMISSIONS = [
  PermissionFlagsBits.UseExternalApps,
  PermissionFlagsBits.UseApplicationCommands,
];

function isGuildOwner(m: Message): boolean {
  return Boolean(m.guild && (m.author.id === m.guild.ownerId || isOwner(m.author.id)));
}

async function pfxLoglar(m: Message, args: string[]): Promise<void> {
  if (!m.guild || !m.guildId) return;
  if (!isGuildOwner(m)) {
    await m.reply("❌ Bu komutu yalnızca sunucu sahibi veya aktif bot admini kullanabilir.");
    return;
  }

  const sub = args[0]?.toLowerCase();
  if (!sub || ["durum", "status"].includes(sub)) {
    const status = await getLogStatus(m.guildId);
    const channel = (id: string | null) => id ? `<#${id}>` : "Ayarlanmamış";
    const embed = new EmbedBuilder()
      .setColor(status.enabled ? 0x57f287 : 0xed4245)
      .setTitle("📋 Sunucu Log Sistemi")
      .setDescription(status.enabled
        ? "Log sistemi açık. Bot, işlemleri aşağıdaki kanallara embed olarak gönderiyor."
        : "Log sistemi kapalı. Log kanalları silinmedi; tekrar açıldığında kullanılabilir.")
      .addFields(
        { name: "Durum", value: status.enabled ? "🟢 Açık" : "🔴 Kapalı", inline: true },
        { name: "Genel", value: channel(status.channels.general), inline: true },
        { name: "Ban", value: channel(status.channels.ban), inline: true },
        { name: "Mute / Timeout", value: channel(status.channels.mute), inline: true },
        { name: "Mesaj", value: channel(status.channels.message), inline: true },
        { name: "Silinen Mesaj", value: channel(status.channels.deletedMessage), inline: true },
        { name: "Koruma", value: channel(status.channels.protection), inline: true },
        { name: "Giriş / Çıkış", value: channel(status.channels.member), inline: true },
      )
      .setFooter({ text: "Açmak için: v!loglar aç • Kapatmak için: v!loglar kapat" })
      .setTimestamp();
    await m.reply({ embeds: [embed] });
    return;
  }

  if (["aç", "ac", "on", "enable"].includes(sub)) {
    try {
      const ids = await ensureAutoLogChannels(m.guild);
      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("✅ Log Sistemi Açıldı")
        .setDescription("Log kategorisi ve eksik kanallar bot tarafından oluşturuldu. Tüm kayıtlar embed olarak gönderilecek.")
        .addFields(
          { name: "Genel", value: `<#${ids.generalLogChannelId}>`, inline: true },
          { name: "Ban", value: `<#${ids.banLogChannelId}>`, inline: true },
          { name: "Mute", value: `<#${ids.muteLogChannelId}>`, inline: true },
          { name: "Mesaj", value: `<#${ids.messageLogChannelId}>`, inline: true },
          { name: "Silinen Mesaj", value: `<#${ids.deletedMessageLogChannelId}>`, inline: true },
          { name: "Koruma", value: `<#${ids.protectionLogChannelId}>`, inline: true },
          { name: "Giriş / Çıkış", value: `<#${ids.memberLogChannelId}>`, inline: true },
        )
        .setTimestamp();
      await m.reply({ embeds: [embed] });
    } catch (err) {
      logger.error({ err, guildId: m.guildId }, "Otomatik log kanalları oluşturulamadı");
      await m.reply("❌ Log kanalları oluşturulamadı. Botun **Manage Channels**, **View Channel**, **Send Messages** ve **Embed Links** izinlerini kontrol et.");
    }
    return;
  }

  if (["kapat", "off", "disable"].includes(sub)) {
    await disableAutoLogs(m.guildId);
    await m.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle("🔴 Log Sistemi Kapatıldı")
        .setDescription("Yeni log mesajları gönderilmeyecek. Oluşturulan log kanalları korunuyor.")
        .setTimestamp()],
    });
    return;
  }

  const activityRequested = ["kullanıcı", "kullanici", "user", "islem", "işlem", "aktivite", "audit"].includes(sub)
    || /^\d{15,20}$/.test(sub);
  if (activityRequested) {
    const userId = m.mentions.users.first()?.id
      ?? args.find((arg) => /^\d{15,20}$/.test(arg));
    if (!userId) {
      await m.reply("❌ Kullanım: `loglar kullanıcı <Discord ID>`");
      return;
    }
    await m.reply({ embeds: await buildUserActivityEmbeds(m, userId) });
    return;
  }

  await m.reply("❌ Kullanım: `loglar aç` | `loglar kapat` | `loglar durum` | `loglar kullanıcı <Discord ID>`");
}

async function pfxBotAdmin(m: Message, args: string[]): Promise<void> {
  if (!isBotOwner(m.author.id)) {
    await m.reply("❌ Bu komutu yalnızca bot sahibi kullanabilir.");
    return;
  }

  const sub = args[0]?.toLowerCase();
  if (!sub || ["durum", "status", "liste", "list"].includes(sub)) {
    const state = await getBotAdminState();
    const ids = state.adminIds.length
      ? state.adminIds.map((id, index) => `${index + 1}. <@${id}> — \`${id}\``).join("\n")
      : "Henüz bot admini eklenmemiş.";
    await m.reply({
      embeds: [new EmbedBuilder()
        .setColor(state.enabled ? 0x57f287 : 0xed4245)
        .setTitle("👑 Bot Admin Sistemi")
        .setDescription(`Durum: **${state.enabled ? "Açık" : "Kapalı"}**\n\n${ids}`)
        .setFooter({ text: "Bot adminler açıkken komut izinlerini atlar." })
        .setTimestamp()],
    });
    return;
  }

  if (["aç", "ac", "on", "enable"].includes(sub)) {
    await setBotAdminEnabled(true);
    await m.reply("✅ Bot admin sistemi açıldı. Listedeki kullanıcılar tüm komutları izinlerden bağımsız kullanabilir.");
    return;
  }
  if (["kapat", "off", "disable"].includes(sub)) {
    await setBotAdminEnabled(false);
    await m.reply("🔴 Bot admin sistemi kapatıldı. Listedeki ayrıcalıklar artık geçerli değil.");
    return;
  }

  if (["ekle", "add"].includes(sub) || ["çıkar", "cikar", "kaldır", "kaldir", "remove"].includes(sub)) {
    const userId = m.mentions.users.first()?.id
      ?? args.slice(1).find((arg) => /^\d{15,20}$/.test(arg));
    if (!userId) {
      await m.reply("❌ Kullanım: `botadmin ekle <Discord ID>` veya `botadmin çıkar <Discord ID>`");
      return;
    }
    const added = ["ekle", "add"].includes(sub)
      ? await addBotAdmin(userId)
      : await removeBotAdmin(userId);
    await m.reply(added
      ? `✅ \`${userId}\` bot admin listesinde güncellendi.`
      : `ℹ️ \`${userId}\` için değişiklik yapılmadı; kullanıcı zaten mevcut durumda.`);
    return;
  }

  await m.reply("❌ Kullanım: `botadmin aç/kapat` | `botadmin ekle <ID>` | `botadmin çıkar <ID>` | `botadmin liste`");
}

function protectionSetupRows(draft: ProtectionSetupDraft) {
  const button = (condition: "join" | "leave" | "channel" | "role", label: string, enabled: boolean) =>
    new ButtonBuilder()
      .setCustomId(`protection_setup_toggle:${draft.guildId}:${draft.userId}:${condition}`)
      .setLabel(`${enabled ? "✅" : "⬜"} ${label}`)
      .setStyle(enabled ? ButtonStyle.Success : ButtonStyle.Secondary);
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      button("join", "Toplu giriş", draft.joinEnabled),
      button("leave", "Toplu çıkış", draft.leaveEnabled),
      button("channel", "Kanal değişikliği", draft.channelEnabled),
      button("role", "Rol değişikliği", draft.roleEnabled),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`protection_setup_save:${draft.guildId}:${draft.userId}`)
        .setLabel("✅ Kurulumu Kaydet")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`protection_setup_cancel:${draft.guildId}:${draft.userId}`)
        .setLabel("İptal")
        .setStyle(ButtonStyle.Danger),
    ),
  ];
}

function setupNumber(args: string[], names: string[], fallback: number): number {
  for (const name of names) {
    const index = args.findIndex((arg) => arg.toLowerCase() === name);
    const value = index >= 0 ? Number(args[index + 1]) : NaN;
    if (Number.isInteger(value) && value > 0) return value;
  }
  return fallback;
}

async function pfxKoruma(m: Message, args: string[]): Promise<void> {
  if (!m.guild || !m.guildId) return;
  if (!isGuildOwner(m)) {
    await m.reply("❌ Sunucu korumasını yalnızca sunucu sahibi veya aktif bot admini yönetebilir.");
    return;
  }

  const sub = args[0]?.toLowerCase();
  const config = await getProtection(m.guildId);

  if (!sub || ["durum", "status"].includes(sub)) {
    const state = config.locked ? "🔒 Kilitli" : config.enabled ? "🟢 İzlemede" : "🔴 Kapalı";
    const on = (value: boolean) => value ? "Açık" : "Kapalı";
    await m.reply({
      embeds: [new EmbedBuilder()
        .setColor(config.locked ? 0xed4245 : config.enabled ? 0x57f287 : 0x72767d)
        .setTitle("🛡️ Sunucu Koruması")
        .setDescription(`Durum: **${state}**${config.lockReason ? `\nNeden: ${config.lockReason}` : ""}`)
        .addFields(
          { name: "Toplu giriş", value: `${on(config.joinEnabled)} — ${config.joinThreshold} kişi / ${config.windowSeconds} sn`, inline: true },
          { name: "Toplu çıkış", value: `${on(config.leaveEnabled)} — ${config.leaveThreshold} kişi / ${config.windowSeconds} sn`, inline: true },
          { name: "Kanal değişikliği", value: `${on(config.channelEnabled)} — ${config.changeThreshold} olay / ${config.windowSeconds} sn`, inline: true },
          { name: "Rol değişikliği", value: `${on(config.roleEnabled)} — ${config.changeThreshold} olay / ${config.windowSeconds} sn`, inline: true },
          { name: "Bilgi kanalı", value: config.infoChannelId ? `<#${config.infoChannelId}>` : "Kilitlenince oluşturulacak", inline: true },
        )
        .setFooter({ text: "Kurulum: v!koruma setup • Temizleme: v!koruma temizle" })
        .setTimestamp()],
    });
    return;
  }

  if (["setup", "kur", "kurulum"].includes(sub)) {
    const draft = createProtectionSetup(m.guildId, m.author.id, config);
    draft.joinThreshold = setupNumber(args, ["giriş", "giris", "join"], draft.joinThreshold);
    draft.leaveThreshold = setupNumber(args, ["çıkış", "cikis", "leave"], draft.leaveThreshold);
    draft.changeThreshold = setupNumber(args, ["değişiklik", "degisiklik", "change"], draft.changeThreshold);
    draft.windowSeconds = setupNumber(args, ["süre", "sure", "saniye", "window"], draft.windowSeconds);
    protectionSetupSessions.set(`${m.guildId}:${m.author.id}`, draft);
    await m.reply({ embeds: [protectionSetupEmbed(draft)], components: protectionSetupRows(draft) });
    return;
  }

  if (["aç", "ac", "on", "enable"].includes(sub)) {
    await setProtectionEnabled(m.guildId, true);
    await m.reply("✅ Sunucu koruması açıldı. Ayarları değiştirmek için `v!koruma setup` kullan.");
    return;
  }

  if (["kapat", "off", "disable"].includes(sub)) {
    if (config.locked) {
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`server_protection_disable:${m.guildId}:${m.author.id}`)
          .setLabel("Kilidi Kaldır ve Korumayı Kapat")
          .setStyle(ButtonStyle.Danger),
      );
      await m.reply({
        embeds: [new EmbedBuilder()
          .setColor(0xffc857)
          .setTitle("⚠️ Koruma Kapatma Onayı")
          .setDescription("Bu işlem kanalları ve kaydedilen rolleri geri yükleyerek korumayı kapatır. Onaylamak için butona bas.")],
        components: [row],
      });
    } else {
      await setProtectionEnabled(m.guildId, false);
      await m.reply("🔴 Sunucu koruması kapatıldı.");
    }
    return;
  }

  if (["temizle", "clear", "açık", "acik", "unlock", "kilitkaldır", "kilitkaldir"].includes(sub)) {
    if (!config.locked) {
      await m.reply("ℹ️ Sunucu şu anda kilitli değil.");
      return;
    }
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`server_protection_clear:${m.guildId}:${m.author.id}`)
        .setLabel("Korumayı Temizle ve Sunucuyu Aç")
        .setStyle(ButtonStyle.Success),
    );
    await m.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xffc857)
        .setTitle("⚠️ Sunucu Koruması Temizleme Onayı")
        .setDescription("Kayıtlı kanal izinleri ve kullanıcı rolleri geri yüklenecek. Devam etmek için butona bas.")],
      components: [row],
    });
    return;
  }

  if (["kilitle", "lock"].includes(sub)) {
    const locked = await lockServer(m.guild, "Sunucu sahibi tarafından manuel kilitleme");
    await m.reply(locked ? "🔒 Sunucu kilitlendi. Bilgilendirme kanalı oluşturuldu." : "ℹ️ Koruma zaten kilitli veya aktif değil.");
    return;
  }

  await m.reply("❌ Kullanım: `koruma setup` | `koruma durum` | `koruma aç/kapat` | `koruma temizle`");
}

async function setExternalAppProtection(m: Message, blocked: boolean): Promise<void> {
  if (!m.guild) return;
  const everyone = m.guild.roles.everyone;
  const permissions = blocked
    ? everyone.permissions.remove(EXTERNAL_APP_PERMISSIONS)
    : everyone.permissions.add(EXTERNAL_APP_PERMISSIONS);
  await everyone.setPermissions(permissions);
}

async function pfxEntegrasyon(m: Message, args: string[]): Promise<void> {
  await pfxGuard(m, ["entegrasyon", ...args]);
}

async function pfxGuard(m: Message, args: string[]): Promise<void> {
  if (!m.guild || !m.member || !m.guildId) return;

  const sub = args[0]?.toLowerCase();

  // v!guard → mevcut durumu detaylı embed olarak göster
  if (!sub || sub === "durum" || sub === "status") {
    const cfg = await getGuard(m.guildId);
    let wl: string[] = [];
    try { wl = JSON.parse(cfg.linkWhitelist); } catch { /**/ }
    const everyone = m.guild.roles.everyone;
    const status = (enabled: boolean) => enabled ? "🟢 Açık" : "🔴 Kapalı";
    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle(`🛡️ Guard Ayarları — ${m.guild.name}`)
      .setDescription(`Ayar değiştirme yetkisi yalnızca sunucu sahibinde: <@${m.guild.ownerId}>`)
      .addFields(
        { name: "💬 Spam Koruması", value: `${status(cfg.spamEnabled)}\nEşik: **${cfg.spamThreshold} mesaj / 5 sn**\nAksiyon: **${cfg.spamAction}**`, inline: true },
        { name: "🔗 Link Koruması", value: `${status(cfg.linkEnabled)}\nAksiyon: **${cfg.linkAction}**\nWhitelist: ${wl.length ? wl.map((d) => `\`${d}\``).join(", ") : "Yok"}`, inline: true },
        { name: "🤖 Bot Giriş Koruması", value: `${status(cfg.botEnabled)}\nAksiyon: **${cfg.botAction}**`, inline: true },
        { name: "😀 Emoji Limiti", value: `${status(cfg.emojiEnabled)}\nLimit: **${cfg.emojiMax} emoji**\nAksiyon: **${cfg.emojiAction}**`, inline: true },
        { name: "🎭 Rol Koruması", value: `${status(cfg.roleEnabled)}\n10 saniyede 5+ değişiklik alarmı`, inline: true },
        { name: "📢 Kanal Koruması", value: `${status(cfg.channelEnabled)}\n10 saniyede 4+ değişiklik alarmı`, inline: true },
        { name: "🔒 Dış Uygulamalar", value: `${everyone.permissions.has(PermissionFlagsBits.UseExternalApps) ? "🟢 Açık" : "🔴 Engelli"}\nSunucuda olmayan uygulamalar`, inline: true },
        { name: "⚡ Uygulama Komutları", value: `${everyone.permissions.has(PermissionFlagsBits.UseApplicationCommands) ? "🟢 Açık" : "🔴 Engelli"}\nSlash/uygulama komutları`, inline: true },
        { name: "📋 Guard Logu", value: cfg.logChannelId ? `<#${cfg.logChannelId}>` : "Ayarlanmamış", inline: true },
        { name: "🔨 Ban Logu", value: cfg.banLogChannelId ? `<#${cfg.banLogChannelId}>` : "Ayarlanmamış", inline: true },
        { name: "🔇 Mute Logu", value: cfg.muteLogChannelId ? `<#${cfg.muteLogChannelId}>` : "Ayarlanmamış", inline: true },
        { name: "💬 Mesaj Logu", value: cfg.messageLogChannelId ? `<#${cfg.messageLogChannelId}>` : "Ayarlanmamış", inline: true },
        { name: "🗑️ Silinen Mesaj Logu", value: cfg.deletedMessageLogChannelId ? `<#${cfg.deletedMessageLogChannelId}>` : "Ayarlanmamış", inline: true },
        { name: "🧾 Genel İşlem Logu", value: cfg.generalLogChannelId ? `<#${cfg.generalLogChannelId}>` : "Ayarlanmamış", inline: true },
        { name: "📋 Otomatik Log Sistemi", value: cfg.logsEnabled ? "🟢 Açık" : "🔴 Kapalı", inline: true },
      )
      .setFooter({ text: "Detaylı kullanım: v!guard yardım" })
      .setTimestamp();
    await m.reply({ embeds: [embed] });
    return;
  }

  if (!isGuildOwner(m)) {
    await m.reply("❌ Guard ayarlarını yalnızca sunucu sahibi (👑) değiştirebilir.");
    return;
  }

  if (sub === "yardım" || sub === "yardim" || sub === "help") {
    await m.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle("🛡️ Guard Komutları")
        .setDescription("Bu ayarları yalnızca sunucu sahibi değiştirebilir.")
        .addFields(
          { name: "Modül aç/kapat", value: "`guard spam aç/kapat eşik 5`\n`guard spam aç/kapat aksiyon warn`\n`guard link aç/kapat aksiyon delete`\n`guard bot aç/kapat aksiyon kick|ban`\n`guard emoji aç/kapat max 5 aksiyon delete`\n`guard rol aç/kapat`\n`guard kanal aç/kapat`" },
          { name: "Log kanalları", value: "`guard log #kanal` — eski Guard logu + genel log\n`guard log ban #kanal`\n`guard log mute #kanal`\n`guard log mesaj #kanal`\n`guard log silinen #kanal`\n`guard log genel #kanal`\nAyrıca: `guard banlog #kanal`, `guard mutelog #kanal`, `guard mesajlog #kanal`, `guard silinenlog #kanal`, `guard genellog #kanal`" },
          { name: "Otomatik log sistemi", value: "`loglar aç` — kategori ve kanalları otomatik oluşturur\n`loglar kapat` — mesaj gönderimini durdurur\n`loglar durum` — kanalları ve durumu gösterir\n`loglar kullanıcı <Discord ID>` — kullanıcının işlemlerini gösterir" },
          { name: "Link", value: "`guard link whitelist ekle example.com`\n`guard link whitelist kaldir example.com`" },
          { name: "Entegrasyon engeli", value: "`guard entegrasyon durum`\n`guard entegrasyon kapat`\n`guard entegrasyon aç`" },
        )
        .setFooter({ text: "Durumu görmek için: v!guard durum" })],
    });
    return;
  }

  if (sub === "entegrasyon" || sub === "uygulama" || sub === "apps") {
    const action = args[1]?.toLowerCase();
    const everyone = m.guild.roles.everyone;
    if (!action || action === "durum" || action === "status") {
      await m.reply({
        embeds: [new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("🔒 Dış Uygulama Koruması")
          .addFields(
            { name: "Sunucuda olmayan uygulamalar", value: everyone.permissions.has(PermissionFlagsBits.UseExternalApps) ? "🟢 Açık" : "🔴 Engelli", inline: true },
            { name: "Uygulama komutları", value: everyone.permissions.has(PermissionFlagsBits.UseApplicationCommands) ? "🟢 Açık" : "🔴 Engelli", inline: true },
          )
          .setFooter({ text: "Yalnızca sunucu sahibi değiştirebilir." })],
      });
      return;
    }
    if (["kapat", "engelle", "on"].includes(action)) {
      await setExternalAppProtection(m, true);
      await m.reply("✅ Guard dış uygulama koruması açıldı. Sunucuda olmayan uygulamalar ve uygulama komutları normal üyeler için engellendi.");
      return;
    }
    if (["aç", "ac", "izin", "off"].includes(action)) {
      await setExternalAppProtection(m, false);
      await m.reply("🟢 Guard dış uygulama koruması kapatıldı; uygulama izinleri geri açıldı.");
      return;
    }
    await m.reply("❌ Kullanım: `guard entegrasyon durum|kapat|aç`");
    return;
  }

  // v!guard log <tür> #kanal
  // Doğrudan kısa kullanımlar da desteklenir: banlog, mutelog, mesajlog,
  // silinenlog ve genellog.
  const logTargets: Record<string, { key: string; label: string }> = {
    ban: { key: "banLogChannelId", label: "ban" },
    banlog: { key: "banLogChannelId", label: "ban" },
    mute: { key: "muteLogChannelId", label: "mute" },
    mutelog: { key: "muteLogChannelId", label: "mute" },
    mesaj: { key: "messageLogChannelId", label: "mesaj" },
    mesajlog: { key: "messageLogChannelId", label: "mesaj" },
    message: { key: "messageLogChannelId", label: "mesaj" },
    silinen: { key: "deletedMessageLogChannelId", label: "silinen mesaj" },
    silinenlog: { key: "deletedMessageLogChannelId", label: "silinen mesaj" },
    silinenmesaj: { key: "deletedMessageLogChannelId", label: "silinen mesaj" },
    genel: { key: "generalLogChannelId", label: "genel" },
    genellog: { key: "generalLogChannelId", label: "genel" },
    general: { key: "generalLogChannelId", label: "genel" },
  };
  const normalizedSub = (sub ?? "").replace(/[-_]/g, "");
  const directLogTarget = logTargets[normalizedSub];
  if (sub === "log" || directLogTarget) {
    const requestedType = sub === "log"
      ? (args[1]?.toLowerCase().replace(/[-_]/g, "") ?? "")
      : normalizedSub;
    const target = sub === "log" && !logTargets[requestedType]
      ? null
      : (sub === "log" ? logTargets[requestedType] : directLogTarget);
    const channel = m.mentions.channels.first();
    const closeArg = sub === "log" ? args[2]?.toLowerCase() : args[1]?.toLowerCase();
    const isClose = ["kapat", "kaldir", "kaldır", "sil", "remove", "off"].includes(closeArg ?? "");

    // Eski kullanım korunur ve aynı kanalı genel işlem loguna da bağlar.
    if (sub === "log" && !target && channel) {
      await setGuard(m.guildId, { logChannelId: channel.id, generalLogChannelId: channel.id });
      await m.reply(`✅ Guard ve genel işlem logları <#${channel.id}> kanalına gönderilecek.`);
      return;
    }
    if (!target) {
      await m.reply("❌ Kullanım: `guard log ban|mute|mesaj|silinen|genel #kanal`");
      return;
    }
    if (isClose) {
      await setGuard(m.guildId, { [target.key]: null } as Parameters<typeof setGuard>[1]);
      await m.reply(`✅ **${target.label} logu** kapatıldı.`);
      return;
    }
    if (!channel || !channel.isTextBased()) {
      await m.reply(`❌ Kullanım: \`guard log ${target.label} #kanal\` veya kapatmak için \`guard log ${target.label} kapat\``);
      return;
    }
    await setGuard(m.guildId, { [target.key]: channel.id } as Parameters<typeof setGuard>[1]);
    await m.reply(`✅ **${target.label} logları** <#${channel.id}> kanalına gönderilecek.`);
    return;
  }

  // v!guard link whitelist ekle/kaldir <domain>
  if (sub === "link" && args[1]?.toLowerCase() === "whitelist") {
    const action = args[2]?.toLowerCase();
    const domain = args[3]?.toLowerCase();
    if (!action || !domain) { await m.reply("❌ Kullanım: `guard link whitelist ekle/kaldir <domain>`"); return; }
    const cfg = await getGuard(m.guildId);
    let wl: string[] = [];
    try { wl = JSON.parse(cfg.linkWhitelist); } catch { /**/ }
    if (action === "ekle") { if (!wl.includes(domain)) wl.push(domain); }
    else if (action === "kaldir") { wl = wl.filter(d => d !== domain); }
    await setGuard(m.guildId, { linkWhitelist: JSON.stringify(wl) });
    await m.reply(`✅ Link whitelist güncellendi: \`${wl.join(", ") || "(boş)"}\``); return;
  }

  // v!guard <modül> <aç/kapat> [seçenek] [değer]
  const modül = sub as GuardModule;
  if (!GUARD_MODULES.includes(modül)) {
    await m.reply(`❌ Geçersiz modül. Kullanılabilir: \`${GUARD_MODULES.join(", ")}\``); return;
  }
  const toggle = args[1]?.toLowerCase();
  if (!toggle || !["aç", "ac", "kapat"].includes(toggle)) {
    await m.reply(`❌ Kullanım: \`guard ${modül} aç/kapat\``); return;
  }
  const enabled = toggle === "aç" || toggle === "ac";
  const optKey = args[2]?.toLowerCase();
  const optVal = args[3]?.toLowerCase();

  const patch: Record<string, unknown> = {};

  if (modül === "spam") {
    patch.spamEnabled = enabled;
    if (optKey === "esik" || optKey === "threshold") {
      const v = parseInt(optVal ?? "5");
      if (!isNaN(v) && v >= 2) patch.spamThreshold = v;
    }
    if (optKey === "aksiyon") {
      if (["delete", "warn", "mute", "kick"].includes(optVal ?? "")) patch.spamAction = optVal;
    }
  } else if (modül === "link") {
    patch.linkEnabled = enabled;
    if (optKey === "aksiyon") {
      if (["delete", "warn", "kick"].includes(optVal ?? "")) patch.linkAction = optVal;
    }
  } else if (modül === "bot") {
    patch.botEnabled = enabled;
    if (optKey === "aksiyon") {
      if (["kick", "ban"].includes(optVal ?? "")) patch.botAction = optVal;
    }
  } else if (modül === "emoji") {
    patch.emojiEnabled = enabled;
    if (optKey === "max") {
      const v = parseInt(optVal ?? "5");
      if (!isNaN(v) && v >= 1) patch.emojiMax = v;
    }
    if (optKey === "aksiyon") {
      if (["delete", "warn"].includes(optVal ?? "")) patch.emojiAction = optVal;
    }
  } else if (modül === "rol") {
    patch.roleEnabled = enabled;
  } else if (modül === "kanal") {
    patch.channelEnabled = enabled;
  }

  await setGuard(m.guildId, patch as Parameters<typeof setGuard>[1]);
  const cfg = await getGuard(m.guildId);
  await m.reply(`${enabled ? "✅" : "🔴"} **${modül}** koruması ${enabled ? "açıldı" : "kapatıldı"}.\n\`guard durum\` ile tüm ayarları görebilirsin.`);
  void cfg; // lint
}

// ── STAT ──────────────────────────────────────────────────────────────────────

async function pfxStat(m: Message, args: string[]): Promise<void> {
  if (!m.guild || !m.member || !m.guildId) return;
  if (!isOwner(m.author.id) && !m.member.permissions.has("ManageChannels")) {
    await m.reply("❌ **Manage Channels** yetkisine ihtiyacın var."); return;
  }
  const sub = args[0]?.toLowerCase();

  // stat durum — mevcut sunucu istatistiklerini embed olarak göster
  if (!sub || sub === "durum" || sub === "status" || sub === "goster" || sub === "göster") {
    await m.guild.members.fetch().catch(() => null);
    const guild = m.guild;
    const total   = guild.memberCount;
    const bots    = guild.members.cache.filter(mem => mem.user.bot).size;
    const humans  = total - bots;
    const online  = guild.members.cache.filter(mem => !mem.user.bot && mem.presence?.status !== "offline" && mem.presence !== null).size;
    const chCount = guild.channels.cache.filter(c => c.type !== ChannelType.GuildCategory).size;
    const rlCount = guild.roles.cache.size - 1;
    const owner   = await guild.fetchOwner().catch(() => null);
    const createdAt = Math.floor(guild.createdTimestamp / 1000);
    const existing = await getStatChannels(m.guildId);

    const { EmbedBuilder, Colors } = await import("discord.js");
    const embed = new EmbedBuilder()
      .setTitle(`📊 ${guild.name} — Sunucu İstatistikleri`)
      .setThumbnail(guild.iconURL({ size: 256 }))
      .setColor(0x00e676 as any)
      .addFields(
        { name: "👥 Toplam Üye",    value: `**${total.toLocaleString("tr-TR")}**`,   inline: true },
        { name: "🧑 İnsan",          value: `**${humans.toLocaleString("tr-TR")}**`,  inline: true },
        { name: "🤖 Bot",            value: `**${bots.toLocaleString("tr-TR")}**`,    inline: true },
        { name: "🟢 Çevrimiçi",     value: `**${online.toLocaleString("tr-TR")}**`,   inline: true },
        { name: "📢 Kanal Sayısı",  value: `**${chCount.toLocaleString("tr-TR")}**`,  inline: true },
        { name: "🎭 Rol Sayısı",    value: `**${rlCount.toLocaleString("tr-TR")}**`,   inline: true },
        { name: "👑 Sunucu Sahibi", value: owner ? `${owner.user.tag}` : "Bilinmiyor", inline: true },
        { name: "📅 Oluşturulma",   value: `<t:${createdAt}:D>`, inline: true },
        { name: "🚀 Boost Seviyesi",value: `Tier ${guild.premiumTier} (${guild.premiumSubscriptionCount ?? 0} boost)`, inline: true },
        { name: "📡 Stat Kanalları",value: existing ? "✅ Kurulu — her 10 dk otomatik güncellenir" : "❌ Kurulmamış — `stat kur` ile kur", inline: false },
      )
      .setFooter({ text: `${m.author.tag} tarafından istendi` })
      .setTimestamp();

    await m.reply({ embeds: [embed] });
    return;
  }

  if (sub === "kaldir" || sub === "kaldır" || sub === "sil") {
    const existing = await getStatChannels(m.guildId);
    if (!existing) { await m.reply("❌ Bu sunucuda stat kanalları kurulu değil."); return; }
    await removeStatChannels(m.guildId);
    await m.reply("✅ Stat kanalları kaldırıldı. Kanalları Discord'dan manuel silebilirsin.");
    return;
  }

  if (sub === "guncelle" || sub === "güncelle") {
    const existing = await getStatChannels(m.guildId);
    if (!existing) { await m.reply("❌ Önce `stat kur` ile kanalları oluştur."); return; }
    await m.reply("⏳ Güncelleniyor...");
    await updateStatChannels(m.guild);
    await m.reply("✅ Stat kanalları güncellendi!");
    return;
  }

  if (sub === "kur") {
    const status = await m.reply("⏳ Stat kanalları oluşturuluyor...");
    try {
      await setupStatChannels(m.guild);
      await status.edit("✅ Stat kanalları hazır! Her 10 dakikada otomatik güncellenir.");
    } catch {
      await status.edit("❌ Kanallar oluşturulurken hata oluştu. Bot'un **Manage Channels** yetkisi olduğundan emin ol.");
    }
    return;
  }

  // Bilinmeyen alt komut → yardım
  await m.reply(
    "📡 **Stat Komutları:**\n" +
    "`stat` / `stat durum` — Sunucu istatistiklerini gösterir\n" +
    "`stat kur` — Ses kanallarında canlı stat paneli oluşturur\n" +
    "`stat güncelle` — Stat kanallarını manuel günceller\n" +
    "`stat kaldir` — Stat kanallarını siler"
  );
}

// ── ANONİM GENEL SOHBET ─────────────────────────────────────────────────────

async function pfxAnon(m: Message, args: string[]): Promise<void> {
  if (!m.guild || !m.guildId || !m.member) return;
  const sub = args[0]?.toLowerCase();
  if (sub === "sıralama" || sub === "siralama" || sub === "lider" || sub === "leaderboard" || sub === "puan") {
    const rows = await getAnonymousPointLeaderboard(10);
    const embed = new EmbedBuilder()
      .setColor(0xffc857)
      .setTitle("🕵️ Anonim Puan Sıralaması")
      .setDescription(rows.length
        ? rows.map((row, i) => `${i + 1}. **Anonim #${(row.anonymousId ?? "00000").padStart(5, "0").slice(-5)}** — ⭐ **${row.points} puan**`).join("\n")
        : "Henüz anonim mesaj gönderen yok.")
      .setFooter({ text: "Anonim özel kanalından gönderilen her mesaj 1 puan kazandırır." })
      .setTimestamp();
    await m.reply({ embeds: [embed] });
    return;
  }
  if (sub === "profil" || sub === "profile") {
    const account = await getOwnAnonymousProfile(m.guildId, m.author.id);
    // Profil komutu yalnızca kullanıcının özel anonim kanalında çalışır.
    if (!account || account.privateChannelId !== m.channelId) return;
    const embed = await getAnonymousProfileEmbed(m.guildId, m.author.id);
    if (embed) await m.reply({ embeds: [embed] });
    return;
  }
  if (sub === "id" || sub === "kimlik") {
    const account = await getOwnAnonymousProfile(m.guildId, m.author.id);
    if (!account || account.privateChannelId !== m.channelId) {
      await m.reply("❌ Bu komut yalnızca kendi anonim özel kanalında kullanılabilir.");
      return;
    }
    const requestedId = args[1];
    if (!requestedId) {
      await m.reply("Kullanım: `v!anon id <5-haneli-yeni-id>` — Değişiklik ücreti: **50 puan**.");
      return;
    }
    const result = await requestAnonymousIdChange(m.author.id, requestedId);
    if (!result.ok || !result.requestId) {
      await m.reply(`❌ ${result.message}`);
      return;
    }
    await m.reply({
      embeds: [new EmbedBuilder().setColor(0xffc857).setTitle("🕵️ Anonim ID Değişikliği")
        .setDescription(`Yeni kimliğin **Anonim #${requestedId}** olacak. Onaylarsan 50 puan harcanır.`)
        .setFooter({ text: "Onaylamak için aşağıdaki butona bas." })],
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`anon_id_approve:${result.requestId}:${m.author.id}`).setLabel("✅ Onayla (50 puan)").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`anon_id_deny:${result.requestId}:${m.author.id}`).setLabel("❌ Reddet").setStyle(ButtonStyle.Danger),
      )],
    });
    return;
  }
  if (sub === "foto" || sub === "avatar" || sub === "fotoğraf" || sub === "fotograf") {
    const account = await getOwnAnonymousProfile(m.guildId, m.author.id);
    if (!account || account.privateChannelId !== m.channelId) return;
    const attachment = m.attachments.find((file) => file.contentType?.startsWith("image/"));
    if (!attachment) {
      await m.reply("🖼️ Kullanım: `v!anon foto` komutuyla birlikte bir görsel eklemelisin.\nMaliyet: **100 puan**");
      return;
    }
    const result = await changeAnonymousAvatar(m.guild, m.author.id, attachment.url);
    await m.reply(result.message);
    return;
  }
  if (sub === "ayrıl" || sub === "ayril" || sub === "çık" || sub === "cik") {
    const result = await leaveAnonymousAccount(m.guild, m.author.id);
    await m.reply(result.message);
    return;
  }
  if (!m.member.permissions.has("ManageChannels") && !isOwner(m.author.id)) {
    await m.reply("❌ Bu komut için **Manage Channels** yetkisine ihtiyacın var.");
    return;
  }

  if (sub === "durum" || sub === "status") {
    await m.reply(await anonymousStatus(m.guild));
    return;
  }
  if (sub === "sıfırla" || sub === "sifirla" || sub === "reset") {
    const channel = m.mentions.channels.first();
    if (channel && channel.type !== ChannelType.GuildText) {
      await m.reply("❌ Sıfırlanacak kanal bir metin kanalı olmalı.");
      return;
    }
    try {
      const channelId = await resetAnonymousChannel(m.guild, channel?.id);
      await m.reply(`✅ Anonim genel sohbet sıfırlandı ve yeniden hazırlandı: <#${channelId}>\nEski webhook bağlantısı temizlendi. Şimdi mesajlar bu kanala düşmeli.`);
    } catch (err) {
      logger.error({ err }, "Anonim kanal sıfırlanamadı");
      await m.reply("❌ Kanal sıfırlanamadı. Kullanım: `v!anon sıfırla #genel`");
    }
    return;
  }
  if (sub === "kapat" || sub === "kapat") {
    await disableAnonymousChat(m.guildId);
    await m.reply("🔴 Anonim genel sohbet kapatıldı.");
    return;
  }
  if (sub === "aç" || sub === "ac" || sub === "aktif" || sub === "on") {
    const channel = m.mentions.channels.first();
    if (!channel || channel.type !== ChannelType.GuildText) {
      await m.reply("❌ Kullanım: `anon aç #anonim-genel`");
      return;
    }
    await setAnonymousChat(m.guildId, channel.id);
    await m.reply(`✅ Anonim genel sohbet açıldı: <#${channel.id}>\nMesajlar anonim profil üzerinden gönderilir ve orijinal mesajlar silinir.`);
    return;
  }

  if (sub === "kur") {
    const mentions = [...m.mentions.channels.values()].filter((c) => c.type === ChannelType.GuildText);
    const approval = mentions[0];
    const general = mentions[1];
    const category = mentions[2];
    if (!approval || !general) {
      await m.reply({
        embeds: [new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("🕵️ Anonim Sohbet Kurulumu")
          .setDescription("Kanal ve kategori seçicilerini kullanarak kurulumu tamamla. Bu panel yalnızca senin kullanımına açıktır.")
          .addFields(
            { name: "Gerekli seçimler", value: "1. Anonim genel sohbet kanalı\n2. Onay kanalı\n3. Özel kanallar için kategori" },
            { name: "Bot izinleri", value: "Kanal Yönet, Webhook Yönet, Mesajları Yönet ve Mesaj Gönder" },
          )],
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`anon_setup_start:${m.guildId}:${m.author.id}`).setLabel("Kanal Seçerek Kur").setStyle(ButtonStyle.Primary),
        )],
      });
      return;
    }
    try {
      await setupAnonymousApprovalPanel(m.guild, approval.id, general.id, category?.id);
      await m.reply(`✅ Anonim sistem hazır!\n• Onay: <#${approval.id}>\n• Genel sohbet: <#${general.id}>\n• Özel kanallar: ${category ? `<#${category.id}> kategorisinde` : "kategorisiz"}`);
    } catch (err) {
      logger.error({ err }, "Anonim sistem kurulamadı");
      await m.reply("❌ Sistem kurulamadı. Botun kanal oluşturma, mesaj yönetimi ve izinleri yönetme yetkilerini kontrol et.");
    }
    return;
  }

  // v!anon #kanal veya v!anon kur #kanal
  const channel = m.mentions.channels.first();
  if (channel && channel.type === ChannelType.GuildText) {
    await setAnonymousChat(m.guildId, channel.id);
    await m.reply(`✅ Anonim genel sohbet ayarlandı: <#${channel.id}>`);
    return;
  }
  await m.reply(
    "🕵️ **Anonim Sohbet Komutları:**\n" +
    "`anon kur #onay #genel [#kategori]` — onay paneli ve sistemi kurar\n" +
    "`anon aç #kanal` — anonim sohbeti açar\n" +
    "`anon durum` — mevcut kanalı gösterir\n" +
    "`anon sıfırla #kanal` — genel kanal webhook bağlantısını temizleyip yeniden kurar\n" +
    "`anon kapat` — anonim sohbeti kapatır\n" +
    "`anon sıralama` — anonim puan sıralamasını gösterir",
  );
}

async function pfxAnonPuanVer(m: Message, args: string[]): Promise<void> {
  if (!isOwner(m.author.id)) {
    await m.reply("❌ Bu komut yalnızca bot sahibine açıktır.");
    return;
  }
  const result = await grantAnonymousPoints(args[0]?.replace(/^#/, "") ?? "", Number(args[1]));
  await m.reply(result.message);
}

async function pfxSohbet(m: Message, args: string[]): Promise<void> {
  if (!m.guild) return;
  const action = args[0]?.toLowerCase();
  if (action === "durum" || action === "status") {
    const account = await getOwnAnonymousProfile(m.guild.id, m.author.id);
    if (!account || account.privateChannelId !== m.channelId) {
      await m.reply("❌ Bu komut yalnızca kendi anonim özel kanalında kullanılabilir.");
      return;
    }
    await m.reply("🟢 Anonim özel sohbet komutu aktif. Kapatmak için `v!özel kapat` yazabilirsin.");
    return;
  }
  if (action === "kapat" || action === "bitir" || action === "stop") {
    const account = await getOwnAnonymousProfile(m.guild.id, m.author.id);
    if (!account || account.privateChannelId !== m.channelId) {
      await m.reply("❌ Bu komut yalnızca kendi anonim özel kanalında kullanılabilir.");
      return;
    }
    await m.reply("⏳ Anonim özel sohbet kapatılıyor...");
    const closed = await closeAnonymousChannelConversation(m.guild, m.author.id);
    if (!closed) await sendMessageChannel(m, "ℹ️ Aktif bir anonim özel sohbetin yok.").catch(() => null);
    return;
  }
  const targetId = action === "et" || action === "baslat" || action === "başlat" ? args[1] : args[0];
  if (!targetId) {
    await m.reply("❌ Kullanım: `v!özel #ANONİM-ID`");
    return;
  }
  const result = await requestAnonymousConversation(m.guild, m.author.id, m.channelId, targetId);
  await m.reply({ content: `${result.ok ? "✅" : "❌"} ${result.message}` });
}

// ── ÇEKİLİŞ ──────────────────────────────────────────────────────────────────

async function pfxCekilis(m: Message, args: string[]): Promise<void> {
  if (!m.guildId || !m.guild) return;
  const sub = args[0]?.toLowerCase();

  // ── v!çekiliş başlat <süre> <ödül...> ────────────────────────────────────
  if (sub === "başlat" || sub === "baslat" || sub === "start") {
    if (!isOwner(m.author.id) && !m.member?.permissions.has("ManageGuild")) {
      await m.reply("❌ Çekiliş başlatmak için **Sunucuyu Yönet** yetkisine ihtiyacın var."); return;
    }
    const durationStr = args[1];
    if (!durationStr) { await m.reply("❌ Kullanım: `çekiliş başlat <süre> <ödül>`\nÖrn: `çekiliş başlat 1sa PlayStation 5`"); return; }
    const ms = parseDuration(durationStr);
    if (!ms || ms < 30_000 || ms > 30 * 24 * 60 * 60 * 1000) {
      await m.reply("❌ Geçersiz süre. Min: 30sn, Maks: 30g. Örn: `10m`, `1sa`, `2g`"); return;
    }
    const prize = args.slice(2).join(" ").trim();
    if (!prize) { await m.reply("❌ Ödül belirtmelisin. Örn: `çekiliş başlat 1sa PlayStation 5`"); return; }

    const endsAt = new Date(Date.now() + ms);
    const giveaway = await createGiveaway({ guildId: m.guildId, channelId: m.channelId, hostId: m.author.id, prize, endsAt });

    const buf = await generateGiveawayCard({ prize, hostName: m.author.displayName, participantCount: 0, endsAt, active: true });
    const sent = await sendMessageChannel(m, { files: [new AttachmentBuilder(buf, { name: "cekilis.png" })] });
    if (!sent) {
      await m.reply("❌ Bu kanala çekiliş mesajı gönderilemiyor.");
      return;
    }
    await setMessageId(giveaway.id, sent.id);

    // Güncellenen giveaway'i oluştur
    const updatedGw = { ...giveaway, messageId: sent.id };
    startGiveawayTimers(updatedGw, m.client, m.author.displayName);

    await m.reply(`✅ Çekiliş **#${giveaway.id}** başlatıldı! Katılmak için: \`çekiliş katıl\``);
    return;
  }

  // ── v!çekiliş katıl ───────────────────────────────────────────────────────
  if (sub === "katıl" || sub === "katil" || sub === "join") {
    const gw = await getChannelGiveaway(m.channelId);
    if (!gw) { await m.reply("❌ Bu kanalda aktif bir çekiliş yok."); return; }
    if (m.author.id === gw.hostId) { await m.reply("❌ Kendi çekilişine katılamazsın!"); return; }

    const result = await addParticipant(gw.id, m.author.id);
    if (!result.joined) {
      await m.reply(`⚠️ **${m.author.displayName}**, zaten bu çekilişe katıldın! (${result.count} katılımcı)`);
    } else {
      await m.reply(`🎉 **${m.author.displayName}** çekilişe katıldı! Toplam katılımcı: **${result.count}**`);
    }
    return;
  }

  // ── v!çekiliş bitir [ID] ──────────────────────────────────────────────────
  if (sub === "bitir" || sub === "end" || sub === "finish") {
    if (!isOwner(m.author.id) && !m.member?.permissions.has("ManageGuild")) {
      await m.reply("❌ Çekilişi bitirmek için **Sunucuyu Yönet** yetkisine ihtiyacın var."); return;
    }
    let gw = args[1] ? await getChannelGiveaway(m.channelId) : await getChannelGiveaway(m.channelId);
    if (!gw) { await m.reply("❌ Bu kanalda aktif bir çekiliş yok."); return; }

    await m.reply(`⏳ Çekiliş **#${gw.id}** sonlandırılıyor...`);
    const { winnerName } = await endGiveaway(gw.id, m.client);
    if (!winnerName) { await sendMessageChannel(m, `😔 Çekiliş bitti ama katılımcı yoktu.`); }
    return;
  }

  // ── v!çekiliş iptal [ID] ──────────────────────────────────────────────────
  if (sub === "iptal" || sub === "cancel") {
    if (!isOwner(m.author.id) && !m.member?.permissions.has("ManageGuild")) {
      await m.reply("❌ Çekilişi iptal etmek için **Sunucuyu Yönet** yetkisine ihtiyacın var."); return;
    }
    const gw = await getChannelGiveaway(m.channelId);
    if (!gw) { await m.reply("❌ Bu kanalda aktif bir çekiliş yok."); return; }

    await cancelGiveaway(gw.id);
    // Mesajı güncelle
    if (gw.messageId) {
      try {
        const msg = await m.channel.messages.fetch(gw.messageId);
        const participants = (() => {
          try {
            const parsed: unknown = JSON.parse(gw.participants);
            return Array.isArray(parsed)
              ? parsed.filter((value): value is string => typeof value === "string" && /^\d{15,22}$/.test(value))
              : [];
          } catch {
            return [];
          }
        })();
        const hostUser = await m.client.users.fetch(gw.hostId).catch(() => null);
        const buf = await generateGiveawayCard({
          prize: gw.prize, hostName: hostUser?.displayName ?? "?",
          participantCount: participants.length, endsAt: gw.endsAt, active: false,
        });
        await msg.edit({ files: [new AttachmentBuilder(buf, { name: "cekilis.png" })] });
      } catch { /**/ }
    }
    await m.reply(`❌ Çekiliş **#${gw.id}** (${gw.prize}) iptal edildi.`);
    return;
  }

  // ── v!çekiliş liste ───────────────────────────────────────────────────────
  if (sub === "liste" || sub === "list") {
    const list = await getActiveGiveaways(m.guildId);
    if (!list.length) { await m.reply("📋 Şu an bu sunucuda aktif çekiliş yok."); return; }
    const lines = list.map((gw) => {
      const participants = (() => {
        try {
          const parsed: unknown = JSON.parse(gw.participants);
          return Array.isArray(parsed)
            ? parsed.filter((value): value is string => typeof value === "string" && /^\d{15,22}$/.test(value))
            : [];
        } catch {
          return [];
        }
      })();
      const remaining = Math.max(0, Math.ceil((gw.endsAt.getTime() - Date.now()) / 1000));
      const h = Math.floor(remaining / 3600); const mn = Math.floor((remaining % 3600) / 60);
      const timeStr = remaining === 0 ? "Bitiyor" : (h > 0 ? `${h}sa ${mn}dk` : `${mn}dk`);
      return `**#${gw.id}** 🎁 **${gw.prize}** — ${participants.length} katılımcı — ${timeStr} kaldı`;
    });
    await m.reply(`🎁 **Aktif Çekilişler (${list.length}):**\n${lines.join("\n")}`);
    return;
  }

  // ── v!çekiliş tekrar <ID> ─────────────────────────────────────────────────
  if (sub === "tekrar" || sub === "reroll") {
    if (!isOwner(m.author.id) && !m.member?.permissions.has("ManageGuild")) {
      await m.reply("❌ Bu komutu kullanmak için **Sunucuyu Yönet** yetkisine ihtiyacın var."); return;
    }
    await m.reply("❌ Tekrar çekim için önce çekilişi bitir (`çekiliş bitir`) sonra tekrar yazabilirsin.");
    return;
  }

  // ── Yardım ───────────────────────────────────────────────────────────────
  await m.reply(
    "🎁 **Çekiliş Komutları:**\n" +
    "`çekiliş başlat <süre> <ödül>` — Yeni çekiliş başlat (30sn–30g)\n" +
    "`çekiliş katıl` — Bu kanaldaki çekilişe katıl\n" +
    "`çekiliş bitir` — Çekilişi şimdi bitir (Yönetici)\n" +
    "`çekiliş iptal` — Çekilişi iptal et (Yönetici)\n" +
    "`çekiliş liste` — Sunucudaki aktif çekilişleri listele\n\n" +
    "**Süre formatı:** `30sn`, `10m`, `1sa`, `2g`"
  );
}

// ── LEVEL TOGGLE ──────────────────────────────────────────────────────────────

async function pfxLevelToggle(m: Message, args: string[]): Promise<void> {
  if (!m.guildId || !m.member) return;
  if (!isOwner(m.author.id) && !m.member.permissions.has("Administrator")) {
    await m.reply("❌ Bu komutu kullanmak için **Administrator** yetkisine ihtiyacın var."); return;
  }

  const sub = args[0]?.toLowerCase();

  if (!sub || sub === "durum" || sub === "status") {
    const enabled = await getLevelEnabled(m.guildId);
    await m.reply(
      `⭐ **Level Sistemi Durumu:** ${enabled ? "🟢 Açık" : "🔴 Kapalı"}\n` +
      `Değiştirmek için: \`level aç\` veya \`level kapat\``
    );
    return;
  }

  if (sub === "aç" || sub === "ac" || sub === "on" || sub === "enable") {
    await setLevelEnabled(m.guildId, true);
    await m.reply("🟢 **Level sistemi açıldı!** Artık mesaj atıldıkça XP kazanılacak.");
    return;
  }

  if (sub === "kapat" || sub === "off" || sub === "disable") {
    await setLevelEnabled(m.guildId, false);
    await m.reply("🔴 **Level sistemi kapatıldı.** Artık XP kazanılmayacak.");
    return;
  }

  await m.reply("❌ Kullanım: `level aç` / `level kapat` / `level durum`");
}

// ── Prefix handler tablosu ────────────────────────────────────────────────────

const prefixHandlers: Record<string, PfxHandler> = {
  // Level / Profil / Toggle
  level: (m, a) => a[0] && ["aç","ac","kapat","off","on","enable","disable","durum","status"].includes(a[0].toLowerCase()) ? pfxLevelToggle(m, a) : pfxLevel(m),
  lvl: (m) => pfxLevel(m), rank: (m) => pfxLevel(m), xp: (m) => pfxLevel(m),
  profil: (m) => pfxLevel(m), profile: (m) => pfxLevel(m),
  levelsistemi: pfxLevelToggle, leveltoggle: pfxLevelToggle,
  // Leaderboard
  leaderboard: (m) => pfxLeaderboard(m), lb: (m) => pfxLeaderboard(m), top: (m) => pfxLeaderboard(m),
  // Level rol
  levelrol: pfxLevelRol,
  tagrol: pfxTagRol,
  etiketrol: pfxTagRol,
  // Sicil
  sicil: (m) => pfxSicil(m),
  loglar: pfxLoglar, logs: pfxLoglar, log: pfxLoglar,
  botadmin: pfxBotAdmin, "bot-admin": pfxBotAdmin,
  koruma: pfxKoruma, sunucukoruma: pfxKoruma, serverprotection: pfxKoruma,
  // Moderasyon
  ban: pfxBan,
  idban: pfxIdBan, banid: pfxIdBan,
  kick: pfxKick,
  rolover: pfxGiveRole, rolver: pfxGiveRole, giverole: pfxGiveRole,
  warn: pfxWarn,
  timeout: pfxTimeout, sustur: pfxTimeout,
  untimeout: pfxUntimeout, unsustur: pfxUntimeout,
  unban: pfxUnban, yasakkaldır: pfxUnban,
  uyarikaldir: pfxUyariKaldir,
  kilitle: (m) => pfxKilitle(m),
  ac: (m) => pfxAc(m), aç: (m) => pfxAc(m),
  temizle: pfxTemizle, clear: pfxTemizle,
  nuke: (m) => pfxNuke(m),
  // Ekonomi
  bakiye: (m) => pfxBakiye(m), balance: (m) => pfxBakiye(m),
  gunlukodul: (m) => pfxGunlukodul(m), daily: (m) => pfxGunlukodul(m),
  transfer: pfxTransfer,
  kumar: pfxKumar, slot: pfxKumar,
  rulet: pfxRulet, roulette: pfxRulet,
  coinflip: pfxCoinflip, cf: pfxCoinflip,
  blackjack: pfxBlackjack, bj: pfxBlackjack,
  duel: pfxDuel,
  pray: (m) => pfxPray(m), dua: (m) => pfxPray(m),
  // Ekonomi Seviye
  ekono: (m) => pfxEkono(m), ekonomi: (m) => pfxEkono(m), econlevel: (m) => pfxEkono(m), elevel: (m) => pfxEkono(m),
  ekonlider: (m) => pfxEkonLider(m), elb: (m) => pfxEkonLider(m), econlb: (m) => pfxEkonLider(m),
  // AI sohbet yönetimi
  aitemizle: async (m) => {
    clearChannelHistory(m.channelId);
    await m.reply("🧹 Bu kanalın AI sohbet geçmişi sıfırlandı!");
  },
  aigeçmiş: async (m) => {
    const size = getHistorySize(m.channelId);
    await m.reply(`🤖 Bu kanalda **${size}** mesaj geçmişi var.`);
  },

  // Bakım modu (sadece bot sahibi)
  bakım: async (m, args) => {
    if (!m.guildId) return;

    // Herkes listeyi görebilir
    const sub = args[0]?.toLowerCase();
    if (!sub || sub === "liste" || sub === "list") {
      await sendMessageTyping(m).catch(() => null);
      const entries = getMaintenanceList();
      let ownerName = "Bot Sahibi";
      try {
        const ownerId = getBotOwner();
        if (ownerId) {
          const u = await m.client.users.fetch(ownerId);
          ownerName = u.displayName;
        }
      } catch { /**/ }
      const buf = await generateMaintenanceCard({ entries, ownerName });
      await m.reply({ files: [new AttachmentBuilder(buf, { name: "bakim.png" })] });
      return;
    }

    // Geri kalan komutlar sadece bot sahibine açık
    if (!isOwner(m.author.id)) {
      await m.reply("❌ Bu komutu sadece **bot sahibi** kullanabilir.");
      return;
    }

    if (sub === "kaldır" || sub === "kaldir" || sub === "aç" || sub === "ac") {
      const cmd = args[1]?.toLowerCase();
      if (!cmd) { await m.reply("❌ Kullanım: `bakım kaldır <komut>`"); return; }
      const removed = removeMaintenance(cmd);
      await m.reply(removed
        ? `✅ **\`${cmd}\`** bakımdan çıkarıldı, tekrar kullanılabilir.`
        : `⚠️ **\`${cmd}\`** zaten bakımda değildi.`
      );
      return;
    }

    if (sub === "hepsini" || sub === "hepsi" || sub === "temizle") {
      clearAllMaintenance();
      await m.reply("✅ Tüm bakım modları kaldırıldı!");
      return;
    }

    // v!bakım <komut> [sebep...]
    const cmd = sub;
    const reason = args.slice(1).join(" ") || "Bakım çalışması yapılıyor";
    addMaintenance(cmd, reason);
    await m.reply(
      `🔧 **\`${cmd}\`** bakıma alındı!\n` +
      `📝 Sebep: *${reason}*\n` +
      `Kaldırmak için: \`bakım kaldır ${cmd}\``
    );
  },
  bakim: async (m, args) => {
    // Türkçe karakter olmadan alias
    const handler = prefixHandlers["bakım"];
    if (handler) await handler(m, args);
  },

  // Oyunlar
  rps: pfxRps, tkm: pfxRps,
  mine: pfxMine, minesweeper: pfxMine, mayin: pfxMine,
  patla: (m) => pfxPatla(m),
  zar: pfxZar, dice: pfxZar,
  "8top": pfxTop8, top8: pfxTop8,
  // Müzik
  çal: pfxCal, cal: pfxCal, play: pfxCal,
  dur: (m) => pfxDur(m), pause: (m) => pfxDur(m),
  atla: (m) => pfxAtla(m), skip: (m) => pfxAtla(m),
  kuyruk: (m) => pfxKuyruk(m), queue: (m) => pfxKuyruk(m),
  durdur: (m) => pfxDurdur(m), stop: (m) => pfxDurdur(m), leave: (m) => pfxDurdur(m),
  şarkı: (m) => pfxSarki(m), sarki: (m) => pfxSarki(m), np: (m) => pfxSarki(m), nowplaying: (m) => pfxSarki(m),
  // Yönetim
  setprefix: pfxSetPrefix, prefix: pfxSetPrefix,
  sunucukur: (m) => pfxSunucuKur(m),
  sunucukopyala: pfxSunucuKopyala, skopyala: pfxSunucuKopyala,
  // Rol kopyalama
  rolkopya: pfxRolKopya, rolkopyala: pfxRolKopya, copyroles: pfxRolKopya,
  // Sunucu açıklama düzenleme
  sunucuaciklama: (m, a) => pfxSunucuAciklama(m, a),
  sunucuaçıklama: (m, a) => pfxSunucuAciklama(m, a),
  guilddesc: (m, a) => pfxSunucuAciklama(m, a),
  // Otorol
  otorol: pfxOtorol, autorol: pfxOtorol, autorole: pfxOtorol,
  // Emoji ekle
  emojiekle: pfxEmojiEkle, emojiadd: pfxEmojiEkle, addEmoji: pfxEmojiEkle,
  // Ses kanalı
  seskanal: (m, a) => pfxSesKanal(m, a), seskanalac: (m, a) => pfxSesKanal(m, a), voicechannel: (m, a) => pfxSesKanal(m, a), vc: (m, a) => pfxSesKanal(m, a),
  userinfo: (m) => pfxUserinfo(m), kullanicibilgi: (m) => pfxUserinfo(m), uinfo: (m) => pfxUserinfo(m),
  ping: (m) => pfxPing(m),
  yardim: pfxYardim, yardım: pfxYardim, help: pfxYardim,
  // Çekiliş
  "çekiliş": pfxCekilis, cekilis: pfxCekilis, giveaway: pfxCekilis, cekilish: pfxCekilis,
  // Guard
  guard: pfxGuard,
  entegrasyon: pfxEntegrasyon, entegrasyonlar: pfxEntegrasyon, uygulamaengel: pfxEntegrasyon,
  // Moderasyon ayarları
  modsetup: pfxModSetup, modayar: pfxModSetup, moderasyon: pfxModSetup,
  // Stat
  stat: pfxStat, istatistik: pfxStat, stats: pfxStat,
  // Anonim sohbet
  anon: pfxAnon, anonim: pfxAnon,
  anonpuan: async (m) => pfxAnon(m, ["sıralama"]),
  anonsiralama: async (m) => pfxAnon(m, ["sıralama"]),
  anonpuanver: pfxAnonPuanVer,
  sohbet: pfxSohbet, anonsohbet: pfxSohbet, özel: pfxSohbet, ozel: pfxSohbet,
  anonprofil: async (m) => pfxAnon(m, ["profil"]),
  // Kanal oluşturma
  kanalac: pfxKanalAc, kanaloluştur: pfxKanalAc, kanalyap: pfxKanalAc, createchannel: pfxKanalAc,
  // Kanala mesaj gönder
  mesajat: pfxMesajAt, duyuru: pfxMesajAt, announce: pfxMesajAt, say: pfxMesajAt,
  // Başka sunucuya mesaj gönder (sadece bot sahibi)
  sunucumesaj: pfxSunucuMesaj, smesaj: pfxSunucuMesaj, crossmsg: pfxSunucuMesaj,
  // Uzak moderasyon (sadece bot sahibi)
  uzakmod: pfxUzakMod, remotemed: pfxUzakMod, rmod: pfxUzakMod,
  // ── Medya paylaşım (v!paylaş) ────────────────────────────────────────────────
  "paylaş": async (m) => { await sendMediaRequest(m); },
  paylas:   async (m) => { await sendMediaRequest(m); },
  paylash:  async (m) => { await sendMediaRequest(m); },
  // eski alias — geriye uyumluluk
  videoistek: async (m) => { await sendMediaRequest(m); },

  // ── Medya paylaşım kurulum (v!videosetup) ────────────────────────────────────
  videosetup: async (m, args) => {
    if (!m.guildId || !m.guild) return;
    if (m.author.id !== m.guild.ownerId && !isOwner(m.author.id)) {
      await m.reply("❌ Bu komutu yalnızca sunucu sahibi kullanabilir.");
      return;
    }

    const sub  = args[0]?.toLowerCase() ?? "";
    const gid  = m.guildId;

    // durum / yardım
    if (!sub || sub === "durum" || sub === "bilgi") {
      const s = await getVideoSettings(gid);
      const roleList = s.approvalRoles.length > 0
        ? s.approvalRoles.map((r) => `<@&${r}>`).join(", ")
        : "_Ayarlanmamış (sadece Yöneticiler)_";
      const storedInvite = await getInviteUrl(gid).catch(() => null);
      await m.reply(
        `📋 **Medya Paylaşım Kurulumu**\n` +
        `> Mod kanalı: ${s.moderationChannelId ? `<#${s.moderationChannelId}>` : "_Ayarlanmamış_"}\n` +
        `> Onay rolleri: ${roleList}\n` +
        `> Watermark URL: ${storedInvite ? `**${storedInvite}**` : "_Ayarlanmamış (watermark eklenmez)_"}\n\n` +
        `> Paylaşan adı: ${s.showSharerName ? "✅ Açık" : "❌ Kapalı"}\n\n` +
        `**Alt komutlar:**\n` +
        `\`v!videosetup #kanal\` — Mod kanalı ayarla\n` +
        `\`v!videosetup kaldir\` — Mod kanalını kaldır\n` +
        `\`v!videosetup onayrol @rol\` — Onay rolü ekle\n` +
        `\`v!videosetup onayrolkaldir @rol\` — Onay rolünü kaldır\n` +
        `\`v!videosetup davetlink discord.gg/xxx\` — Paylaşılan medyalara watermark olarak eklenecek URL'yi ayarla\n` +
        `\`v!videosetup davetlinkkaldır\` — Watermark URL'sini kaldır\n` +
        `\`v!videosetup paylaşanadı aç|kapat\` — Paylaşanın düz adını gösterir/gizler`
      );
      return;
    }

    if (sub === "paylaşanadı" || sub === "paylasanadi" || sub === "paylasan") {
      const value = args[1]?.toLowerCase();
      if (!["aç", "ac", "on", "kapat", "kapa", "off"].includes(value ?? "")) {
        await m.reply("❌ Kullanım: `v!videosetup paylaşanadı aç` veya `v!videosetup paylaşanadı kapat`");
        return;
      }
      const enabled = ["aç", "ac", "on"].includes(value!);
      await setShowSharerName(gid, enabled);
      await m.reply(
        enabled
          ? "✅ Paylaşan adı açıldı. Onaylanan medyalarda etiket kullanılmadan **KullanıcıAdı tarafından paylaşıldı** yazacak."
          : "✅ Paylaşan adı kapatıldı. Onaylanan medyalarda paylaşan adı gösterilmeyecek."
      );
      return;
    }

    // davetlink ayarla
    if (sub === "davetlink") {
      const rawUrl = args[1] ?? "";
      if (!rawUrl) {
        await m.reply("❌ Kullanım: `v!videosetup davetlink discord.gg/xxxxxx`");
        return;
      }
      // Hem "discord.gg/xxx" hem "https://discord.gg/xxx" formatlarını kabul et
      const normalized = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
      try {
        await setInviteUrl(gid, normalized);
      } catch (err) {
        await m.reply(`❌ ${err instanceof Error ? err.message : "Geçersiz watermark URL'si."}`);
        return;
      }
      await m.reply(
        `✅ Davet linki ayarlandı!\n` +
        `Bundan sonra onaylanan her video/fotoğrafın üstünde şu link görünecek:\n` +
        `**${normalized}**`
      );
      return;
    }

    // davetlinkkaldır
    if (sub === "davetlinkkaldır" || sub === "davetlinkkaldır" || sub === "davetlinkkaldir") {
      await setInviteUrl(gid, null);
      await m.reply("✅ Davet linki kaldırıldı. Artık otomatik oluşturulan link kullanılacak.");
      return;
    }

    // onayrol ekle
    if (sub === "onayrol") {
      const role = m.mentions.roles.first();
      if (!role) { await m.reply("❌ Kullanım: `v!videosetup onayrol @rol`"); return; }
      const updated = await addApprovalRole(gid, role.id);
      await m.reply(`✅ **@${role.name}** onay rollerine eklendi.\n📋 Güncel roller: ${updated.map((r) => `<@&${r}>`).join(", ")}`);
      return;
    }

    // onayrolkaldir
    if (sub === "onayrolkaldir" || sub === "onayrolkaldır") {
      const role = m.mentions.roles.first();
      if (!role) { await m.reply("❌ Kullanım: `v!videosetup onayrolkaldir @rol`"); return; }
      const updated = await removeApprovalRole(gid, role.id);
      await m.reply(
        `✅ **@${role.name}** onay rollerinden kaldırıldı.\n` +
        `📋 Güncel roller: ${updated.length > 0 ? updated.map((r) => `<@&${r}>`).join(", ") : "_Yok (sadece Yöneticiler)_"}`
      );
      return;
    }

    // kaldır
    if (sub === "kaldir" || sub === "kaldır") {
      await setVideoModerationChannel(gid, null);
      await m.reply("✅ Moderasyon kanalı kaldırıldı.");
      return;
    }

    // #kanal
    const ch = m.mentions.channels.first();
    if (!ch || !(ch instanceof TextChannel)) {
      await m.reply("❌ Kullanım: `v!videosetup #kanal`");
      return;
    }
    await setVideoModerationChannel(gid, ch.id);
    await m.reply(
      `✅ Moderasyon kanalı **#${ch.name}** olarak ayarlandı!\n` +
      `Üyeler \`v!paylaş #hedef-kanal açıklama\` komutuyla istek gönderebilir.\n` +
      `💡 Onay rolleri eklemek için: \`v!videosetup onayrol @rol\``
    );
  },

  // ── Kategori oluştur ──────────────────────────────────────────────────────────
  kategoriac:     pfxKategoriAc,
  kategorioluştur: pfxKategoriAc,
  kategoriyap:    pfxKategoriAc,
  kategoriolustur: pfxKategoriAc,
};

// ── Bot başlatma ──────────────────────────────────────────────────────────────

export async function startBot(): Promise<void> {
  const token    = process.env["DISCORD_TOKEN"];
  const clientId = process.env["DISCORD_CLIENT_ID"];
  if (!token)    { logger.warn("DISCORD_TOKEN eksik — bot başlamayacak."); return; }
  if (!clientId) { logger.warn("DISCORD_CLIENT_ID eksik — bot başlamayacak."); return; }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.GuildModeration,
      GatewayIntentBits.GuildPresences,
    ],
    // DM kanalları cache'de bulunmadığı için partial olarak alınmalı.
    partials: [Partials.Channel],
  });

  client.once(Events.ClientReady, async (c) => {
    await ensureGuardSchema().catch((err) => logger.error({ err }, "Guard veritabanı şeması hazırlanamadı"));
    await ensureBotAdminSchema()
      .then(() => refreshBotAdminCache())
      .catch((err) => logger.error({ err }, "Bot admin veritabanı şeması hazırlanamadı"));
    await ensureServerProtectionSchema().catch((err) => logger.error({ err }, "Sunucu koruması veritabanı şeması hazırlanamadı"));
    await ensureAnonymousSchema().catch((err) => logger.error({ err }, "Anonim veritabanı şeması hazırlanamadı"));
    logger.info({ tag: c.user.tag }, "Discord botu hazır!");

    // Bot sahibini belirle (application owner)
    try {
      const app = await c.application!.fetch();
      const owner = app.owner;
      if (owner && "id" in owner) {
        setBotOwner(owner.id);
        logger.info({ ownerId: owner.id }, "Bot sahibi belirlendi");
      }
    } catch (err) {
      logger.warn({ err }, "Bot sahibi belirlenemedi");
    }

    const invitePermissions = PermissionsBitField.resolve([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
      PermissionFlagsBits.AttachFiles,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.AddReactions,
      PermissionFlagsBits.ManageMessages,
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.ManageRoles,
      PermissionFlagsBits.ManageWebhooks,
      PermissionFlagsBits.ModerateMembers,
      PermissionFlagsBits.KickMembers,
      PermissionFlagsBits.BanMembers,
      PermissionFlagsBits.Connect,
      PermissionFlagsBits.Speak,
    ]).toString();
    const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=${invitePermissions}&scope=bot+applications.commands`;
    logger.info({ inviteUrl }, "Davet URL:");

    // ── Vivincy coin uygulama emojisi ────────────────────────────────────────
    try {
      const emojiName = "vivincy_coin";
      const existingEmojis = await c.application!.emojis.fetch();
      let emoji = existingEmojis.find((e) => e.name === emojiName);
      if (!emoji) {
        const assetPath = join(dirname(fileURLToPath(import.meta.url)), "../assets/vivincy_coin.png");
        const attachment = readFileSync(assetPath);
        const base64 = `data:image/png;base64,${attachment.toString("base64")}`;
        emoji = await c.application!.emojis.create({ name: emojiName, attachment: base64 });
        logger.info({ id: emoji.id }, "Vivincy coin emojisi oluşturuldu");
      } else {
        logger.info({ id: emoji.id }, "Vivincy coin emojisi mevcut");
      }
      COIN = `<:${emojiName}:${emoji.id}>`;
    } catch (err) {
      logger.warn({ err }, "Vivincy coin emojisi yüklenemedi, fallback kullanılıyor");
    }

    // ── Bot durumu rotasyonu ──────────────────────────────────────────────────
    const updateStatus = () => {
      const guildCount = c.guilds.cache.size;
      const memberCount = c.guilds.cache.reduce((a, g) => a + (g.memberCount ?? 0), 0);
      const statuses = [
        { name: `${guildCount} sunucuda hizmet`, type: 3 as const },
        { name: `${memberCount.toLocaleString("en-US")} kullanıcıya`, type: 3 as const },
        { name: "v!yardim", type: 2 as const },
        { name: "West & Bartu & Santana", type: 3 as const },
      ];
      const idx = Math.floor(Date.now() / 30_000) % statuses.length;
      const s = statuses[idx]!;
      c.user.setPresence({ status: "online", activities: [{ name: s.name, type: s.type }] });
    };

    updateStatus();
    setInterval(updateStatus, 30_000);

    // ── Müzik sistemi ön ısınma (ilk çal komutunu hızlandırır) ───────────────
    warmupMusic().catch(() => null);

    // ── Aktif çekilişleri yeniden başlat ─────────────────────────────────────
    resumeActiveGiveaways(c).catch(() => null);

    // ── Sunucu etiketi → rol senkronizasyonu ─────────────────────────────────
    for (const guild of c.guilds.cache.values()) {
      syncGuildTagRoles(guild).catch((err) =>
        logger.warn({ err, guildId: guild.id }, "Etiket rolleri başlangıçta senkronize edilemedi"),
      );
    }

  });

  client.on(Events.GuildCreate, async (guild) => {
    logger.info({ guildId: guild.id, guildName: guild.name }, "Yeni sunucuya katıldı");
  });

  // Kullanıcı sunucu etiketini etkinleştirdiğinde/kaldırdığında tetiklenir.
  client.on(Events.UserUpdate, async (oldUser, newUser) => {
    if (oldUser.primaryGuild?.tag === newUser.primaryGuild?.tag &&
        oldUser.primaryGuild?.identityEnabled === newUser.primaryGuild?.identityEnabled &&
        oldUser.primaryGuild?.identityGuildId === newUser.primaryGuild?.identityGuildId) {
      return;
    }

    for (const guild of client.guilds.cache.values()) {
      const member = guild.members.cache.get(newUser.id);
      if (member) await syncMemberTagRole(member).catch(() => null);
    }
  });

  // ── Ses XP ───────────────────────────────────────────────────────────────
  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    const userId  = newState.member?.id ?? oldState.member?.id;
    const guildId = newState.guild.id;
    if (!userId || newState.member?.user.bot) return;
    const key = `${userId}:${guildId}`;

    if (!oldState.channelId && newState.channelId) {
      voiceSessions.set(key, Date.now());
    } else if (oldState.channelId && !newState.channelId) {
      const start = voiceSessions.get(key);
      if (!start) return;
      voiceSessions.delete(key);
      const minutes = Math.floor((Date.now() - start) / 60_000);
      if (minutes < 1) return;
      const result = await handleXp(userId, guildId, newState.guild, minutes * VOICE_XP_PER_MIN).catch(() => null);
      if (result?.leveledUp) {
        const ch = newState.guild.systemChannel ?? oldState.channel;
        if (ch && "send" in ch) {
          try {
            const u = await client.users.fetch(userId);
            const buf = await generateLevelUpCard({
              username: u.displayName,
              avatarUrl: u.displayAvatarURL({ extension: "png", size: 256 }),
              oldLevel: result.oldLevel, newLevel: result.newLevel,
            });
            await (ch as TextChannel).send({ content: `${u}`, files: [new AttachmentBuilder(buf, { name: "levelup.png" })] });
          } catch { /**/ }
        }
      }
    }
  });

  // ── Button etkileşimleri ──────────────────────────────────────────────────
  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isChannelSelectMenu() && interaction.customId.startsWith("anon_setup_")) {
      const [kind, guildId, userId] = interaction.customId.split(":");
      if (!interaction.guildId || interaction.guildId !== guildId || interaction.user.id !== userId) {
        await interaction.reply({ content: "❌ Bu seçim paneli sana ait değil.", ephemeral: true }).catch(() => null);
        return;
      }
      const key = `${guildId}:${userId}`;
      const session = anonymousSetupSessions.get(key) ?? { guildId, userId };
      const selected = interaction.values[0];
      if (kind === "anon_setup_general") session.generalChannelId = selected;
      if (kind === "anon_setup_approval") session.approvalChannelId = selected;
      if (kind === "anon_setup_category") session.categoryId = selected;
      anonymousSetupSessions.set(key, session);

      const finishRow = session.generalChannelId && session.approvalChannelId && session.categoryId
        ? [new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`anon_setup_finish:${guildId}:${userId}`).setLabel("✅ Kurulumu Tamamla").setStyle(ButtonStyle.Success),
        )]
        : [];
      await interaction.update({
        content:
          `Seçimler kaydedildi.\n` +
          `• Genel kanal: ${session.generalChannelId ? `<#${session.generalChannelId}>` : "Seçilmedi"}\n` +
          `• Onay kanalı: ${session.approvalChannelId ? `<#${session.approvalChannelId}>` : "Seçilmedi"}\n` +
          `• Özel kanal kategorisi: ${session.categoryId ? `<#${session.categoryId}>` : "Seçilmedi"}\n\n` +
          (finishRow.length ? "Her şey hazır. Kurulumu başlatmak için butona bas." : "Eksik seçimleri aşağıdaki menülerden tamamla."),
        components: [
          new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
            new ChannelSelectMenuBuilder().setCustomId(`anon_setup_general:${guildId}:${userId}`).setPlaceholder("Anonim genel sohbet kanalını seç").setChannelTypes(ChannelType.GuildText).setMaxValues(1),
          ),
          new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
            new ChannelSelectMenuBuilder().setCustomId(`anon_setup_approval:${guildId}:${userId}`).setPlaceholder("Onay kanalını seç").setChannelTypes(ChannelType.GuildText).setMaxValues(1),
          ),
          new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
            new ChannelSelectMenuBuilder().setCustomId(`anon_setup_category:${guildId}:${userId}`).setPlaceholder("Özel kanal kategorisini seç").setChannelTypes(ChannelType.GuildCategory).setMaxValues(1),
          ),
          ...finishRow,
        ],
      }).catch(() => null);
      return;
    }
    if (!interaction.isButton()) return;
    const { customId } = interaction;

    if (customId.startsWith("protection_setup_")) {
      const parts = customId.split(":");
      const action = parts[0];
      const guildId = parts[1];
      const userId = parts[2];
      const key = `${guildId}:${userId}`;
      if (!interaction.guildId || interaction.guildId !== guildId || interaction.user.id !== userId) {
        await interaction.reply({ content: "❌ Bu kurulum paneli yalnızca kurulumu başlatan kişiye aittir.", ephemeral: true }).catch(() => null);
        return;
      }
      const draft = protectionSetupSessions.get(key);
      if (!draft) {
        await interaction.reply({ content: "❌ Bu kurulum panelinin süresi doldu. `v!koruma setup` ile yeniden başlat.", ephemeral: true }).catch(() => null);
        return;
      }
      if (action === "protection_setup_toggle") {
        const condition = parts[3] as "join" | "leave" | "channel" | "role";
        if (!["join", "leave", "channel", "role"].includes(condition)) return;
        const next = toggleProtectionSetup(draft, condition);
        protectionSetupSessions.set(key, next);
        await interaction.update({ embeds: [protectionSetupEmbed(next)], components: protectionSetupRows(next) }).catch(() => null);
        return;
      }
      if (action === "protection_setup_save") {
        await saveProtectionSetup(draft);
        protectionSetupSessions.delete(key);
        await interaction.update({
          embeds: [new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle("✅ Sunucu Koruması Kuruldu")
            .setDescription("Seçtiğin koşullar kaydedildi ve koruma izleme moduna alındı.\nTetiklenirse bot snapshot alıp sunucuyu otomatik kilitleyecek.")
            .setTimestamp()],
          components: [],
        }).catch(() => null);
        return;
      }
      if (action === "protection_setup_cancel") {
        protectionSetupSessions.delete(key);
        await interaction.update({ content: "❌ Sunucu koruması kurulumu iptal edildi.", embeds: [], components: [] }).catch(() => null);
        return;
      }
    }

    if (customId.startsWith("server_protection_clear:") || customId.startsWith("server_protection_disable:")) {
      const [action, guildId, requesterId] = customId.split(":");
      const guild = interaction.guild;
      const authorized = Boolean(
        guild &&
        interaction.guildId === guildId &&
        (interaction.user.id === requesterId || interaction.user.id === guild.ownerId || isOwner(interaction.user.id)),
      );
      if (!authorized || !guild) {
        await interaction.reply({ content: "❌ Bu işlem yalnızca sunucu sahibi veya aktif bot admini tarafından onaylanabilir.", ephemeral: true }).catch(() => null);
        return;
      }
      await interaction.deferUpdate().catch(() => null);
      if (action === "server_protection_disable") {
        await disableProtection(guild);
        await interaction.editReply({
          embeds: [new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle("🔓 Koruma Kapatıldı")
            .setDescription("Sunucu açıldı ve sunucu koruması devre dışı bırakıldı.")
            .setTimestamp()],
          components: [],
        }).catch(() => null);
      } else {
        const restored = await clearProtection(guild);
        await interaction.editReply({
          embeds: [new EmbedBuilder()
            .setColor(restored ? 0x57f287 : 0x72767d)
            .setTitle(restored ? "🔓 Sunucu Açıldı" : "ℹ️ Sunucu Zaten Açık")
            .setDescription(restored
              ? "Koruma temizlendi; kaydedilen kanal izinleri ve kullanıcı rolleri geri yüklendi."
              : "Aktif bir sunucu kilidi bulunamadı.")
            .setTimestamp()],
          components: [],
        }).catch(() => null);
      }
      return;
    }

    // Anonim profil onay/red butonları DM'den gelir.
    if (customId.startsWith("anon_setup_start:")) {
      const [, guildId, userId] = customId.split(":");
      if (userId !== interaction.user.id || interaction.guildId !== guildId) {
        await interaction.reply({ content: "❌ Bu panel sana ait değil.", ephemeral: true }).catch(() => null);
        return;
      }
      const key = `${guildId}:${userId}`;
      anonymousSetupSessions.set(key, { guildId: guildId!, userId: userId! });
      await interaction.reply({
        content: "Kurulum için üç seçimi de yap. Seçimlerden sonra **Kurulumu Tamamla** butonu görünecek.",
        ephemeral: true,
        components: [
          new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
            new ChannelSelectMenuBuilder().setCustomId(`anon_setup_general:${guildId}:${userId}`).setPlaceholder("Anonim genel sohbet kanalını seç").setChannelTypes(ChannelType.GuildText).setMaxValues(1),
          ),
          new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
            new ChannelSelectMenuBuilder().setCustomId(`anon_setup_approval:${guildId}:${userId}`).setPlaceholder("Onay kanalını seç").setChannelTypes(ChannelType.GuildText).setMaxValues(1),
          ),
          new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
            new ChannelSelectMenuBuilder().setCustomId(`anon_setup_category:${guildId}:${userId}`).setPlaceholder("Özel kanal kategorisini seç").setChannelTypes(ChannelType.GuildCategory).setMaxValues(1),
          ),
        ],
      }).catch(() => null);
      return;
    }
    if (customId.startsWith("anon_setup_finish:")) {
      const [, guildId, userId] = customId.split(":");
      if (userId !== interaction.user.id || interaction.guildId !== guildId) {
        await interaction.reply({ content: "❌ Bu panel sana ait değil.", ephemeral: true }).catch(() => null);
        return;
      }
      const session = anonymousSetupSessions.get(`${guildId}:${userId}`);
      if (!session?.generalChannelId || !session.approvalChannelId || !session.categoryId) {
        await interaction.reply({ content: "❌ Önce genel kanal, onay kanalı ve kategori seçimlerini tamamla.", ephemeral: true }).catch(() => null);
        return;
      }
      await interaction.deferUpdate();
      try {
        await setupAnonymousApprovalPanel(interaction.guild!, session.approvalChannelId, session.generalChannelId, session.categoryId);
        anonymousSetupSessions.delete(`${guildId}:${userId}`);
        await interaction.editReply({
          content: `✅ Anonim sistem kuruldu!\n• Genel sohbet: <#${session.generalChannelId}>\n• Onay kanalı: <#${session.approvalChannelId}>\n• Özel kanal kategorisi: <#${session.categoryId}>`,
          components: [],
        });
      } catch (err) {
        logger.error({ err }, "Anonim butonlu kurulum başarısız");
        await interaction.editReply({ content: "❌ Kurulum başarısız. Botun kanal, webhook, mesaj ve izinleri yönetme yetkilerini kontrol et.", components: [] }).catch(() => null);
      }
      return;
    }
    if (customId.startsWith("anon_create_account:")) {
      const result = await handleAnonymousButton(customId, interaction.user.id, client).catch((err) => {
        logger.error({ err }, "Anonim hesap butonu hatası");
        return { handled: true, content: "❌ İşlem sırasında hata oluştu." };
      });
      const guildId = customId.split(":")[1];
      const components = [new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`anon_confirm_account:${guildId}:${interaction.user.id}`).setLabel("Kuralları Kabul Et ve Oluştur").setStyle(ButtonStyle.Success),
      )];
      await interaction.reply({ content: result.content ?? "İşlem tamamlandı.", components, ephemeral: true }).catch(() => null);
      return;
    }
    if (customId.startsWith("anon_confirm_account:")) {
      const result = await handleAnonymousButton(customId, interaction.user.id, client).catch((err) => {
        logger.error({ err }, "Anonim hesap onay butonu hatası");
        return { handled: true, content: "❌ Hesap oluşturulamadı.", accountId: undefined };
      });
      const components = result.accountId
        ? [new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`anon_join:${result.accountId}:${interaction.user.id}`).setLabel("Sohbete Katıl").setStyle(ButtonStyle.Success),
        )] : [];
      await interaction.update({ content: result.content ?? "İşlem tamamlandı.", components }).catch(() => null);
      return;
    }
    if (customId.startsWith("anon_join:")) {
      const result = await handleAnonymousButton(customId, interaction.user.id, client).catch((err) => {
        logger.error({ err }, "Anonim kanal butonu hatası");
        return { handled: true, content: "❌ Özel kanal oluşturulamadı." };
      });
      await interaction.reply({ content: result.content ?? "İşlem tamamlandı.", ephemeral: true }).catch(() => null);
      return;
    }
    if (customId.startsWith("anon_id_approve:") || customId.startsWith("anon_id_deny:")) {
      const [action, requestId, buttonUserId] = customId.split(":");
      if (buttonUserId !== interaction.user.id) {
        await interaction.reply({ content: "❌ Bu buton sana ait değil.", ephemeral: true }).catch(() => null);
        return;
      }
      const result = await resolveAnonymousIdChange(
        requestId!,
        interaction.user.id,
        action === "anon_id_approve",
      ).catch((err) => {
        logger.error({ err }, "Anonim ID butonu hatası");
        return { ok: false, message: "İşlem sırasında hata oluştu." };
      });
      await interaction.update({
        embeds: [new EmbedBuilder()
          .setColor(result.ok ? (action === "anon_id_approve" ? 0x57f287 : 0x72767d) : 0xed4245)
          .setTitle(action === "anon_id_approve" ? "✅ Anonim ID Onaylandı" : action === "anon_id_deny" ? "❌ Anonim ID Reddedildi" : "⚠️ Anonim ID İşlemi")
          .setDescription(result.message)
          .setTimestamp()],
        components: [],
      }).catch(() => null);
      return;
    }
    if (customId.startsWith("anon_chat_approve:") || customId.startsWith("anon_chat_reject:")) {
      const [action, requestId, buttonUserId] = customId.split(":");
      if (buttonUserId !== interaction.user.id || !interaction.guild) {
        await interaction.reply({ content: "❌ Bu buton sana ait değil.", ephemeral: true }).catch(() => null);
        return;
      }
      await interaction.deferUpdate().catch(() => null);
      const result = await resolveAnonymousConversation(
        interaction.guild,
        requestId!,
        interaction.user.id,
        action === "anon_chat_approve",
      ).catch((err) => {
        logger.error({ err }, "Anonim sohbet butonu hatası");
        return { ok: false, message: "İşlem sırasında hata oluştu." };
      });
      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(result.ok ? (action === "anon_chat_approve" ? 0x57f287 : 0x72767d) : 0xed4245)
          .setTitle(action === "anon_chat_approve" ? "✅ Anonim sohbet onaylandı" : action === "anon_chat_reject" ? "❌ Anonim sohbet reddedildi" : "⚠️ Anonim sohbet işlemi")
          .setDescription(result.message)
          .setTimestamp()],
        components: [],
      }).catch(() => null);
      return;
    }
    if (customId.startsWith("anon_approve:") || customId.startsWith("anon_deny:")) {
      const result = await handleAnonymousButton(customId, interaction.user.id, client).catch((err) => {
        logger.error({ err }, "Anonim profil butonu hatası");
        return { handled: true, content: "❌ İşlem sırasında hata oluştu." };
      });
      await interaction.update({ content: result.content ?? "İşlem tamamlandı.", components: [] }).catch(() => null);
      return;
    }

    // Moderasyon onay butonları
    if (customId.startsWith("modapprove_") || customId.startsWith("modreject_")) {
      await handleApprovalButton(interaction).catch((err) =>
        logger.error({ err }, "Mod onay butonu hatası")
      );
      return;
    }

    // Video istek onay/red butonları
    if (customId.startsWith("videoapprove_") || customId.startsWith("videoreject_")) {
      await handleVideoApprovalButton(interaction).catch((err) =>
        logger.error({ err }, "Video onay butonu hatası")
      );
      return;
    }

    // Mine (mayın tarlası) butonları
    if (customId.startsWith("mine_")) {
      await handleMineClick(interaction, COIN).catch((err) =>
        logger.error({ err }, "Mine tıklama hatası")
      );
      return;
    }

    if (!customId.startsWith("help_")) return;

    const prefix = interaction.guildId
      ? await getPrefix(interaction.guildId).catch(() => "v!")
      : "v!";

    if (customId === "help_overview") {
      await interaction.update({
        embeds: [buildHelpOverviewEmbed(prefix)],
        components: buildHelpButtons(),
      });
      return;
    }

    const catKey = customId.replace("help_cat_", "");
    const embed = buildHelpCategoryEmbed(prefix, catKey);
    if (!embed) {
      await interaction.update({ content: "❌ Kategori bulunamadı.", components: [] });
      return;
    }

    const backRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("help_overview")
        .setLabel("◀ Tüm Kategoriler")
        .setStyle(ButtonStyle.Primary)
    );
    await interaction.update({
      embeds: [embed],
      components: [backRow],
    });
  });

  // ── Guard: Bot katılım koruması ───────────────────────────────────────────
  client.on(Events.GuildMemberAdd, async (member: GuildMember) => {
    await handleBotJoin(member).catch(() => null);
    await handleMemberLog(member.guild, member, "join").catch(() => null);
    await checkProtectionTrigger(member.guild, "join").catch((err) => logger.debug({ err }, "Giriş koruması kontrolü başarısız"));
    await syncMemberTagRole(member).catch(() => null);
    await applyAutoRoles(member).catch(() => null);
  });

  client.on(Events.GuildMemberRemove, async (member) => {
    await handleMemberLog(member.guild, member, "leave").catch(() => null);
    await checkProtectionTrigger(member.guild, "leave").catch((err) => logger.debug({ err }, "Çıkış koruması kontrolü başarısız"));
  });

  client.on(Events.GuildMemberUpdate, async (_oldMember, newMember) => {
    await syncMemberTagRole(newMember).catch(() => null);
  });

  // ── Guard: Rol & Kanal saldırısı tespiti ─────────────────────────────────
  client.on(Events.GuildAuditLogEntryCreate, async (entry, guild) => {
    await handleAuditLogEntry(guild, entry).catch((err) => {
      logger.debug({ err, guildId: guild.id }, "Genel audit log gönderilemedi");
    });
    if (
      entry.action === AuditLogEvent.MemberRoleUpdate ||
      entry.action === AuditLogEvent.RoleCreate ||
      entry.action === AuditLogEvent.RoleDelete ||
      entry.action === AuditLogEvent.RoleUpdate
    ) {
      await handleRoleUpdate(guild, entry).catch(() => null);
    }
    if (
      entry.action === AuditLogEvent.ChannelCreate ||
      entry.action === AuditLogEvent.ChannelDelete ||
      entry.action === AuditLogEvent.ChannelUpdate
    ) {
      await handleChannelChange(guild, entry).catch(() => null);
      await checkProtectionTrigger(guild, "channel").catch((err) => logger.debug({ err }, "Kanal koruması kontrolü başarısız"));
    }
    if (
      entry.action === AuditLogEvent.MemberRoleUpdate ||
      entry.action === AuditLogEvent.RoleCreate ||
      entry.action === AuditLogEvent.RoleDelete ||
      entry.action === AuditLogEvent.RoleUpdate
    ) {
      await checkProtectionTrigger(guild, "role").catch((err) => logger.debug({ err }, "Rol koruması kontrolü başarısız"));
    }
  });

  // ── Mesaj logları ────────────────────────────────────────────────────────
  client.on(Events.MessageUpdate, async (_oldMessage, newMessage) => {
    if (!newMessage.guild) return;
    await handleMessageLog(newMessage.guild, newMessage, "edited").catch((err) => {
      logger.debug({ err, guildId: newMessage.guildId }, "Mesaj düzenleme logu gönderilemedi");
    });
  });

  client.on(Events.MessageDelete, async (message) => {
    if (!message.guild) return;
    await handleMessageLog(message.guild, message, "deleted").catch((err) => {
      logger.debug({ err, guildId: message.guildId }, "Mesaj silme logu gönderilemedi");
    });
  });

  client.on(Events.MessageBulkDelete, async (messages, channel) => {
    const guild = "guild" in channel ? channel.guild : null;
    if (!guild) return;
    await handleBulkMessageLog(guild, channel.id, messages.size).catch((err) => {
      logger.debug({ err, guildId: guild.id }, "Toplu mesaj silme logu gönderilemedi");
    });
  });

  // ── Mesaj XP + Guard + Prefix komutlar ───────────────────────────────────
  client.on(Events.MessageCreate, async (message: Message) => {
    if (message.author.bot) return;
    if (message.guild) {
      void handleMessageLog(message.guild, message, "message").catch((err) => {
        logger.debug({ err, guildId: message.guildId }, "Mesaj logu gönderilemedi");
      });
    }

    // DM: anonim profil, anonim hesaba mesaj ve kara liste işlemleri.
    if (!message.guildId) {
      logger.info({ userId: message.author.id, messageId: message.id }, "Anonim DM alındı");
      const dmArgs = message.content.trim().split(/\s+/);
      const dmCmd = dmArgs.shift()?.toLowerCase();
      const normalizedDmCmd = dmCmd?.replace(/[()]/g, "");

      // v!konuşmabaşlat (anonim-hesap-id)
      if (
        normalizedDmCmd === "v!konuşmabaşlat" ||
        normalizedDmCmd === "v!konusmabaslat" ||
        (normalizedDmCmd === "v!konuşma" && ["başlat", "baslat", "start"].includes(dmArgs[0]?.toLowerCase() ?? ""))
      ) {
        const targetAccountId = (
          normalizedDmCmd === "v!konuşma" ? dmArgs[1] : dmArgs[0]
        )?.replace(/[()<>]/g, "");
        if (!targetAccountId) {
          await message.author.send(
            "Kullanım: `v!konuşmabaşlat (anonim-hesap-id)`",
          ).catch(() => null);
        } else {
          const result = await startAnonymousConversation(message.author.id, targetAccountId, client);
          await message.author.send(`${result.ok ? "✅" : "❌"} ${result.message}`).catch(() => null);
        }
        return;
      }

      if (
        normalizedDmCmd === "v!konuşmakapat" ||
        normalizedDmCmd === "v!konusmakapat" ||
        (normalizedDmCmd === "v!konuşma" && ["kapat", "bitir", "stop"].includes(dmArgs[0]?.toLowerCase() ?? ""))
      ) {
        const stopped = await stopAnonymousConversation(message.author.id);
        await message.author.send(
          stopped ? "✅ Anonim sohbet kapatıldı." : "ℹ️ Aktif bir anonim sohbetin yok.",
        ).catch(() => null);
        return;
      }

      if (dmCmd === "v!anon" || dmCmd === "v!anonim") {
        const sub = dmArgs[0]?.toLowerCase();
        if (sub === "profil" || sub === "profile" || sub === "bilgi") {
          const profileSub = dmArgs[1]?.toLowerCase();
          if (profileSub === "düzenle" || profileSub === "duzenle" || profileSub === "edit") {
            const accountId = dmArgs[2];
            const displayName = dmArgs.slice(3).join(" ");
            if (!accountId || !displayName) {
              await message.author.send("Kullanım: `v!anon profil düzenle <hesap-id> <yeni-ad>`").catch(() => null);
            } else {
              const result = await updateAnonymousProfile(message.author.id, accountId, displayName);
              await message.author.send(`${result.ok ? "✅" : "❌"} ${result.message}`).catch(() => null);
            }
          } else {
            await sendAnonymousProfileDm(message.author.id, client);
          }
        } else if (sub === "id" || sub === "kimlik") {
          const requestedId = dmArgs[1];
          if (!requestedId) {
            await message.author.send(
              "Kullanım: `v!anon id <yeni-id>`\n" +
              "ID tam olarak 5 rakam olmalı. Örnek: `01234`. Değişiklik ücreti: **50 puan**.",
            ).catch(() => null);
          } else {
            const result = await requestAnonymousIdChange(message.author.id, requestedId);
            if (!result.ok || !result.requestId) {
              await message.author.send(`❌ ${result.message}`).catch(() => null);
            } else {
              const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                  .setCustomId(`anon_id_approve:${result.requestId}:${message.author.id}`)
                  .setLabel("✅ Onayla (50 puan)")
                  .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                  .setCustomId(`anon_id_deny:${result.requestId}:${message.author.id}`)
                  .setLabel("❌ Reddet")
                  .setStyle(ButtonStyle.Danger),
              );
              await message.author.send({
                embeds: [new EmbedBuilder()
                  .setColor(0xffc857)
                  .setTitle("🕵️ Anonim ID Değişikliği")
                  .setDescription(
                    `Yeni anonim ID'n **${requestedId.toUpperCase()}** olarak ayarlanacak.\n\n` +
                    "Bu ID tüm anonim hesaplar arasında benzersiz olmalıdır. Onaylarsan **50 puan** düşülür; reddedersen puanın harcanmaz.",
                  )
                  .addFields(
                    { name: "Yeni ID", value: `\`${requestedId.toUpperCase()}\``, inline: true },
                    { name: "Ücret", value: "⭐ 50 puan", inline: true },
                  )
                  .setFooter({ text: "Bu istek 10 dakika içinde geçerliliğini yitirir." })
                  .setTimestamp()],
                components: [row],
              }).catch(() => null);
            }
          }
        } else if (sub === "sıralama" || sub === "siralama" || sub === "lider" || sub === "puan") {
          const rows = await getAnonymousPointLeaderboard(10);
          const embed = new EmbedBuilder()
            .setColor(0xffc857)
            .setTitle("🕵️ Anonim Puan Sıralaması")
            .setDescription(rows.length
              ? rows.map((row, i) => `${i + 1}. **${row.anonymousId ?? row.displayName}** — ⭐ **${row.points} puan**`).join("\n")
              : "Henüz anonim mesaj gönderen yok.")
            .setFooter({ text: "Anonim özel kanalından gönderilen her mesaj 1 puan kazandırır." })
            .setTimestamp();
          await message.author.send({ embeds: [embed] }).catch(() => null);
        } else if (sub === "mesaj" || sub === "dm" || sub === "gönder" || sub === "gonder") {
          const accountId = dmArgs[1];
          const content = dmArgs.slice(2).join(" ").trim();
          if (!accountId || !content) {
            await message.author.send(
              "Kullanım: `v!anon mesaj <anonim-hesap-id> <mesaj>`\n" +
              "Örnek: `v!anon mesaj 123456789-987654321 Merhaba!`",
            ).catch(() => null);
          } else {
            const result = await sendAnonymousMessage(message.author.id, accountId, content, client);
            await message.author.send(`${result.ok ? "✅" : "❌"} ${result.message}`).catch(() => null);
          }
        } else if (sub === "karaliste" || sub === "kara" || sub === "blacklist") {
          const action = dmArgs[1]?.toLowerCase();
          const accountId = dmArgs[2];
          if (action === "liste" || action === "list") {
            const blocked = await getBlockedAnonymousAccounts(message.author.id);
            await message.author.send(
              blocked.length
                ? `🚫 **Anonim kara listen:**\n${blocked.map(b => `• \`${b.accountId}\` — **${b.displayName ?? "Silinmiş hesap"}**`).join("\n")}`
                : "✅ Anonim kara listen boş.",
            ).catch(() => null);
          } else if (action === "ekle" || action === "add" || action === "kaldır" || action === "kaldir" || action === "remove") {
            if (!accountId) {
              await message.author.send("Kullanım: `v!anon karaliste ekle/kaldir <anonim-hesap-id>`").catch(() => null);
            } else {
              const result = action === "ekle" || action === "add"
                ? await blockAnonymousAccount(message.author.id, accountId)
                : await unblockAnonymousAccount(message.author.id, accountId);
              await message.author.send(`${result.ok ? "✅" : "❌"} ${result.message}`).catch(() => null);
            }
          } else {
            await message.author.send(
              "Kullanım: `v!anon karaliste liste`\n" +
              "`v!anon karaliste ekle <id>`\n" +
              "`v!anon karaliste kaldir <id>`",
            ).catch(() => null);
          }
        } else {
          await message.author.send(
            "🕵️ **Anonim DM kullanımı**\n" +
            "`v!anon profil` — Hesap ID'lerini ve profillerini gösterir\n" +
            "`v!anon profil düzenle <id> <ad>` — Profil adını değiştirir\n" +
            "`v!anon id <5-rakam>` — Anonim #00000 ID'ni 50 puan karşılığında değiştirir\n" +
            "`v!anon mesaj <id> <mesaj>` — Anonim hesaba DM gönderir\n" +
            "`v!anon sıralama` — Anonim puan sıralamasını gösterir\n" +
            "`v!anon karaliste liste` — Engellediklerini gösterir\n" +
            "`v!anon karaliste ekle <id>` — Bu hesaptan mesaj alma\n" +
            "`v!anon karaliste kaldir <id>` — Engeli kaldırır",
          ).catch(() => null);
        }
      } else {
        // Aktif anonim sohbet varsa bu DM mesajını karşı tarafa aktar.
        await relayAnonymousConversationMessage(message, client).catch((err) => {
          logger.error({ err, userId: message.author.id }, "Anonim DM aktarım hatası");
        });
      }
      return;
    }

    // ── Bot etiketlendiğinde AI sohbet ──────────────────────────────────────
    const botId = client.user?.id;
    const isMentioned =
      botId &&
      (message.content.includes(`<@${botId}>`) || message.content.includes(`<@!${botId}>`));

    // ── VBRİ code kanalı — sadece bot/sunucu sahibi ────────────────────────
    const chName = "name" in message.channel
      ? (message.channel as { name?: string }).name?.toLowerCase() ?? ""
      : "";
    const isCodeCh =
      (chName.includes("vbri") || chName.includes("vbr")) &&
      (chName.includes("code") || chName.includes("kod"));
    if (isCodeCh && (isOwner(message.author.id) || message.guild?.ownerId === message.author.id)) {
      await handleCodeChannel(message).catch((err) =>
        logger.error({ err }, "VBRIaimotor kod kanalı hatası")
      );
      return;
    }

    if (isMentioned) {
      await handleAiMessage(message).catch((err) =>
        logger.error({ err }, "VBRIaimotor sohbet hatası")
      );
      return; // Guard ve XP'yi atla — sadece AI yanıtı ver
    }

    const prefix = await getPrefix(message.guildId).catch(() => "v!");

    if (message.content.startsWith(prefix)) {
      const args = message.content.slice(prefix.length).trim().split(/\s+/);
      const cmd = args.shift()?.toLowerCase() ?? "";
      let handler = prefixHandlers[cmd];
      let resolvedCmd = cmd;

      // Komut bulunamadıysa akıllı eşleştirme dene
      if (!handler && cmd.length >= 2) {
        const match = await resolveCommand(cmd).catch(() => null);
        if (match && prefixHandlers[match.cmd]) {
          handler = prefixHandlers[match.cmd]!;
          resolvedCmd = match.cmd;

          // Kullanıcıya sessizce bildir (1 saniye sonra silinir)
          const hint = await message.reply(
            `💡 **\`${prefix}${cmd}\`** → **\`${prefix}${resolvedCmd}\`** olarak anladım!`
          ).catch(() => null);
          if (hint) setTimeout(() => hint.delete().catch(() => null), 5000);
        }
      }

      if (handler) {
        // Bakım modu kontrolü — bakımdaki komutlar bot sahibi dahil hiç kimseye açık değildir.
        // Bakım komutunun kendisi açık kalır ki sahip bakım modunu kaldırabilsin.
        const bypassCmds = new Set(["bakım", "bakim", "bakimmod", "aimod", "aitemizle", "aigeçmiş"]);
        if (isInMaintenance(resolvedCmd) && !bypassCmds.has(resolvedCmd)) {
          await message.reply(
            `🔧 **\`${prefix}${resolvedCmd}\`** şu an bakımda, birazdan geri dönecek!\n` +
            `Bakım listesi için: \`${prefix}bakım liste\``
          );
          return;
        }
        await handler(message, args).catch(async (err) => {
          logger.error({ err, cmd: resolvedCmd }, "Prefix hata");
          await message.reply(`❌ **\`${prefix}${resolvedCmd}\`** çalıştırılırken hata oluştu: ${(err as any)?.message ?? "Bilinmeyen hata"}`).catch(() => null);
        });
        return;
      }
    }

    // Anonim özel sohbet aktarımı, genel anonim kanal işleyicisinden önce gelir.
    // Özel sohbet kanallarındaki mesajlar genel sohbete düşmemelidir.
    const anonymousChannelRelayed = await relayAnonymousChannelMessage(message).catch((err) => {
      logger.error({ err }, "Anonim özel kanal aktarım hatası");
      return false;
    });
    if (anonymousChannelRelayed) return;

    // Anonim kanal: komutlardan sonra, guard ve XP'den önce işlenir.
    // Böylece anonim kanaldaki normal mesajlar kullanıcı adı görünmeden gider.
    const anonymousHandled = await handleAnonymousMessage(message).catch((err) => {
      logger.error({ err }, "Anonim sohbet hatası");
      return false;
    });
    if (anonymousHandled) return;

    // Guard kontrolleri (komut olmayan mesajlarda)
    const spamBlocked = await handleSpam(message).catch(() => false);
    if (spamBlocked) return;
    const linkBlocked = await handleLink(message).catch(() => false);
    if (linkBlocked) return;
    await handleEmoji(message).catch(() => null);

    // XP kazanımı — level sistemi kapalıysa atla
    const levelEnabled = await getLevelEnabled(message.guildId).catch(() => true);
    if (!levelEnabled) return;
    const result = await handleXp(message.author.id, message.guildId, message.guild ?? undefined).catch(() => null);
    if (result?.leveledUp) {
      try {
        const buf = await generateLevelUpCard({
          username: message.author.displayName,
          avatarUrl: message.author.displayAvatarURL({ extension: "png", size: 256 }),
          oldLevel: result.oldLevel, newLevel: result.newLevel,
        });
        await sendMessageChannel(message, { content: `${message.author}`, files: [new AttachmentBuilder(buf, { name: "levelup.png" })] });
      } catch {
        await sendMessageChannel(message, `🎉 ${message.author} **${result.newLevel}. seviyeye** ulaştı!`).catch(() => null);
      }
    }
  });

  // ── Stat kanalları periyodik güncelleme (her 10 dakika) ───────────────────
  setInterval(async () => {
    for (const guild of client.guilds.cache.values()) {
      await updateStatChannels(guild).catch(() => null);
    }
  }, 10 * 60_000);

  await client.login(token);
}
