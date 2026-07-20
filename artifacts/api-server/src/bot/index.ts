import {
  Client, Events, GatewayIntentBits,
  AttachmentBuilder, TextChannel, ChannelType,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  type Message,
} from "discord.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { logger } from "../lib/logger";
import { handleXp, getUserLevel, getRank, xpToNextLevel, getLeaderboard, getLevelRoles, setLevelRole, removeLevelRole } from "./leveling";
import { getPrefix, setPrefix as setPrefixUtil } from "./guildSettings";
import { generateProfileCard } from "./profileCard";
import { generateLeaderboardCard, type LeaderboardEntry } from "./leaderboardCard";
import { generateLevelUpCard } from "./levelUpCard";
import { generateSicilCard } from "./sicilCard";
import { generateHelpCard, generateCategoryHelpCard, HELP_CATEGORIES } from "./helpCard";
import { logAction, getUserLogs, deactivateLog, getLogById } from "./moderation";
import {
  getBalance, addCoins, takeCoins, claimDaily, getLuck, activatePray, luckRoll,
  addEconXp, getEconRank, getEconLeaderboard,
  econLevelFromXp, xpAtLevel, xpForNextLevel, econLevelReward, econRankTitle,
  type EconXpResult,
} from "./economy";
import { addToQueue, pauseResume, skipTrack, stopAndLeave, getQueue, getNowPlaying, warmupMusic } from "./music";
import { isOwner } from "./ownerUtils";
import { getGuard, setGuard, handleSpam, handleLink, handleEmoji, handleBotJoin, handleRoleUpdate, handleChannelChange } from "./guard";
import { setupStatChannels, updateStatChannels, removeStatChannels, getStatChannels } from "./stat";
import { AuditLogEvent, type GuildMember } from "discord.js";

// ── Vivincy coin emoji (startup'ta register edilir) ───────────────────────────
let COIN = "🪙"; // fallback, uygulama emojisi yüklenince güncellenir

// ── Tip tanımları ─────────────────────────────────────────────────────────────

type PfxHandler = (m: Message, args: string[]) => Promise<void>;

// ── Ses XP takibi ─────────────────────────────────────────────────────────────

const voiceSessions = new Map<string, number>();
const VOICE_XP_PER_MIN = 10;

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
}

// LEADERBOARD
async function pfxLeaderboard(m: Message): Promise<void> {
  if (!m.guildId) return;
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
  const logs = await getUserLogs(target.id, m.guildId);
  const buf = await generateSicilCard({ username: target.displayName, avatarUrl: target.displayAvatarURL({ extension: "png", size: 256 }), logs });
  await m.reply({ files: [new AttachmentBuilder(buf, { name: "sicil.png" })] });
}

// MODERASYon
async function pfxBan(m: Message, args: string[]): Promise<void> {
  if (!m.guild || !m.member) return;
  if (!isOwner(m.author.id) && !m.member.permissions.has("BanMembers")) { await m.reply("❌ **Ban Members** iznin yok."); return; }
  const target = m.mentions.users.first();
  if (!target) { await m.reply("❌ Kullanım: `ban @kullanici [sebep]`"); return; }
  const sebep = args.slice(1).join(" ") || "Sebep belirtilmedi";
  try {
    await m.guild.bans.create(target.id, { reason: sebep });
    await logAction({ guildId: m.guildId!, userId: target.id, moderatorId: m.author.id, action: "ban", reason: sebep });
    await m.reply(`🔨 **${target.username}** yasaklandı. Sebep: ${sebep}`);
  } catch {
    await m.reply("❌ Bu kullanıcıyı yasaklayamıyorum. (Bot yetki hiyerarşisinde kullanıcının altında olabilir.)");
  }
}

