import {
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  AttachmentBuilder,
  TextChannel,
  type ChatInputCommandInteraction,
  type SlashCommandBuilder,
  type Message,
} from "discord.js";
import { logger } from "../lib/logger";
import { handleXp, getUserLevel, getRank, xpToNextLevel, getLeaderboard } from "./leveling";
import { getPrefix } from "./guildSettings";
import { generateProfileCard } from "./profileCard";
import { generateLeaderboardCard, type LeaderboardEntry } from "./leaderboardCard";
import { generateLevelUpCard } from "./levelUpCard";
import { generateSicilCard } from "./sicilCard";
import { logAction, getUserLogs } from "./moderation";
import * as kickCommand from "./commands/kick";
import * as levelCommand from "./commands/level";
import * as leaderboardCommand from "./commands/leaderboard";
import * as setPrefixCommand from "./commands/setprefix";
import * as profilCommand from "./commands/profil";
import * as levelRolCommand from "./commands/levelrol";
import * as banCommand from "./commands/ban";
import * as unbanCommand from "./commands/unban";
import * as timeoutCommand from "./commands/timeout";
import * as untimeoutCommand from "./commands/untimeout";
import * as warnCommand from "./commands/warn";
import * as uyariKaldirCommand from "./commands/uyarikaldir";
import * as sicilCommand from "./commands/sicil";
import * as temizleCommand from "./commands/temizle";

