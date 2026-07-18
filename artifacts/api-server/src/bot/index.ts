import {
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  type ChatInputCommandInteraction,
  type SlashCommandBuilder,
} from "discord.js";
import { logger } from "../lib/logger";
import * as kickCommand from "./commands/kick";

interface Command {
  data: SlashCommandBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

const commands = new Collection<string, Command>();
commands.set(kickCommand.data.name, kickCommand as Command);

export async function startBot(): Promise<void> {
  const token = process.env["DISCORD_TOKEN"];
  const clientId = process.env["DISCORD_CLIENT_ID"];

  if (!token) {
    logger.warn("DISCORD_TOKEN is not set — Discord bot will not start.");
    return;
  }

  if (!clientId) {
    logger.warn(
      "DISCORD_CLIENT_ID is not set — Discord bot will not start.",
    );
    return;
  }

  // Slash komutlarını Discord'a kaydet
  const rest = new REST().setToken(token);
  const commandData = [...commands.values()].map((cmd) => cmd.data.toJSON());

  try {
    logger.info("Slash komutları Discord'a kaydediliyor...");
    await rest.put(Routes.applicationCommands(clientId), {
      body: commandData,
    });
    logger.info("Slash komutları başarıyla kaydedildi.");
  } catch (err) {
    logger.error({ err }, "Slash komutları kaydedilemedi");
    return;
  }

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });

  client.once(Events.ClientReady, (c) => {
    logger.info({ tag: c.user.tag }, "Discord botu hazır!");
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
