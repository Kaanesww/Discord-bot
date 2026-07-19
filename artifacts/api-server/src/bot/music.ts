import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  getVoiceConnection,
  entersState,
} from "@discordjs/voice";
import play from "play-dl";
import type { VoiceBasedChannel, TextBasedChannel } from "discord.js";
import { logger } from "../lib/logger";

export interface Track {
  title: string;
  url: string;
  duration: string;
  thumbnail: string;
  requestedBy: string;
}

interface GuildQueue {
  tracks: Track[];
  player: ReturnType<typeof createAudioPlayer>;
  paused: boolean;
  textChannel: TextBasedChannel;
}

const queues = new Map<string, GuildQueue>();

function formatDuration(sec: number): string {
  if (!sec || sec < 0) return "?:??";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

async function playNext(guildId: string): Promise<void> {
  const queue = queues.get(guildId);
  if (!queue) return;

  if (queue.tracks.length === 0) {
    getVoiceConnection(guildId)?.destroy();
    queues.delete(guildId);
    return;
  }

  const track = queue.tracks[0]!;
  try {
    const stream = await play.stream(track.url, { quality: 2 });
    const resource = createAudioResource(stream.stream, { inputType: stream.type });
    queue.player.play(resource);
    logger.info({ title: track.title, guildId }, "Müzik çalınıyor");
  } catch (err) {
    logger.error({ err, title: track.title }, "Şarkı oynatılamadı, atlanıyor");
    queue.tracks.shift();
    await playNext(guildId);
  }
}

export async function addToQueue(
  guildId: string,
  voiceChannel: VoiceBasedChannel,
  textChannel: TextBasedChannel,
  query: string,
  requestedBy: string,
): Promise<{ track: Track | null; position: number; error?: string }> {
  let trackInfo: Track;

  try {
    const yt_type = play.yt_validate(query);
    if (yt_type === "video") {
      const info = await play.video_info(query);
      const v = info.video_details;
      trackInfo = {
        title: v.title ?? "Bilinmeyen",
        url: v.url,
        duration: formatDuration(v.durationInSec ?? 0),
        thumbnail: v.thumbnails?.[0]?.url ?? "",
        requestedBy,
      };
    } else {
      // Search
      const results = await play.search(query, { limit: 1, source: { youtube: "video" } });
      if (!results.length) return { track: null, position: 0, error: "Sonuç bulunamadı. Farklı arama dene." };
      const v = results[0]!;
      trackInfo = {
        title: v.title ?? "Bilinmeyen",
        url: v.url,
        duration: formatDuration(v.durationInSec ?? 0),
        thumbnail: v.thumbnails?.[0]?.url ?? "",
        requestedBy,
      };
    }
  } catch (err) {
    logger.error({ err }, "Müzik arama hatası");
    return { track: null, position: 0, error: "Müzik aranırken hata oluştu. URL veya başlık gir." };
  }

  let queue = queues.get(guildId);

  if (!queue) {
    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    });

    const player = createAudioPlayer();
    connection.subscribe(player);

    queue = { tracks: [], player, paused: false, textChannel };
    queues.set(guildId, queue);

    player.on(AudioPlayerStatus.Idle, () => {
      const q = queues.get(guildId);
      if (!q) return;
      q.tracks.shift();
      playNext(guildId).catch((err) => logger.error({ err }, "playNext hatası"));
    });

    player.on("error", (err) => {
      logger.error({ err }, "Audio player hatası");
      const q = queues.get(guildId);
      if (q) { q.tracks.shift(); playNext(guildId).catch(() => null); }
    });

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5000),
        ]);
      } catch {
        connection.destroy();
        queues.delete(guildId);
      }
    });
  }

  queue.tracks.push(trackInfo);
  const position = queue.tracks.length;

  if (position === 1) {
    await playNext(guildId);
  }

  return { track: trackInfo, position };
}

export function pauseResume(guildId: string): "paused" | "resumed" | "not_playing" {
  const queue = queues.get(guildId);
  if (!queue || queue.tracks.length === 0) return "not_playing";
  if (queue.paused) {
    queue.player.unpause();
    queue.paused = false;
    return "resumed";
  }
  queue.player.pause();
  queue.paused = true;
  return "paused";
}

export function skipTrack(guildId: string): Track | null {
  const queue = queues.get(guildId);
  if (!queue || queue.tracks.length === 0) return null;
  const skipped = queue.tracks[0]!;
  queue.player.stop(true);
  return skipped;
}

export function stopAndLeave(guildId: string): boolean {
  const queue = queues.get(guildId);
  if (!queue) return false;
  queue.tracks = [];
  queue.player.stop(true);
  getVoiceConnection(guildId)?.destroy();
  queues.delete(guildId);
  return true;
}

export function getQueue(guildId: string): GuildQueue | undefined {
  return queues.get(guildId);
}

export function getNowPlaying(guildId: string): Track | null {
  return queues.get(guildId)?.tracks[0] ?? null;
}

export function isPlaying(guildId: string): boolean {
  return queues.has(guildId) && (queues.get(guildId)?.tracks.length ?? 0) > 0;
}