interface Command {
  data: SlashCommandBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

const commands = new Collection<string, Command>();
for (const cmd of [
  kickCommand, levelCommand, leaderboardCommand, setPrefixCommand,
  profilCommand, levelRolCommand, banCommand, unbanCommand,
  timeoutCommand, untimeoutCommand, warnCommand, uyariKaldirCommand,
  sicilCommand, temizleCommand,
]) {
  commands.set((cmd as Command).data.name, cmd as Command);
}

// ─── Prefix handler'lar ──────────────────────────────────────────────────────

async function handlePrefixKick(message: Message, args: string[]): Promise<void> {
  if (!message.guild || !message.member) return;
  if (!message.member.permissions.has("KickMembers")) { await message.reply("❌ **Kick Members** iznin yok."); return; }
  const target = message.mentions.members?.first();
  if (!target) { await message.reply("❌ Kullanım: `kick @kullanici [sebep]`"); return; }
  const sebep = args.slice(1).join(" ") || "Sebep belirtilmedi";
  if (!target.kickable) { await message.reply("❌ Bu kullanıcıyı atamıyorum."); return; }
  if (target.id === message.author.id) { await message.reply("❌ Kendini atamazsın!"); return; }
  await target.kick(sebep);
  await logAction({ guildId: message.guildId!, userId: target.id, moderatorId: message.author.id, action: "kick", reason: sebep });
  await message.reply(`✅ **${target.user.tag}** atıldı. Sebep: ${sebep}`);
}

async function handlePrefixBan(message: Message, args: string[]): Promise<void> {
  if (!message.guild || !message.member) return;
  if (!message.member.permissions.has("BanMembers")) { await message.reply("❌ **Ban Members** iznin yok."); return; }
  const target = message.mentions.users.first();
  if (!target) { await message.reply("❌ Kullanım: `ban @kullanici [sebep]`"); return; }
  const sebep = args.slice(1).join(" ") || "Sebep belirtilmedi";
  await message.guild.bans.create(target.id, { reason: sebep });
  await logAction({ guildId: message.guildId!, userId: target.id, moderatorId: message.author.id, action: "ban", reason: sebep });
  await message.reply(`🔨 **${target.tag}** yasaklandı. Sebep: ${sebep}`);
}

async function handlePrefixWarn(message: Message, args: string[]): Promise<void> {
  if (!message.guildId || !message.member) return;
  if (!message.member.permissions.has("ModerateMembers")) { await message.reply("❌ **Moderate Members** iznin yok."); return; }
  const target = message.mentions.users.first();
  if (!target) { await message.reply("❌ Kullanım: `warn @kullanici [sebep]`"); return; }
  const sebep = args.slice(1).join(" ") || "Sebep belirtilmedi";
  const log = await logAction({ guildId: message.guildId, userId: target.id, moderatorId: message.author.id, action: "warn", reason: sebep });
  await message.reply(`⚠️ **${target.tag}** uyarıldı. Sebep: ${sebep} | ID: #${log.id}`);
  try { await target.send(`⚠️ **${message.guild?.name}** sunucusunda uyarı aldın!\nSebep: ${sebep} | #${log.id}`); } catch { /* dm kapalı */ }
}

async function handlePrefixLevel(message: Message): Promise<void> {
  if (!message.guildId) return;
  const target = message.mentions.users.first() ?? message.author;
  const userData = await getUserLevel(target.id, message.guildId);
  const rank = await getRank(target.id, message.guildId);
  const { current, needed } = xpToNextLevel(userData.xp, userData.level);
  const buffer = await generateProfileCard({
    username: target.displayName,
    avatarUrl: target.displayAvatarURL({ extension: "png", size: 256 }),
    level: userData.level, xp: current, xpNeeded: needed, rank, messageCount: userData.messageCount,
  });
  await message.reply({ files: [new AttachmentBuilder(buffer, { name: "level.png" })] });
}

async function handlePrefixProfil(message: Message): Promise<void> {
  return handlePrefixLevel(message);
}

async function handlePrefixLeaderboard(message: Message): Promise<void> {
  if (!message.guildId) return;
  const top = await getLeaderboard(message.guildId, 10);
  if (top.length === 0) { await message.reply("Henüz kimse mesaj atmamış! 🦗"); return; }

  const entries: LeaderboardEntry[] = await Promise.all(
    top.map(async (entry, i) => {
      let username = `Kullanıcı`;
      let avatarUrl = "";
      try {
        const user = await message.client.users.fetch(entry.userId);
        username = user.displayName;
        avatarUrl = user.displayAvatarURL({ extension: "png", size: 64 });
      } catch { /* ignore */ }
      const { current, needed } = xpToNextLevel(entry.xp, entry.level);
      return { rank: i + 1, userId: entry.userId, username, avatarUrl, level: entry.level, xp: entry.xp, xpCurrent: current, xpNeeded: needed };
    }),
  );

  const buffer = await generateLeaderboardCard(entries);
  await message.reply({ files: [new AttachmentBuilder(buffer, { name: "leaderboard.png" })] });
}

async function handlePrefixSicil(message: Message): Promise<void> {
  if (!message.guildId || !message.member) return;
  if (!message.member.permissions.has("ModerateMembers")) { await message.reply("❌ **Moderate Members** iznin yok."); return; }
  const target = message.mentions.users.first();
  if (!target) { await message.reply("❌ Kullanım: `sicil @kullanici`"); return; }
  const logs = await getUserLogs(target.id, message.guildId);
  const buffer = await generateSicilCard({ username: target.displayName, avatarUrl: target.displayAvatarURL({ extension: "png", size: 256 }), logs });
  await message.reply({ files: [new AttachmentBuilder(buffer, { name: "sicil.png" })] });
}

async function handlePrefixTemizle(message: Message, args: string[]): Promise<void> {
  if (!message.guild || !message.member || !(message.channel instanceof TextChannel)) return;
  if (!message.member.permissions.has("ManageMessages")) { await message.reply("❌ **Manage Messages** iznin yok."); return; }
  const adet = Math.min(parseInt(args[0] ?? "10") || 10, 100);
  const msgs = await message.channel.messages.fetch({ limit: adet + 1 });
  const deleted = await message.channel.bulkDelete(msgs, true);
  const reply = await message.channel.send(`🗑️ **${Math.max(deleted.size - 1, 0)}** mesaj silindi.`);
  setTimeout(() => reply.delete().catch(() => null), 4000);
}

async function handlePrefixSetPrefix(message: Message, args: string[]): Promise<void> {
  if (!message.guildId || !message.member) return;
  if (!message.member.permissions.has("ManageGuild")) { await message.reply("❌ **Manage Server** iznin yok."); return; }
  const newPrefix = args[0];
  if (!newPrefix || newPrefix.length > 5) { await message.reply("❌ Kullanım: `setprefix <yeni_prefix>` (maks. 5 karakter)"); return; }
  const { setPrefix, getPrefix: gp } = await import("./guildSettings");
  const oldPrefix = await gp(message.guildId);
  await setPrefix(message.guildId, newPrefix);
  await message.reply(`✅ Prefix **\`${oldPrefix}\`** → **\`${newPrefix}\`** olarak değiştirildi.`);
}

const prefixHandlers: Record<string, (message: Message, args: string[]) => Promise<void>> = {
  kick: handlePrefixKick,
  ban: handlePrefixBan,
  warn: handlePrefixWarn,
  level: (m) => handlePrefixLevel(m),
  lvl: (m) => handlePrefixLevel(m),
  profil: (m) => handlePrefixProfil(m),
  profile: (m) => handlePrefixProfil(m),
  rank: (m) => handlePrefixLevel(m),
  leaderboard: (m) => handlePrefixLeaderboard(m),
  lb: (m) => handlePrefixLeaderboard(m),
  top: (m) => handlePrefixLeaderboard(m),
  sicil: (m) => handlePrefixSicil(m),
  temizle: handlePrefixTemizle,
  clear: handlePrefixTemizle,
  setprefix: handlePrefixSetPrefix,
};

// ─── Bot başlatma ─────────────────────────────────────────────────────────────

export async function startBot(): Promise<void> {
  const token = process.env["DISCORD_TOKEN"];
  const clientId = process.env["DISCORD_CLIENT_ID"];
  if (!token) { logger.warn("DISCORD_TOKEN is not set — Discord bot will not start."); return; }
  if (!clientId) { logger.warn("DISCORD_CLIENT_ID is not set — Discord bot will not start."); return; }

  const rest = new REST().setToken(token);
  const commandData = [...commands.values()].map((cmd) => cmd.data.toJSON());

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once(Events.ClientReady, async (c) => {
    logger.info({ tag: c.user.tag }, "Discord botu hazır!");
    for (const guild of c.guilds.cache.values()) {
      try {
        await rest.put(Routes.applicationGuildCommands(clientId, guild.id), { body: commandData });
        logger.info({ guildId: guild.id, name: guild.name }, "Komutlar sunucuya kaydedildi");
      } catch (err) {
        logger.error({ err, guildId: guild.id }, "Sunucuya komut kaydedilemedi");
      }
    }
  });

  client.on(Events.MessageCreate, async (message: Message) => {
    if (message.author.bot || !message.guildId) return;

    const prefix = await getPrefix(message.guildId).catch(() => "v!");

    // Prefix komutu mu?
    if (message.content.startsWith(prefix)) {
      const [commandName, ...args] = message.content.slice(prefix.length).trim().split(/\s+/);
      const handler = prefixHandlers[commandName?.toLowerCase() ?? ""];
      if (handler) {
        await handler(message, args).catch((err) => logger.error({ err, commandName }, "Prefix komut hatası"));
        return; // prefix komutlarında XP verme
      }
    }

    // Her mesajda XP ver (spam koruması yok)
    const result = await handleXp(message.author.id, message.guildId, message.guild ?? undefined).catch(
      (err) => { logger.error({ err }, "XP hatası"); return null; },
    );

    if (result?.leveledUp) {
      try {
        const buffer = await generateLevelUpCard({
          username: message.author.displayName,
          avatarUrl: message.author.displayAvatarURL({ extension: "png", size: 256 }),
          oldLevel: result.oldLevel,
          newLevel: result.newLevel,
        });
        await message.channel.send({
          content: `${message.author}`,
          files: [new AttachmentBuilder(buffer, { name: "levelup.png" })],
        });
      } catch {
        await message.channel.send(`🎉 Tebrikler ${message.author}! **${result.newLevel}. seviyeye** ulaştın!`).catch(() => null);
      }
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const command = commands.get(interaction.commandName);
    if (!command) return;
    try {
      await command.execute(interaction);
    } catch (err) {
      logger.error({ err, command: interaction.commandName }, "Komut hatası");
      const msg = { content: "❌ Komut çalıştırılırken bir hata oluştu.", ephemeral: true };
      if (interaction.replied || interaction.deferred) await interaction.followUp(msg);
      else await interaction.reply(msg);
    }
  });

  await client.login(token);
}
