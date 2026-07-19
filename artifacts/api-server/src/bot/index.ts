import {
  Client, Collection, Events, GatewayIntentBits, REST, Routes,
  AttachmentBuilder, TextChannel, ChannelType,
  type ChatInputCommandInteraction, type SlashCommandBuilder, type Message,
} from "discord.js";
import { logger } from "../lib/logger";
import { handleXp, getUserLevel, getRank, xpToNextLevel, getLeaderboard } from "./leveling";
import { getPrefix, setPrefix as setPrefixUtil } from "./guildSettings";
import { generateProfileCard } from "./profileCard";
import { generateLeaderboardCard, type LeaderboardEntry } from "./leaderboardCard";
import { generateLevelUpCard } from "./levelUpCard";
import { generateSicilCard } from "./sicilCard";
import { generateHelpCard } from "./helpCard";
import { logAction, getUserLogs } from "./moderation";
import { getBalance, addCoins, claimDaily } from "./economy";

// ── Slash komutları ───────────────────────────────────────────────────────────
import * as kickCmd from "./commands/kick";
import * as levelCmd from "./commands/level";
import * as leaderboardCmd from "./commands/leaderboard";
import * as setPrefixCmd from "./commands/setprefix";
import * as profilCmd from "./commands/profil";
import * as levelRolCmd from "./commands/levelrol";
import * as banCmd from "./commands/ban";
import * as unbanCmd from "./commands/unban";
import * as timeoutCmd from "./commands/timeout";
import * as untimeoutCmd from "./commands/untimeout";
import * as warnCmd from "./commands/warn";
import * as uyariKaldirCmd from "./commands/uyarikaldir";
import * as sicilCmd from "./commands/sicil";
import * as temizleCmd from "./commands/temizle";
import * as yardimCmd from "./commands/yardim";
import * as nukeCmd from "./commands/nuke";
import * as kilitleCmd from "./commands/kilitle";
import * as acCmd from "./commands/ac";
import * as gunlukodulCmd from "./commands/gunlukodul";
import * as bakiyeCmd from "./commands/bakiye";
import * as transferCmd from "./commands/transfer";
import * as kumarCmd from "./commands/kumar";
import * as duelCmd from "./commands/duel";
import * as ruletCmd from "./commands/rulet";
import * as zarCmd from "./commands/zar";
import * as top8Cmd from "./commands/top8";
import * as rpsCmd from "./commands/rps";
import * as patlaCmd from "./commands/patla";
import * as coinflipCmd from "./commands/coinflip";
import * as blackjackCmd from "./commands/blackjack";
import * as sunucukopyalaCmd from "./commands/sunucukopyala";
import { isOwner } from "./ownerUtils";

