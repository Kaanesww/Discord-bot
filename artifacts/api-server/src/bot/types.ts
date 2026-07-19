import type {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  Client,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
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