async function pfxKick(m: Message, args: string[]): Promise<void> {
  if (!m.guild || !m.member) return;
  if (!isOwner(m.author.id) && !m.member.permissions.has("KickMembers")) { await m.reply("❌ **Kick Members** iznin yok."); return; }
  const target = m.mentions.members?.first();
  if (!target) { await m.reply("❌ Kullanım: `kick @kullanici [sebep]`"); return; }
  const sebep = args.slice(1).join(" ") || "Sebep belirtilmedi";
  if (!target.kickable && !isOwner(m.author.id)) { await m.reply("❌ Bu kullanıcıyı atamıyorum. (Yetki hiyerarşisi)"); return; }
  try {
    await target.kick(sebep);
    await logAction({ guildId: m.guildId!, userId: target.id, moderatorId: m.author.id, action: "kick", reason: sebep });
    await m.reply(`👢 **${target.user.username}** atıldı. Sebep: ${sebep}`);
  } catch {
    await m.reply("❌ Bu kullanıcıyı atamıyorum. (Bot yetki hiyerarşisinde kullanıcının altında olabilir.)");
  }
}

async function pfxWarn(m: Message, args: string[]): Promise<void> {
  if (!m.guildId || !m.member) return;
  if (!isOwner(m.author.id) && !m.member.permissions.has("ModerateMembers")) { await m.reply("❌ **Moderate Members** iznin yok."); return; }
  const target = m.mentions.users.first();
  if (!target) { await m.reply("❌ Kullanım: `warn @kullanici [sebep]`"); return; }
  const sebep = args.slice(1).join(" ") || "Sebep belirtilmedi";
  const log = await logAction({ guildId: m.guildId, userId: target.id, moderatorId: m.author.id, action: "warn", reason: sebep });
  await m.reply(`⚠️ **${target.username}** uyarıldı. Sebep: ${sebep} | #${log.id}`);
  try { await target.send(`⚠️ **${m.guild?.name}** sunucusunda uyarı aldın!\nSebep: ${sebep} | #${log.id}`); } catch { /**/ }
}

async function pfxTimeout(m: Message, args: string[]): Promise<void> {
  if (!m.guild || !m.member) return;
  if (!isOwner(m.author.id) && !m.member.permissions.has("ModerateMembers")) { await m.reply("❌ **Moderate Members** iznin yok."); return; }
  const target = m.mentions.members?.first();
  if (!target) { await m.reply("❌ Kullanım: `timeout @kişi <süre> [sebep]`\nSüre örn: `10m`, `1sa`, `1g`"); return; }
  const durationStr = args[1];
  if (!durationStr) { await m.reply("❌ Süre belirt. Örn: `timeout @user 10m`"); return; }
  const ms = parseDuration(durationStr);
  if (!ms || ms < 1000 || ms > 28 * 24 * 60 * 60 * 1000) { await m.reply("❌ Geçersiz süre. Min: 1sn, Maks: 28g. Örn: `10m`, `1sa`, `2g`"); return; }
  const sebep = args.slice(2).join(" ") || "Sebep belirtilmedi";
  await target.timeout(ms, sebep);
  await logAction({ guildId: m.guildId!, userId: target.id, moderatorId: m.author.id, action: "timeout", reason: sebep });
  await m.reply(`⏰ **${target.user.tag}** ${durationStr} susturuldu. Sebep: ${sebep}`);
}

async function pfxUntimeout(m: Message, args: string[]): Promise<void> {
  if (!m.guild || !m.member) return;
  if (!isOwner(m.author.id) && !m.member.permissions.has("ModerateMembers")) { await m.reply("❌ **Moderate Members** iznin yok."); return; }
  const target = m.mentions.members?.first();
  if (!target) { await m.reply("❌ Kullanım: `untimeout @kullanici [sebep]`"); return; }
  const sebep = args.slice(1).join(" ") || "Susturma kaldırıldı";
  await target.timeout(null, sebep);
  await m.reply(`✅ **${target.user.tag}** susturması kaldırıldı.`);
}

