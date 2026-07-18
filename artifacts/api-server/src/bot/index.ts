import {
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  AttachmentBuilder,
  type ChatInputCommandInteraction,
  type SlashCommandBuilder,
  type Message,
} from "discord.js";
import { logger } from "../lib/logger";
import { handleXp, getUserLevel, getRank, xpToNextLevel, getLeaderboard } from "./leveling";
import { getPrefix } from "./guildSettings";
import { generateProfileCard } from "./profileCard";
import * as kickCommand from "./commands/kick";
import * as levelCommand from "./commands/level";
import * as leaderboardCommand from "./commands/leaderboard";
import * as setPrefixCommand from "./commands/setprefix";
import * as profilCommand from "./commands/profil";
import * as levelRolCommand from "./commands/levelrol";

interface Command {
  data: SlashCommandBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

const commands = new Collection<string, Command>();
commands.set(kickCommand.data.name, kickCommand as Command);
commands.set(levelCommand.data.name, levelCommand as Command);
commands.set(leaderboardCommand.data.name, leaderboardCommand as Command);
commands.set(setPrefixCommand.data.name, setPrefixCommand as Command);
commands.set(profilCommand.data.name, profilCommand as Command);
commands.set(levelRolCommand.data.name, levelRolCommand as Command);

// ─── Prefix komut handler'ları ────────────────────────────────────────────────

async function handlePrefixKick(message: Message, args: string[]): Promise<void> {
  if (!message.guild || !message.member) return;
  if (!message.member.permissions.has("KickMembers")) {
    await message.reply("❌ Bu komutu kullanmak için **Kick Members** iznin olmalı.");
    return;
  }
  const target = message.mentions.members?.first();
  if (!target) { await message.reply("❌ Kullanım: `kick @kullanici [sebep]`"); return; }
  const sebep = args.slice(1).join(" ") || "Sebep belirtilmedi";
  if (!target.kickable) { await message.reply("❌ Bu kullanıcıyı atamıyorum. Rolü botunkinden yüksek olabilir."); return; }
  if (target.id === message.author.id) { await message.reply("❌ Kendini atamazsın!"); return; }
  await target.kick(sebep);
  await message.reply(`✅ **${target.user.tag}** sunucudan atıldı.\n📝 Sebep: ${sebep}`);
}

async function handlePrefixLevel(message: Message): Promise<void> {
  if (!message.guildId) return;
  const target = message.mentions.users.first() ?? message.author;
  const userData = await getUserLevel(target.id, message.guildId);
  const rank = await getRank(target.id, message.guildId);
  const { current, needed } = xpToNextLevel(userData.xp, userData.level);
  const filled = Math.round((current / needed) * 12);
  const bar = "█".repeat(filled) + "░".repeat(12 - filled);
  const pct = Math.round((current / needed) * 100);
  await message.reply(
    `👤 **${target.displayName}**\n` +
    `🏅 Sıra: **#${rank}** · ⭐ Seviye: **${userData.level}** · 💬 Mesaj: **${userData.messageCount.toLocaleString()}**\n` +
    `✨ XP: **${current.toLocaleString()}** / ${needed.toLocaleString()}\n` +
    `[${bar}] %${pct}`,
  );
}

async function handlePrefixProfil(message: Message): Promise<void> {
  if (!message.guildId) return;
  const target = message.mentions.users.first() ?? message.author;
  const userData = await getUserLevel(target.id, message.guildId);
  const rank = await getRank(target.id, message.guildId);
  const { current, needed } = xpToNextLevel(userData.xp, userData.level);
  const avatarUrl = target.displayAvatarURL({ extension: "png", size: 256 });
  const buffer = await generateProfileCard({
    username: target.displayName,
    avatarUrl,
    level: userData.level,
    xp: current,
    xpNeeded: needed,
    rank,
    messageCount: userData.messageCount,
  });
  await message.reply({ files: [new AttachmentBuilder(buffer, { name: "profil.png" })] });
}

async function handlePrefixLeaderboard(message: Message): Promise<void> {
  if (!message.guildId) return;
  const top = await getLeaderboard(message.guildId, 10);
  if (top.length === 0) { await message.reply("Henüz kimse mesaj atmamış! 🦗"); return; }
  const medals = ["🥇", "🥈", "🥉"];
  const lines = await Promise.all(
    top.map(async (entry, i) => {
      const medal = medals[i] ?? `**${i + 1}.**`;
      let name: string;
      try { name = (await message.client.users.fetch(entry.userId)).displayName; }
      catch { name = `<@${entry.userId}>`; }
      return `${medal} **${name}** — Seviye **${entry.level}** · ${entry.xp.toLocaleString()} XP`;
    }),
  );
  await message.reply(`🏆 **Liderboard**\n\n${lines.join("\n")}`);
}

async function handlePrefixSetPrefix(message: Message, args: string[]): Promise<void> {
  if (!message.guildId || !message.member) return;
  if (!message.member.permissions.has("ManageGuild")) {
    await message.reply("❌ Bu komutu kullanmak için **Manage Server** iznin olmalı.");
    return;
  }
  const newPrefix = args[0];
  if (!newPrefix || newPrefix.length > 5) { await message.reply("❌ Kullanım: `setprefix <yeni_prefix>` (maks. 5 karakter)"); return; }
  const { setPrefix, getPrefix: gp } = await import("./guildSettings");
  const oldPrefix = await gp(message.guildId);
  await setPrefix(message.guildId, newPrefix);
  await message.reply(`✅ Prefix **\`${oldPrefix}\`** → **\`${newPrefix}\`** olarak değiştirildi.`);
}

const prefixHandlers: Record<string, (message: Message, args: string[]) => Promise<void>> = {
  kick: handlePrefixKick,
  level: (m) => handlePrefixLevel(m),
  lvl: (m) => handlePrefixLevel(m),
  profil: (m) => handlePrefixProfil(m),
  profile: (m) => handlePrefixProfil(m),
  leaderboard: (m) => handlePrefixLeaderboard(m),
  lb: (m) => handlePrefixLeaderboard(m),
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

  // READY: guild komutlarını anında kaydet
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

  // Mesaj: XP + prefix komutlar
  client.on(Events.MessageCreate, async (message: Message) => {
    if (message.author.bot || !message.guildId) return;

    const prefix = await getPrefix(message.guildId).catch(() => "v!");

    if (message.content.startsWith(prefix)) {
      const [commandName, ...args] = message.content.slice(prefix.length).trim().split(/\s+/);
      const handler = prefixHandlers[commandName?.toLowerCase() ?? ""];
      if (handler) {
        await handler(message, args).catch((err) =>
          logger.error({ err, commandName }, "Prefix komut hatası"),
        );
        return; // prefix komutlarda XP verme
      }
    }

    // XP ver
    const result = await handleXp(message.author.id, message.guildId, message.guild ?? undefined).catch(
      (err) => { logger.error({ err }, "XP hatası"); return null; },
    );
    if (result?.leveledUp) {
      await message.channel
        .send(`🎉 Tebrikler ${message.author}! **${result.newLevel}. seviyeye** ulaştın!`)
        .catch(() => null);
    }
  });

  // Slash komutları
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