interface Command {
  data: SlashCommandBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

const SLASH_COMMANDS = [
  kickCmd, levelCmd, leaderboardCmd, setPrefixCmd, profilCmd, levelRolCmd,
  banCmd, unbanCmd, timeoutCmd, untimeoutCmd, warnCmd, uyariKaldirCmd,
  sicilCmd, temizleCmd, yardimCmd, nukeCmd, kilitleCmd, acCmd,
  gunlukodulCmd, bakiyeCmd, transferCmd, kumarCmd, duelCmd, ruletCmd,
  zarCmd, top8Cmd, rpsCmd, patlaCmd,
  coinflipCmd, blackjackCmd, sunucukopyalaCmd,
];

const commands = new Collection<string, Command>();
for (const cmd of SLASH_COMMANDS) commands.set((cmd as Command).data.name, cmd as Command);

// ── Ses XP takibi (in-memory) ─────────────────────────────────────────────────
const voiceSessions = new Map<string, number>(); // `${userId}:${guildId}` → joinTimestamp(ms)
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

// ── Prefix handler yardımcılar ────────────────────────────────────────────────

async function pfxLevel(m: Message): Promise<void> {
  if (!m.guildId) return;
  const target = m.mentions.users.first() ?? m.author;
  const ud = await getUserLevel(target.id, m.guildId);
  const rank = await getRank(target.id, m.guildId);
  const { current, needed } = xpToNextLevel(ud.xp, ud.level);
  const bal = await getBalance(target.id, m.guildId).catch(() => ({ coins: 0 }));
  const buf = await generateProfileCard({
    username: target.displayName,
    avatarUrl: target.displayAvatarURL({ extension: "png", size: 256 }),
    level: ud.level, xp: current, xpNeeded: needed, rank,
    messageCount: ud.messageCount, coins: bal.coins,
  });
  await m.reply({ files: [new AttachmentBuilder(buf, { name: "level.png" })] });
}

async function pfxLeaderboard(m: Message): Promise<void> {
  if (!m.guildId) return;
  const top = await getLeaderboard(m.guildId, 10);
  if (!top.length) { await m.reply("Henüz kimse mesaj atmamış! 🦗"); return; }
  const entries: LeaderboardEntry[] = await Promise.all(top.map(async (e, i) => {
    let username = "Kullanıcı"; let avatarUrl = "";
    try { const u = await m.client.users.fetch(e.userId); username = u.displayName; avatarUrl = u.displayAvatarURL({ extension: "png", size: 64 }); } catch { /**/ }
    const { current, needed } = xpToNextLevel(e.xp, e.level);
    return { rank: i+1, userId: e.userId, username, avatarUrl, level: e.level, xp: e.xp, xpCurrent: current, xpNeeded: needed };
  }));
  const buf = await generateLeaderboardCard(entries);
  await m.reply({ files: [new AttachmentBuilder(buf, { name: "lb.png" })] });
}

async function pfxSicil(m: Message): Promise<void> {
  if (!m.guildId || !m.member) return;
  if (!isOwner(m.author.id) && !m.member.permissions.has("ModerateMembers")) { await m.reply("❌ **Moderate Members** iznin yok."); return; }
  const target = m.mentions.users.first();
  if (!target) { await m.reply("❌ Kullanım: `sicil @kullanici`"); return; }
  const logs = await getUserLogs(target.id, m.guildId);
  const buf = await generateSicilCard({ username: target.displayName, avatarUrl: target.displayAvatarURL({ extension: "png", size: 256 }), logs });
  await m.reply({ files: [new AttachmentBuilder(buf, { name: "sicil.png" })] });
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
  const guildOwner = m.guild.ownerId === m.author.id;
  const isAdmin = m.member?.permissions.has("Administrator") ?? false;
  if (!isOwner(m.author.id) && !guildOwner && !isAdmin) { await m.reply("❌ Sadece sunucu sahibi veya yöneticiler kullanabilir."); return; }
  const ch = m.channel;
  const { name, topic, nsfw, rateLimitPerUser, position, parentId } = ch;
  const overwrites = ch.permissionOverwrites.cache.map((o) => ({ id: o.id, allow: o.allow, deny: o.deny, type: o.type }));
  await ch.delete(`Nuke — ${m.author.tag}`);
  const newCh = await m.guild.channels.create({ name, type: ChannelType.GuildText, topic: topic ?? undefined, nsfw, rateLimitPerUser, position, parent: parentId ?? undefined, permissionOverwrites: overwrites });
  await newCh.send("💥 **NUKE!** Kanal temizlendi ve yeniden oluşturuldu.");
}

async function pfxSunucuKur(m: Message): Promise<void> {
  if (!m.guild || !m.member) return;
  const guildOwner2 = m.guild.ownerId === m.author.id;
  const isAdmin2 = m.member.permissions.has("Administrator");
  if (!isOwner(m.author.id) && !guildOwner2 && !isAdmin2) { await m.reply("❌ Sadece sunucu sahibi veya yöneticiler kullanabilir."); return; }
  const status = await m.reply("⏳ Kategori ve kanallar oluşturuluyor...");
  let created = 0;
  for (const catDef of SUNUCU_YAPISI) {
    const cat = await m.guild.channels.create({ name: catDef.name, type: ChannelType.GuildCategory, reason: `sunucukur — ${m.author.tag}` }).catch(() => null);
    if (!cat) continue;
    created++;
    for (const ch of catDef.channels) {
      await m.guild.channels.create({ name: ch.name, type: ch.voice ? ChannelType.GuildVoice : ChannelType.GuildText, parent: cat.id, reason: `sunucukur — ${m.author.tag}` }).catch(() => null);
      created++;
    }
  }
  await status.edit(`✅ Tamamlandı! **${created}** kategori/kanal oluşturuldu.`);
}

const prefixHandlers: Record<string, (m: Message, args: string[]) => Promise<void>> = {
  level: (m) => pfxLevel(m), lvl: (m) => pfxLevel(m), rank: (m) => pfxLevel(m),
  profil: (m) => pfxLevel(m), profile: (m) => pfxLevel(m),
  leaderboard: (m) => pfxLeaderboard(m), lb: (m) => pfxLeaderboard(m), top: (m) => pfxLeaderboard(m),
  sicil: (m) => pfxSicil(m),
  temizle: pfxTemizle, clear: pfxTemizle,
  nuke: (m) => pfxNuke(m),
  sunucukur: (m) => pfxSunucuKur(m),
  yardim: async (m) => {
    const prefix = m.guildId ? await getPrefix(m.guildId).catch(() => "v!") : "v!";
    const buf = await generateHelpCard(prefix);
    await m.reply({ files: [new AttachmentBuilder(buf, { name: "yardim.png" })] });
  },
  yardım: async (m) => {
    const prefix = m.guildId ? await getPrefix(m.guildId).catch(() => "v!") : "v!";
    const buf = await generateHelpCard(prefix);
    await m.reply({ files: [new AttachmentBuilder(buf, { name: "yardim.png" })] });
  },
  help: async (m) => {
    const prefix = m.guildId ? await getPrefix(m.guildId).catch(() => "v!") : "v!";
    const buf = await generateHelpCard(prefix);
    await m.reply({ files: [new AttachmentBuilder(buf, { name: "yardim.png" })] });
  },
  ban: async (m, args) => {
    if (!m.guild || !m.member) return;
    if (!isOwner(m.author.id) && !m.member.permissions.has("BanMembers")) { await m.reply("❌ **Ban Members** iznin yok."); return; }
    const target = m.mentions.users.first();
    if (!target) { await m.reply("❌ Kullanım: `ban @kullanici [sebep]`"); return; }
    const sebep = args.slice(1).join(" ") || "Sebep belirtilmedi";
    await m.guild.bans.create(target.id, { reason: sebep });
    await logAction({ guildId: m.guildId!, userId: target.id, moderatorId: m.author.id, action: "ban", reason: sebep });
    await m.reply(`🔨 **${target.tag}** yasaklandı. Sebep: ${sebep}`);
  },
  kick: async (m, args) => {
    if (!m.guild || !m.member) return;
    if (!isOwner(m.author.id) && !m.member.permissions.has("KickMembers")) { await m.reply("❌ **Kick Members** iznin yok."); return; }
    const target = m.mentions.members?.first();
    if (!target) { await m.reply("❌ Kullanım: `kick @kullanici [sebep]`"); return; }
    const sebep = args.slice(1).join(" ") || "Sebep belirtilmedi";
    if (!target.kickable && !isOwner(m.author.id)) { await m.reply("❌ Bu kullanıcıyı atamıyorum."); return; }
    await target.kick(sebep);
    await logAction({ guildId: m.guildId!, userId: target.id, moderatorId: m.author.id, action: "kick", reason: sebep });
    await m.reply(`👢 **${target.user.tag}** atıldı. Sebep: ${sebep}`);
  },
  warn: async (m, args) => {
    if (!m.guildId || !m.member) return;
    if (!isOwner(m.author.id) && !m.member.permissions.has("ModerateMembers")) { await m.reply("❌ **Moderate Members** iznin yok."); return; }
    const target = m.mentions.users.first();
    if (!target) { await m.reply("❌ Kullanım: `warn @kullanici [sebep]`"); return; }
    const sebep = args.slice(1).join(" ") || "Sebep belirtilmedi";
    const log = await logAction({ guildId: m.guildId, userId: target.id, moderatorId: m.author.id, action: "warn", reason: sebep });
    await m.reply(`⚠️ **${target.tag}** uyarıldı. Sebep: ${sebep} | #${log.id}`);
    try { await target.send(`⚠️ **${m.guild?.name}** sunucusunda uyarı aldın!\nSebep: ${sebep} | #${log.id}`); } catch { /**/ }
  },
  gunlukodul: async (m) => {
    if (!m.guildId) return;
    const r = await claimDaily(m.author.id, m.guildId);
    if (r.alreadyClaimed) { await m.reply("⏰ Zaten aldın! 20 saat sonra tekrar dene."); return; }
    const bal = await getBalance(m.author.id, m.guildId);
    await m.reply(`🎁 **+${r.reward.toLocaleString("tr-TR")}** ⬤V | Seri: ${r.streak} gün | Bakiye: **${bal.coins.toLocaleString("tr-TR")} ⬤V**`);
  },
  bakiye: async (m) => {
    if (!m.guildId) return;
    const target = m.mentions.users.first() ?? m.author;
    const bal = await getBalance(target.id, m.guildId);
    await m.reply(`💳 **${target.displayName}** — **${bal.coins.toLocaleString("tr-TR")} ⬤V** | Seri: ${bal.streak} gün`);
  },
  setprefix: async (m, args) => {
    if (!m.guildId || !m.member) return;
    if (!isOwner(m.author.id) && !m.member.permissions.has("ManageGuild")) { await m.reply("❌ **Manage Server** iznin yok."); return; }
    const np = args[0];
    if (!np || np.length > 5) { await m.reply("❌ Kullanım: `setprefix <yeni>` (maks 5 karakter)"); return; }
    const old = await getPrefix(m.guildId);
    await setPrefixUtil(m.guildId, np);
    await m.reply(`✅ Prefix **\`${old}\`** → **\`${np}\`** olarak değiştirildi.`);
  },
};

// ── Bot başlatma ──────────────────────────────────────────────────────────────

export async function startBot(): Promise<void> {
  const token = process.env["DISCORD_TOKEN"];
  const clientId = process.env["DISCORD_CLIENT_ID"];
  if (!token) { logger.warn("DISCORD_TOKEN eksik — bot başlamayacak."); return; }
  if (!clientId) { logger.warn("DISCORD_CLIENT_ID eksik — bot başlamayacak."); return; }

  const rest = new REST().setToken(token);
  const commandData = [...commands.values()].map((c) => c.data.toJSON());

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildVoiceStates,
    ],
  });

  client.once(Events.ClientReady, async (c) => {
    logger.info({ tag: c.user.tag }, "Discord botu hazır!");

    c.user.setPresence({ status: "online", activities: [{ name: "VBRI and TURKLAND", type: 3 }] });

    const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=8&scope=bot+applications.commands`;
    logger.info({ inviteUrl }, "Davet URL:");

    // Global slash komut kaydı
    try {
      await rest.put(Routes.applicationCommands(clientId), { body: commandData });
      logger.info({ count: commandData.length }, `✅ ${commandData.length} global slash komut kaydedildi`);
    } catch (err) {
      logger.error({ err }, "Global komut kaydı başarısız");
    }
  });

  // ── Ses XP ───────────────────────────────────────────────────────────────
  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    const userId = newState.member?.id ?? oldState.member?.id;
    const guildId = newState.guild.id;
    if (!userId || newState.member?.user.bot) return;
    const key = `${userId}:${guildId}`;

    const joinedChannel = !oldState.channelId && newState.channelId;
    const leftChannel = oldState.channelId && !newState.channelId;

    if (joinedChannel) {
      voiceSessions.set(key, Date.now());
    } else if (leftChannel) {
      const start = voiceSessions.get(key);
      if (!start) return;
      voiceSessions.delete(key);
      const minutes = Math.floor((Date.now() - start) / 60000);
      if (minutes < 1) return;
      const xpGain = minutes * VOICE_XP_PER_MIN;
      const result = await handleXp(userId, guildId, newState.guild, xpGain).catch(() => null);
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

  // ── Mesaj XP + Prefix ────────────────────────────────────────────────────
  client.on(Events.MessageCreate, async (message: Message) => {
    if (message.author.bot || !message.guildId) return;
    const prefix = await getPrefix(message.guildId).catch(() => "v!");

    if (message.content.startsWith(prefix)) {
      const [cmd, ...args] = message.content.slice(prefix.length).trim().split(/\s+/);
      const handler = prefixHandlers[cmd?.toLowerCase() ?? ""];
      if (handler) {
        await handler(message, args).catch((err) => logger.error({ err, cmd }, "Prefix hata"));
        return;
      }
    }

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

  // ── Slash interaction ─────────────────────────────────────────────────────
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const command = commands.get(interaction.commandName);
    if (!command) return;
    try { await command.execute(interaction); }
    catch (err) {
      logger.error({ err, cmd: interaction.commandName }, "Slash hata");
      const msg = { content: "❌ Bir hata oluştu.", ephemeral: true };
      if (interaction.replied || interaction.deferred) await interaction.followUp(msg).catch(() => null);
      else await interaction.reply(msg).catch(() => null);
    }
  });

  await client.login(token);
}
