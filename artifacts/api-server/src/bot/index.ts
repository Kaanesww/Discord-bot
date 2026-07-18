import {
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  type ChatInputCommandInteraction,
  type SlashCommandBuilder,
  type Message,
} from "discord.js";
import { logger } from "../lib/logger";
import { handleXp } from "./leveling";
import { getPrefix } from "./guildSettings";
import * as kickCommand from "./commands/kick";
import * as levelCommand from "./commands/level";
import * as leaderboardCommand from "./commands/leaderboard";
import * as setPrefixCommand from "./commands/setprefix";

interface Command {
  data: SlashCommandBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  prefixExecute?: (message: Message, args: string[]) => Promise<void>;
}

const commands = new Collection<string, Command>();
commands.set(kickCommand.data.name, kickCommand as Command);
commands.set(levelCommand.data.name, levelCommand as Command);
commands.set(leaderboardCommand.data.name, leaderboardCommand as Command);
commands.set(setPrefixCommand.data.name, setPrefixCommand as Command);

// Prefix komutları için ayrı handler'lar
async function handlePrefixKick(message: Message, args: string[]): Promise<void> {
  if (!message.guild || !message.member) return;

  if (!message.member.permissions.has("KickMembers")) {
    await message.reply("❌ Bu komutu kullanmak için **Kick Members** iznin olmalı.");
    return;
  }

  const target = message.mentions.members?.first();
  if (!target) {
    await message.reply("❌ Kullanım: `kick @kullanici [sebep]`");
    return;
  }

  const sebep = args.slice(1).join(" ") || "Sebep belirtilmedi";

  if (!target.kickable) {
    await message.reply("❌ Bu kullanıcıyı atamıyorum. Rolü botunkinden yüksek olabilir.");
    return;
  }

  if (target.id === message.author.id) {
    await message.reply("❌ Kendini atamazsın!");
    return;
  }

  await target.kick(sebep);
  await message.reply(`✅ **${target.user.tag}** sunucudan atıldı.\n📝 Sebep: ${sebep}`);
}

async function handlePrefixLevel(message: Message, args: string[]): Promise<void> {
  if (!message.guildId) return;

  const target = message.mentions.users.first() ?? message.author;
  const { getUserLevel } = await import("./leveling");
  const data = await getUserLevel(target.id, message.guildId);
  const xpForNext = 100 * (data.level + 1) * (data.level + 1);
  const filled = Math.round((data.xp / xpForNext) * 10);
  const bar = `[${"█".repeat(filled)}${"░".repeat(10 - filled)}]`;

  await message.reply(
    `👤 **${target.username}** — Seviye **${data.level}**\n` +
    `✨ XP: **${data.xp}** / ${xpForNext}\n${bar}`,
  );
}

async function handlePrefixLeaderboard(message: Message): Promise<void> {
  if (!message.guildId) return;

  const { getLeaderboard } = await import("./leveling");
  const top = await getLeaderboard(message.guildId, 10);

  if (top.length === 0) {
    await message.reply("Henüz kimse mesaj atmamış! 🦗");
    return;
  }

  const medals = ["🥇", "🥈", "🥉"];
  const lines = await Promise.all(
    top.map(async (entry, i) => {
      const medal = medals[i] ?? `**${i + 1}.**`;
      let name: string;
      try {
        const user = await message.client.users.fetch(entry.userId);
        name = user.username;
      } catch {
        name = `<@${entry.userId}>`;
      }
      return `${medal} ${name} — Seviye **${entry.level}** · ${entry.xp} XP`;
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
  if (!newPrefix || newPrefix.length > 5) {
    await message.reply("❌ Kullanım: `setprefix <yeni_prefix>` (maks. 5 karakter)");
    return;
  }

  const { setPrefix, getPrefix: gp } = await import("./guildSettings");
  const oldPrefix = await gp(message.guildId);
  await setPrefix(message.guildId, newPrefix);

  await message.reply(
    `✅ Prefix **\`${oldPrefix}\`** → **\`${newPrefix}\`** olarak değiştirildi.`,
  );
}

const prefixHandlers: Record<
  string,
  (message: Message, args: string[]) => Promise<void>
> = {
  kick: handlePrefixKick,
  level: handlePrefixLevel,
  leaderboard: handlePrefixLeaderboard,
  lb: handlePrefixLeaderboard,
  setprefix: handlePrefixSetPrefix,
};

export async function startBot(): Promise<void> {
  const token = process.env["DISCORD_TOKEN"];
  const clientId = process.env["DISCORD_CLIENT_ID"];

  if (!token) {
    logger.warn("DISCORD_TOKEN is not set — Discord bot will not start.");
    return;
  }

  if (!clientId) {
    logger.warn("DISCORD_CLIENT_ID is not set — Discord bot will not start.");
    return;
  }

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

  // READY'de guild komutları olarak kaydet — anında aktif olur (global 1 saate kadar sürer)
  client.once(Events.ClientReady, async (c) => {
    logger.info({ tag: c.user.tag }, "Discord botu hazır!");
    for (const guild of c.guilds.cache.values()) {
      try {
        await rest.put(
          Routes.applicationGuildCommands(clientId, guild.id),
          { body: commandData },
        );
        logger.info({ guildId: guild.id, name: guild.name }, "Komutlar sunucuya kaydedildi");
      } catch (err) {
        logger.error({ err, guildId: guild.id }, "Sunucuya komut kaydedilemedi");
      }
    }
  });

  client.on(Events.MessageCreate, async (message: Message) => {
    if (message.author.bot || !message.guildId) return;

    const prefix = await getPrefix(message.guildId).catch(() => "!");

    // Prefix komutu mu?
    if (message.content.startsWith(prefix)) {
      const withoutPrefix = message.content.slice(prefix.length).trim();
      const [commandName, ...args] = withoutPrefix.split(/\s+/);
      const handler = prefixHandlers[commandName?.toLowerCase() ?? ""];
      if (handler) {
        await handler(message, args).catch((err) => {
          logger.error({ err, commandName }, "Prefix komut hatası");
        });
        return; // Prefix komutlarında XP verme
      }
    }

    // XP sistemi
    const result = await handleXp(message.author.id, message.guildId).catch(
      (err) => { logger.error({ err }, "XP işlenirken hata"); return null; },
    );

    if (result?.leveledUp) {
      await message.channel
        .send(`🎉 Tebrikler ${message.author}! **${result.newLevel}. seviyeye** ulaştın!`)
        .catch(() => null);
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
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(msg);
      } else {
        await interaction.reply(msg);
      }
    }
  });

  await client.login(token);
}