async function pfxUnban(m: Message, args: string[]): Promise<void> {
  if (!m.guild || !m.member) return;
  if (!isOwner(m.author.id) && !m.member.permissions.has("BanMembers")) { await m.reply("❌ **Ban Members** iznin yok."); return; }
  const userId = args[0];
  if (!userId) { await m.reply("❌ Kullanım: `unban <kullanıcı-id> [sebep]`"); return; }
  const sebep = args.slice(1).join(" ") || "Sebep belirtilmedi";
  try {
    const bannedUser = await m.guild.bans.fetch(userId);
    await m.guild.bans.remove(userId, `${m.author.tag}: ${sebep}`);
    await logAction({ guildId: m.guildId!, userId, moderatorId: m.author.id, action: "unban", reason: sebep });
    await m.reply(`✅ **${bannedUser.user.tag}** yasağı kaldırıldı. Sebep: ${sebep}`);
  } catch {
    await m.reply("❌ Bu ID ile yasaklı bir kullanıcı bulunamadı.");
  }
}

async function pfxUyariKaldir(m: Message, args: string[]): Promise<void> {
  if (!m.guildId || !m.member) return;
  if (!isOwner(m.author.id) && !m.member.permissions.has("ModerateMembers")) { await m.reply("❌ **Moderate Members** iznin yok."); return; }
  const id = parseInt(args[0] ?? "0");
  if (isNaN(id) || id < 1) { await m.reply("❌ Kullanım: `uyarikaldir <uyarı-id>`"); return; }
  const existing = await getLogById(id, m.guildId);
  if (!existing || existing.action !== "warn") { await m.reply(`❌ #${id} numaralı uyarı kaydı bulunamadı.`); return; }
  if (!existing.active) { await m.reply(`❌ #${id} numaralı uyarı zaten kaldırılmış.`); return; }
  await deactivateLog(id, m.guildId);
  await m.reply(`✅ **#${id}** numaralı uyarı <@${existing.userId}> için kaldırıldı.`);
}

async function pfxTemizle(m: Message, args: string[]): Promise<void> {
  if (!m.guild || !m.member || !(m.channel instanceof TextChannel)) return;
  if (!isOwner(m.author.id) && !m.member.permissions.has("ManageMessages")) { await m.reply("❌ **Manage Messages** iznin yok."); return; }
  const n = Math.min(parseInt(args[0] ?? "10") || 10, 100);
  const msgs = await m.channel.messages.fetch({ limit: n + 1 });
  const deleted = await m.channel.bulkDelete(msgs, true);
  const reply = await m.channel.send(`🗑️ **${Math.max(deleted.size - 1, 0)}** mesaj silindi.`);
  setTimeout(() => reply.delete().catch(() => null), 4000);
}

async function pfxNuke(m: Message): Promise<void> {
  if (!m.guild || !(m.channel instanceof TextChannel)) return;
  const isAdmin = m.member?.permissions.has("Administrator") ?? false;
  if (!isOwner(m.author.id) && m.guild.ownerId !== m.author.id && !isAdmin) { await m.reply("❌ Sadece sunucu sahibi veya yöneticiler kullanabilir."); return; }
  const ch = m.channel;
  const { name, topic, nsfw, rateLimitPerUser, position, parentId } = ch;
  const overwrites = ch.permissionOverwrites.cache.map((o) => ({ id: o.id, allow: o.allow, deny: o.deny, type: o.type }));
  await ch.delete(`Nuke — ${m.author.tag}`);
  const newCh = await m.guild.channels.create({ name, type: ChannelType.GuildText, topic: topic ?? undefined, nsfw, rateLimitPerUser, position, parent: parentId ?? undefined, permissionOverwrites: overwrites });
  await newCh.send("💥 **NUKE!** Kanal temizlendi ve yeniden oluşturuldu.");
}

async function pfxKilitle(m: Message): Promise<void> {
  if (!m.guild || !m.member || !(m.channel instanceof TextChannel)) return;
  if (!isOwner(m.author.id) && !m.member.permissions.has("ManageChannels")) { await m.reply("❌ **Manage Channels** iznin yok."); return; }
  await m.channel.permissionOverwrites.edit(m.guild.id, { SendMessages: false });
  await m.reply("🔒 Kanal kilitlendi.");
}

