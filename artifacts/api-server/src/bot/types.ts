import type {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  Client,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
  Message,
  MessageCreateOptions,
  MessagePayload,
  TextBasedChannel,
} from "discord.js";

export interface Command {
  data:
    | SlashCommandBuilder
    | SlashCommandOptionsOnlyBuilder
    | SlashCommandSubcommandsOnlyBuilder;
  execute: (
    interaction: ChatInputCommandInteraction,
    client: Client,
  ) => Promise<void>;
}

export interface Warning {
  reason: string;
  moderatorId: string;
  moderatorTag: string;
  timestamp: number;
}

type SendableMessagePayload = string | MessageCreateOptions | MessagePayload;

/**
 * Message.channel is a broad Discord.js union and can include partial channels
 * that cannot receive messages. Keep that check in one place so every handler
 * fails safely instead of relying on an unsafe cast.
 */
export async function sendMessageChannel(
  message: Message,
  payload: SendableMessagePayload,
) {
  const channel = message.channel;
  if (!channel.isSendable()) return null;
  return channel.send(payload);
}

export async function sendMessageTyping(message: Message): Promise<void> {
  const channel = message.channel;
  if (channel.isSendable()) await channel.sendTyping();
}

export async function sendTextBasedChannel(
  channel: TextBasedChannel,
  payload: SendableMessagePayload,
) {
  if (!channel.isSendable()) return null;
  return channel.send(payload);
}
