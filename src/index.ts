import { promisify } from "util";
import { head, join, propEq } from "ramda";
import { REST } from "@discordjs/rest";
import { default as ytdl } from "ytdl-core-discord";
import { default as youtube } from "youtube-sr";
import {
  AudioPlayerStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
  VoiceConnectionStatus,
  StreamType,
  DiscordGatewayAdapterCreator,
  VoiceConnection,
  PlayerSubscription,
  AudioPlayer,
  VoiceConnectionDisconnectReason,
} from "@discordjs/voice";
import {
  Awaited,
  Client,
  CommandInteraction,
  GuildMember,
  Intents,
  Interaction,
  StageChannel,
  VoiceChannel,
} from "discord.js";
import { Routes } from "discord-api-types/v9";
import { logger } from "./logging";
import { asNonNullable } from "./util";
import { commands } from "./commands";

const wait = promisify(setTimeout);

const intents = [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_VOICE_STATES];
const client = new Client({ intents });

class Player {
  private busy = false;
  private queue: string[] = [];
  private subscription?: PlayerSubscription;

  async play(interaction: CommandInteraction) {
    const query = interaction.options.get("query", true).value;

    if (typeof query !== "string") {
      return interaction.reply({ content: "Invalid query", ephemeral: true });
    }

    if (interaction.member instanceof GuildMember) {
      void this.queue.push(query);
      await this.connect(asNonNullable(interaction.member.voice.channel));
      await this.tick();

      await entersState(this.subscription.player, AudioPlayerStatus.Playing, 5e3);
      return interaction.reply({ content: "Playing", ephemeral: true });
    }

    return interaction.reply({ content: "Something went wrong", ephemeral: true });
  }

  async connect(channel: VoiceChannel | StageChannel) {
    if (this.subscription == null) {
      const adapterCreator = channel.guild.voiceAdapterCreator; // todo?
      const connection = joinVoiceChannel({ adapterCreator, channelId: channel.id, guildId: channel.guild.id });

      this.subscription = asNonNullable(connection.subscribe(createAudioPlayer()));
      this.subscription.player.on("stateChange", (prev, next) => {
        if (next.status === AudioPlayerStatus.Idle && prev.status !== AudioPlayerStatus.Idle) {
          // If the Idle state is entered from a non-Idle state, it means that an audio resource has finished playing.
          // The queue is then processed to start playing the next track, if one is available.
          // (oldState.resource as AudioResource<Track>).metadata.onFinish();
          return this.tick();
        } else if (next.status === AudioPlayerStatus.Playing) {
          // If the Playing state has been entered, then a new track has started playback.
          // (next.resource as AudioResource<Track>).metadata.onStart();
        }
      });

      this.subscription.connection.on("stateChange", async (prev, next) => {
        if (next.status === VoiceConnectionStatus.Disconnected) {
          if (next.reason === VoiceConnectionDisconnectReason.WebSocketClose && next.closeCode === 4014) {
            /*
              If the WebSocket closed with a 4014 code, this means that we should not manually attempt to reconnect,
              but there is a chance the connection will recover itself if the reason of the disconnect was due to
              switching voice channels. This is also the same code for the bot being kicked from the voice channel,
              so we allow 5 seconds to figure out which scenario it is. If the bot has been kicked, we should destroy
              the voice connection.
            */
            try {
              await entersState(this.subscription.connection, VoiceConnectionStatus.Connecting, 5_000);
              // Probably moved voice channel
            } catch {
              this.subscription.connection.destroy();
              // Probably removed from voice channel
            }
          } else if (this.subscription.connection.rejoinAttempts < 5) {
            /*
              The disconnect in this case is recoverable, and we also have <5 repeated attempts so we will reconnect.
            */
            await wait((this.subscription.connection.rejoinAttempts + 1) * 5_000);
            this.subscription.connection.rejoin();
          } else {
            /*
              The disconnect in this case may be recoverable, but we have no more remaining attempts - destroy.
            */
            this.subscription.connection.destroy();
          }
        } else if (next.status === VoiceConnectionStatus.Destroyed) {
          /*
            Once destroyed, stop the subscription
          */
          this.stop();
        } else if (
          !this.readyLock &&
          (next.status === VoiceConnectionStatus.Connecting || next.status === VoiceConnectionStatus.Signalling)
        ) {
          /*
            In the Signalling or Connecting states, we set a 20 second time limit for the connection to become ready
            before destroying the voice connection. This stops the voice connection permanently existing in one of these
            states.
          */
          this.readyLock = true;
          try {
            await entersState(this.subscription.connection, VoiceConnectionStatus.Ready, 20_000);
          } catch {
            if (this.subscription.connection.state.status !== VoiceConnectionStatus.Destroyed)
              this.subscription.connection.destroy();
          } finally {
            this.readyLock = false;
          }
        }
      });
    }

    if (this.subscription != null && this.subscription.connection.joinConfig.channelId !== channel.id) {
      throw new Error("Already playing in another channel");
    }

    await entersState(this.subscription.connection, VoiceConnectionStatus.Ready, 30e3).catch((error) => {
      void this.subscription?.connection.destroy();
      throw error;
    });
  }

  async tick() {
    if (this.busy || this.subscription?.player.state.status !== AudioPlayerStatus.Idle) return;

    try {
      this.busy = true;
      const query = this.queue.shift();
      if (query != null) {
        const results = await youtube.search(query, { limit: 1, type: "video" });
        console.log(await ytdl.getBasicInfo(asNonNullable(head(results)).url));
        const stream = await ytdl(asNonNullable(head(results)).url);
        const resource = createAudioResource(stream, { inputType: StreamType.Opus });

        return this.subscription.player.play(resource);
      }
    } catch (error) {
      logger.error(error);
    } finally {
      this.busy = false;
    }
  }

  async skip(interaction: CommandInteraction) {
    void this.subscription?.player.stop(true);

    await entersState(this.subscription.player, AudioPlayerStatus.Idle, 5e3);
    return interaction.reply({ content: "Skipped", ephemeral: true });
  }

  async stop(interaction: CommandInteraction) {
    while (this.queue.length) void this.queue.pop();
    void this.subscription?.player.stop(true);

    await entersState(this.subscription.player, AudioPlayerStatus.Idle, 5e3);
    return interaction.reply({ content: "Stopped", ephemeral: true });
  }
}

void client.login(process.env.DISCORD_BOT_TOKEN);

client.on("ready", async (): Promise<void> => {
  logger.info("ready");

  const { DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID } = process.env;

  if (DISCORD_BOT_TOKEN == null) throw new Error("Missing bot token");
  if (DISCORD_CLIENT_ID == null) throw new Error("Missing client ID");

  const guilds = await client.guilds.fetch();
  const rest = new REST({ version: "9" }).setToken(DISCORD_BOT_TOKEN);

  for (const guildId of guilds.keys()) {
    void logger.info("updating guild commands", { guildId });
    await rest.put(Routes.applicationGuildCommands(DISCORD_CLIENT_ID, guildId), { body: commands });
  }
});

const player = new Player();

client.on("interactionCreate", (interaction): Awaited<void> => {
  if (!interaction.isCommand()) return;

  const command = player[interaction.commandName as keyof Player] as (interaction: Interaction) => Awaited<void>;
  return command.call(player, interaction).catch((error: Error) => {
    return interaction.reply({ content: error.message, ephemeral: true });
  });

  throw new Error(`Unknown command '${interaction.commandName}'`);
});