async function pfxAc(m: Message): Promise<void> {
  if (!m.guild || !m.member || !(m.channel instanceof TextChannel)) return;
  if (!isOwner(m.author.id) && !m.member.permissions.has("ManageChannels")) { await m.reply("❌ **Manage Channels** iznin yok."); return; }
  await m.channel.permissionOverwrites.edit(m.guild.id, { SendMessages: null });
  await m.reply("🔓 Kanal kilidi açıldı.");
}

// ── Ekonomi seviye-atlama bildirimi ───────────────────────────────────────────
async function notifyEconLevelUp(m: Message, result: EconXpResult): Promise<void> {
  if (!result.leveled) return;
  const highest = result.newLevels[result.newLevels.length - 1]!;
  const title = econRankTitle(highest);
  const nextReward = econLevelReward(highest + 1);
  await m.channel.send(
    `🎉 **${m.author.displayName}** reached **Economy Level ${highest}** — ${title}!\n` +
    `${COIN} **+${result.totalReward.toLocaleString("en-US")} vivincy** level reward added!\n` +
    `\u200b *Next level reward: ${COIN} ${nextReward.toLocaleString("en-US")} vivincy*`
  ).catch(() => null);
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
    const promptMsg = await m.channel.send(`${m.author} → ✅ **Kart al** | ❌ **Dur** *(15 sn)*`);
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
      await m.channel.send(
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
      await m.channel.send(
        `🎉 **${(user as typeof m.author).displayName}** reached **Economy Level ${highest}** — ${econRankTitle(highest)}!\n` +
        `${COIN} **+${xpR.totalReward.toLocaleString("en-US")} vivincy** reward added!`
      ).catch(() => null);
    }
  }
}

// EKONOMİ SEVİYE PROFİLİ
async function pfxEkono(m: Message): Promise<void> {
  const target = m.mentions.users.first() ?? m.author;
  const bal = await getBalance(target.id);
  const xp = (bal as any).econXp as number ?? 0;
  const level = (bal as any).econLevel as number ?? 0;
  const luck = await getLuck(target.id);
  const rank = await getEconRank(target.id);

  const xpStart = xpAtLevel(level);
  const xpNeeded = xpForNextLevel(level);
  const xpProgress = xp - xpStart;
  const pct = Math.min(100, Math.floor((xpProgress / xpNeeded) * 100));
  const barLen = 20;
  const filled = Math.round((pct / 100) * barLen);
  const bar = "█".repeat(filled) + "░".repeat(barLen - filled);
  const title = econRankTitle(level);
  const nextReward = econLevelReward(level + 1);
  const luckLine = luck > 0 ? "\n🍀 **|** Luck is currently **active**!" : "";

  await m.reply(
    `**━━━━━━━━━━━━━━━━━━━━━**\n` +
    `🏦 **${target.displayName}** · Economy Profile\n` +
    `**━━━━━━━━━━━━━━━━━━━━━**\n` +
    `⭐ **Level ${level}** — ${title}\n` +
    `📊 XP: **${xpProgress.toLocaleString("en-US")} / ${xpNeeded.toLocaleString("en-US")}** *(${pct}%)*\n` +
    `\`[${bar}]\`\n` +
    `${COIN} Balance: **${bal.coins.toLocaleString("en-US")} vivincy**\n` +
    `🔥 Daily streak: **${bal.streak} days**\n` +
    `🏆 Economy rank: **#${rank}**${luckLine}\n` +
    `**━━━━━━━━━━━━━━━━━━━━━**\n` +
    `🎁 Next level reward: **${COIN} ${nextReward.toLocaleString("en-US")} vivincy**`
  );
}

