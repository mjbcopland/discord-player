import { REST } from "@discordjs/rest";
import { Routes } from "discord-api-types/v9";
import { isErrorLike, toErrorString } from "./errors";
import { logger } from "./logging";

const commands = [
  {
    name: "ping",
    description: "Replies with Pong!",
  },
];

async function main(args: string[]) {
  const { CLIENT_ID, GUILD_ID, DISCORD_BOT_TOKEN } = process.env;

  if (DISCORD_BOT_TOKEN == null) throw new Error("Missing token");
  if (CLIENT_ID == null || GUILD_ID == null) throw new Error("Missing guild");

  const client = new REST({ version: "9" }).setToken(DISCORD_BOT_TOKEN);
  await client.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
}

function onError(error: unknown): void {
  logger.error(isErrorLike(error) ? toErrorString(error) : `Unknown: ${String(error)}`);
  process.exitCode = 1;
}

void main(process.argv.slice(2)).catch(onError);
