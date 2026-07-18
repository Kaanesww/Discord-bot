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
import * as kickCommand from "./commands/kick";
import * as levelCommand from "./commands/level";
import * as leaderboardCommand from "./commands/leaderboard";

interface Command {
  data: SlashCommandBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

const commands = new Collection<string, Command>();
commands.set(kickCommand.data.name, kickCommand as Command);
commands.set(levelCommand.data.name, levelCommand as Command);
commands.set(leaderboardCommand.data.name, leaderboardCommand as Command);

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

  // Slash komutlarını Discord'a kaydet
  const rest = new REST().setToken(token);
  const commandData = [...commands.values()].map((cmd) => cmd.data.toJSON());

  try {
    logger.info("Slash komutları Discord'a kaydediliyor...");
    await rest.put(Routes.applicationCommands(clientId), { body: commandData });
    logger.info("Slash komutları başarıyla kaydedildi.");
  } catch (err) {
    logger.error({ err }, "Slash komutları kaydedilemedi");
    return;
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once(Events.ClientReady, (c) => {
    logger.info({ tag: c.user.tag }, "Discord botu hazır!");
  });

  // XP sistemi: her mesajda XP ver
  client.on(Events.MessageCreate, async (message: Message) => {
    if (message.author.bot || !message.guildId) return;

    const result = await handleXp(message.author.id, message.guildId).catch(
      (err) => {
        logger.error({ err }, "XP işlenirken hata");
        return null;
      },
    );

    if (result?.leveledUp) {
      await message.channel
        .send(
          `🎉 Tebrikler ${message.author}! **${result.newLevel}. seviyeye** ulaştın!`,
        )
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
      const msg = {
        content: "❌ Komut çalıştırılırken bir hata oluştu.",
        ephemeral: true,
      };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(msg);
      } else {
        await interaction.reply(msg);
      }
    }
  });

  await client.login(token);
}