async function pfxEkonLider(m: Message): Promise<void> {
  const top = await getEconLeaderboard(10);
  if (!top.length) { await m.reply("❌ Henüz ekonomi verisi yok."); return; }

  let msg = `**━━━━━━━━━━━━━━━━━━━━━**\n🏦 **Economy Leaderboard** — Top 10\n**━━━━━━━━━━━━━━━━━━━━━**\n`;
  for (let i = 0; i < top.length; i++) {
    const row = top[i]!;
    const medal = (["🥇", "🥈", "🥉"] as string[])[i] ?? `**${i + 1}.**`;
    const lvl = (row as any).econLevel as number ?? 0;
    const rowXp = (row as any).econXp as number ?? 0;
    const rankTitle = econRankTitle(lvl);
    let username = `<@${row.userId}>`;
    try { const u = await m.client.users.fetch(row.userId); username = u.displayName; } catch { /**/ }
    msg += `${medal} **${username}** — Lv.**${lvl}** ${rankTitle} · ${rowXp.toLocaleString("en-US")} XP\n`;
  }
  await m.reply(msg);
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
  if (!args.length) { await m.reply("❌ Kullanım: `çal <şarkı adı>` (SoundCloud arama)"); return; }

  const query = args.join(" ");
  const statusMsg = await m.reply(`🎵 **Aranıyor:** \`${query}\`...`);

  const { track, position, error } = await addToQueue(m.guildId, voiceChannel, m.channel, query, m.author.displayName);

  if (error || !track) {
    await statusMsg.edit(`❌ ${error ?? "Bilinmeyen hata"}`);
    return;
  }

  if (position === 1) {
    await statusMsg.edit(`▶️ **Çalınıyor:** [${track.title}](${track.url})\n⏱️ Süre: **${track.duration}**`);
  } else {
    await statusMsg.edit(`➕ **Kuyruğa eklendi (#${position}):** [${track.title}](${track.url})\n⏱️ Süre: **${track.duration}**`);
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
  const list = queue.tracks.slice(0, 10).map((t, i) =>
    `${i === 0 ? "▶️" : `${i}.`} **${t.title}** [${t.duration}] — _${t.requestedBy}_`
  ).join("\n");
  const more = queue.tracks.length > 10 ? `\n...ve **${queue.tracks.length - 10}** şarkı daha` : "";
  await m.reply(`🎵 **Müzik Kuyruğu** (${queue.tracks.length} şarkı)\n${list}${more}`);
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
  await m.reply(`🎵 **Şu an çalıyor:**\n**${track.title}**\n⏱️ Süre: **${track.duration}** | İsteyen: **${track.requestedBy}**`);
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
  const channels = [...sourceGuild.channels.cache.values()].filter((c) => c.type !== ChannelType.GuildCategory).sort((a, b) => a.position - b.position);
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
  // 6 kategori → 2 sıra: 3 + 3
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    HELP_CATEGORIES.slice(0, 3).map((cat) =>
      new ButtonBuilder()
        .setCustomId(`help_cat_${cat.key}`)
        .setLabel(`${cat.icon} ${cat.label}`)
        .setStyle(ButtonStyle.Secondary)
    )
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    HELP_CATEGORIES.slice(3).map((cat) =>
      new ButtonBuilder()
        .setCustomId(`help_cat_${cat.key}`)
        .setLabel(`${cat.icon} ${cat.label}`)
        .setStyle(ButtonStyle.Secondary)
    )
  );
  return [row1, row2];
}

async function pfxYardim(m: Message, args: string[]): Promise<void> {
  const prefix = m.guildId ? await getPrefix(m.guildId).catch(() => "v!") : "v!";
  const catKey = args[0]?.toLowerCase();
  if (catKey) {
    const buf = await generateCategoryHelpCard(prefix, catKey);
    if (!buf) {
      await m.reply(`❌ Kategori bulunamadı. Mevcut kategoriler: \`moderasyon\` \`seviye\` \`ekonomi\` \`oyunlar\` \`muzik\` \`yonetim\``);
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
      files: [new AttachmentBuilder(buf, { name: `yardim-${catKey}.png` })],
      components: [backRow],
    });
  } else {
    const buf = await generateHelpCard(prefix);
    await m.reply({
      files: [new AttachmentBuilder(buf, { name: "yardim.png" })],
      components: buildHelpButtons(),
    });
  }
}

// ── GUARD ─────────────────────────────────────────────────────────────────────

const GUARD_MODULES = ["spam", "link", "bot", "emoji", "rol", "kanal"] as const;
type GuardModule = typeof GUARD_MODULES[number];

async function pfxGuard(m: Message, args: string[]): Promise<void> {
  if (!m.guild || !m.member || !m.guildId) return;
  if (!isOwner(m.author.id) && !m.member.permissions.has("Administrator")) {
    await m.reply("❌ Bu komutu kullanmak için **Administrator** yetkisine ihtiyacın var."); return;
  }

  const sub = args[0]?.toLowerCase();

  // v!guard → mevcut durumu göster
  if (!sub || sub === "durum" || sub === "status") {
    const cfg = await getGuard(m.guildId);
    const row = (k: string, enabled: boolean, extra = "") =>
      `${enabled ? "🟢" : "🔴"} **${k}**${extra ? ` — ${extra}` : ""}`;
    let wl: string[] = [];
    try { wl = JSON.parse(cfg.linkWhitelist); } catch { /**/ }
    await m.reply(
      `🛡️ **Guard Durumu** — ${m.guild.name}\n` +
      `${row("spam",  cfg.spamEnabled,  `eşik: ${cfg.spamThreshold} msg/5sn · aksiyon: ${cfg.spamAction}`)}\n` +
      `${row("link",  cfg.linkEnabled,  `aksiyon: ${cfg.linkAction}${wl.length ? ` · whitelist: ${wl.join(", ")}` : ""}`)}\n` +
      `${row("bot",   cfg.botEnabled,   `aksiyon: ${cfg.botAction}`)}\n` +
      `${row("emoji", cfg.emojiEnabled, `max: ${cfg.emojiMax} · aksiyon: ${cfg.emojiAction}`)}\n` +
      `${row("rol",   cfg.roleEnabled)}\n` +
      `${row("kanal", cfg.channelEnabled)}\n` +
      `📋 Log kanalı: ${cfg.logChannelId ? `<#${cfg.logChannelId}>` : "Ayarlanmamış"}\n\n` +
      `Kullanım: \`guard <modül> <aç/kapat> [seçenekler]\`\n` +
      `Modüller: ${GUARD_MODULES.join(", ")}`
    );
    return;
  }

  // v!guard log #kanal
  if (sub === "log") {
    const ch = m.mentions.channels.first();
    if (!ch) { await m.reply("❌ Kullanım: `guard log #kanal`"); return; }
    await setGuard(m.guildId, { logChannelId: ch.id });
    await m.reply(`✅ Guard logları <#${ch.id}> kanalına gönderilecek.`); return;
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

  // varsayılan: kur
  const status = await m.reply("⏳ Stat kanalları oluşturuluyor...");
  try {
    await setupStatChannels(m.guild);
    await status.edit("✅ Stat kanalları hazır! Her 10 dakikada otomatik güncellenir.");
  } catch (err) {
    await status.edit("❌ Kanallar oluşturulurken hata oluştu. Bot'un **Manage Channels** yetkisi olduğundan emin ol.");
  }
}

// ── Prefix handler tablosu ────────────────────────────────────────────────────

const prefixHandlers: Record<string, PfxHandler> = {
  // Level / Profil
  level: (m) => pfxLevel(m), lvl: (m) => pfxLevel(m), rank: (m) => pfxLevel(m),
  profil: (m) => pfxLevel(m), profile: (m) => pfxLevel(m),
  // Leaderboard
  leaderboard: (m) => pfxLeaderboard(m), lb: (m) => pfxLeaderboard(m), top: (m) => pfxLeaderboard(m),
  // Level rol
  levelrol: pfxLevelRol,
  // Sicil
  sicil: (m) => pfxSicil(m),
  // Moderasyon
  ban: pfxBan,
  kick: pfxKick,
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
  // Oyunlar
  rps: pfxRps, tkm: pfxRps,
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
  userinfo: (m) => pfxUserinfo(m), kullanicibilgi: (m) => pfxUserinfo(m), uinfo: (m) => pfxUserinfo(m),
  ping: (m) => pfxPing(m),
  yardim: pfxYardim, yardım: pfxYardim, help: pfxYardim,
  // Guard
  guard: pfxGuard, koruma: pfxGuard,
  // Stat
  stat: pfxStat, istatistik: pfxStat, stats: pfxStat,
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
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.GuildModeration,
      GatewayIntentBits.GuildPresences,
    ],
  });

  client.once(Events.ClientReady, async (c) => {
    logger.info({ tag: c.user.tag }, "Discord botu hazır!");

    const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=8&scope=bot+applications.commands`;
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
        { name: "VBRI & TURKLAND", type: 3 as const },
      ];
      const idx = Math.floor(Date.now() / 30_000) % statuses.length;
      const s = statuses[idx]!;
      c.user.setPresence({ status: "online", activities: [{ name: s.name, type: s.type }] });
    };

    updateStatus();
    setInterval(updateStatus, 30_000);

    // ── Müzik sistemi ön ısınma (ilk çal komutunu hızlandırır) ───────────────
    warmupMusic().catch(() => null);
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

  // ── Yardım butonu etkileşimleri ──────────────────────────────────────────
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;
    const { customId } = interaction;
    if (!customId.startsWith("help_")) return;

    const prefix = interaction.guildId
      ? await getPrefix(interaction.guildId).catch(() => "v!")
      : "v!";

    if (customId === "help_overview") {
      const buf = await generateHelpCard(prefix);
      await interaction.update({
        files: [new AttachmentBuilder(buf, { name: "yardim.png" })],
        components: buildHelpButtons(),
      });
      return;
    }

    const catKey = customId.replace("help_cat_", "");
    const buf = await generateCategoryHelpCard(prefix, catKey);
    if (!buf) {
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
      files: [new AttachmentBuilder(buf, { name: `yardim-${catKey}.png` })],
      components: [backRow],
    });
  });

  // ── Guard: Bot katılım koruması ───────────────────────────────────────────
  client.on(Events.GuildMemberAdd, async (member: GuildMember) => {
    await handleBotJoin(member).catch(() => null);
  });

  // ── Guard: Rol & Kanal saldırısı tespiti ─────────────────────────────────
  client.on(Events.GuildAuditLogEntryCreate, async (entry, guild) => {
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
    }
  });

  // ── Mesaj XP + Guard + Prefix komutlar ───────────────────────────────────
  client.on(Events.MessageCreate, async (message: Message) => {
    if (message.author.bot || !message.guildId) return;
    const prefix = await getPrefix(message.guildId).catch(() => "v!");

    if (message.content.startsWith(prefix)) {
      const args = message.content.slice(prefix.length).trim().split(/\s+/);
      const cmd = args.shift()?.toLowerCase() ?? "";
      const handler = prefixHandlers[cmd];
      if (handler) {
        await handler(message, args).catch((err) => logger.error({ err, cmd }, "Prefix hata"));
        return;
      }
    }

    // Guard kontrolleri (komut olmayan mesajlarda)
    const spamBlocked = await handleSpam(message).catch(() => false);
    if (spamBlocked) return;
    const linkBlocked = await handleLink(message).catch(() => false);
    if (linkBlocked) return;
    await handleEmoji(message).catch(() => null);

    // XP kazanımı
    const result = await handleXp(message.author.id, message.guildId, message.guild ?? undefined).catch(() => null);
    if (result?.leveledUp) {
      try {
        const buf = await generateLevelUpCard({
          username: message.author.displayName,
          avatarUrl: message.author.displayAvatarURL({ extension: "png", size: 256 }),
          oldLevel: result.oldLevel, newLevel: result.newLevel,
        });
        await message.channel.send({ content: `${message.author}`, files: [new AttachmentBuilder(buf, { name: "levelup.png" })] });
      } catch {
        await message.channel.send(`🎉 ${message.author} **${result.newLevel}. seviyeye** ulaştı!`).catch(() => null);
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
