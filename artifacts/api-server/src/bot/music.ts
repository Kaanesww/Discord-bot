import { spawn } from "node:child_process";
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  VoiceConnectionDisconnectReason,
  getVoiceConnection,
  entersState,
  NoSubscriberBehavior,
  StreamType,
} from "@discordjs/voice";
import type { VoiceBasedChannel, TextBasedChannel } from "discord.js";
import { logger } from "../lib/logger";

export interface Track {
  title: string;
  url: string;          // YouTube video URL (https://www.youtube.com/watch?v=...)
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

// ── Piped API ────────────────────────────────────────────────────────────────
// Birden fazla Piped instance — biri çalışmazsa diğerini dene

const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://api.piped.yt",
  "https://pipedapi.drgns.space",
  "https://piped-api.garudalinux.org",
];

async function pipedFetch(path: string): Promise<any> {
  let lastErr: unknown;
  for (const base of PIPED_INSTANCES) {
    try {
      const res = await fetch(`${base}${path}`, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      logger.warn({ instance: base, err: e }, "Piped instance başarısız, sonraki deneniyor");
    }
  }
  throw new Error(`Tüm Piped instance'ları başarısız: ${String(lastErr)}`);
}

// ── Yardımcılar ──────────────────────────────────────────────────────────────

function formatDuration(sec: number): string {
  if (!sec || sec < 0) return "?:??";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function extractVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1);
    return u.searchParams.get("v");
  } catch {
    return null;
  }
}

// ── Şarkı bilgisi ─────────────────────────────────────────────────────────────

interface SongInfo {
  title: string;
  videoUrl: string;   // https://www.youtube.com/watch?v=ID
  videoId: string;
  duration: number;   // saniye
  thumbnail: string;
}

async function fetchSongInfo(query: string): Promise<SongInfo> {
  const isUrl = query.startsWith("http://") || query.startsWith("https://");

  if (isUrl) {
    const videoId = extractVideoId(query);
    if (!videoId) throw new Error("Geçersiz YouTube URL'si");
    const data = await pipedFetch(`/streams/${videoId}`);
    return {
      title: data.title ?? "Bilinmeyen",
      videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
      videoId,
      duration: data.duration ?? 0,
      thumbnail: data.thumbnailUrl ?? "",
    };
  }

  // Arama
  const data = await pipedFetch(`/search?q=${encodeURIComponent(query)}&filter=videos`);
  const items: any[] = data.items ?? [];
  const first = items.find((i) => i.type === "stream" || i.url?.startsWith("/watch"));
  if (!first) throw new Error("Sonuç bulunamadı");

  const videoId = (first.url as string).replace("/watch?v=", "");
  return {
    title: first.title ?? "Bilinmeyen",
    videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
    videoId,
    duration: first.duration ?? 0,
    thumbnail: first.thumbnail ?? "",
  };
}

// ── Ses stream ────────────────────────────────────────────────────────────────

/**
 * Piped API'den en iyi ses URL'sini al, ffmpeg ile Discord'a uygun
 * ham PCM (s16le, 48kHz, stereo) stream'e çevir.
 */
async function createAudioStream(videoId: string): Promise<NodeJS.ReadableStream> {
  const data = await pipedFetch(`/streams/${videoId}`);

  // En yüksek bitrate'li ses akışını seç
  const audioStreams: any[] = data.audioStreams ?? [];
  if (audioStreams.length === 0) throw new Error("Ses akışı bulunamadı");

  audioStreams.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
  const best = audioStreams[0]!;
  const streamUrl: string = best.url;

  logger.info({ videoId, mimeType: best.mimeType, bitrate: best.bitrate }, "Ses URL'si alındı");

  // ffmpeg ile PCM'e çevir
  const ff = spawn("ffmpeg", [
    "-reconnect", "1",
    "-reconnect_streamed", "1",
    "-reconnect_delay_max", "5",
    "-i", streamUrl,
    "-f", "s16le",    // ham 16-bit little-endian PCM
    "-ar", "48000",   // Discord 48kHz
    "-ac", "2",       // stereo
    "-loglevel", "quiet",
    "pipe:1",
  ]);

  ff.on("error", (e) => logger.error({ e }, "ffmpeg başlatılamadı"));
  ff.stderr.on("data", () => null);

  return ff.stdout as unknown as NodeJS.ReadableStream;
}

// ── Kuyruk oynatma ────────────────────────────────────────────────────────────

async function playNext(guildId: string): Promise<void> {
  const queue = queues.get(guildId);
  if (!queue) return;

  if (queue.tracks.length === 0) {
    getVoiceConnection(guildId)?.destroy();
    queues.delete(guildId);
    queue.textChannel
      .send("📭 Kuyruk bitti, ses kanalından çıkıldı.")
      .catch(() => null);
    return;
  }

  const track = queue.tracks[0]!;
  const videoId = extractVideoId(track.url);

  if (!videoId) {
    queue.textChannel.send(`❌ Geçersiz URL: ${track.title}`).catch(() => null);
    queue.tracks.shift();
    setTimeout(() => playNext(guildId).catch(() => null), 800);
    return;
  }

  try {
    const stream = await createAudioStream(videoId);
    const resource = createAudioResource(stream, {
      inputType: StreamType.Raw, // ham PCM
    });
    queue.player.play(resource);
    logger.info({ title: track.title, guildId }, "Müzik çalınıyor");
  } catch (err) {
    logger.error({ err, title: track.title }, "Şarkı oynatılamadı, atlanıyor");
    queue.textChannel
      .send(`❌ **${track.title}** oynatılamadı, atlanıyor...`)
      .catch(() => null);
    queue.tracks.shift();
    setTimeout(() => playNext(guildId).catch(() => null), 800);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function addToQueue(
  guildId: string,
  voiceChannel: VoiceBasedChannel,
  textChannel: TextBasedChannel,
  query: string,
  requestedBy: string
): Promise<{ track: Track | null; position: number; error?: string }> {
  // 1. Şarkı bilgisini Piped API'den al
  let trackInfo: Track;
  try {
    const info = await fetchSongInfo(query);
    trackInfo = {
      title: info.title,
      url: info.videoUrl,
      duration: formatDuration(info.duration),
      thumbnail: info.thumbnail,
      requestedBy,
    };
  } catch (err: any) {
    logger.error({ err }, "Şarkı bilgisi alınamadı");
    return {
      track: null,
      position: 0,
      error: `Şarkı bulunamadı: ${err?.message ?? "Bilinmeyen hata"}`,
    };
  }

  // 2. Varolan kuyruğa ekle veya yeni oturum aç
  let queue = queues.get(guildId);

  if (!queue) {
    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: false,
    });

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
    } catch (err) {
      logger.error({ err }, "Ses kanalı bağlantısı kurulamadı");
      connection.destroy();
      return {
        track: null,
        position: 0,
        error: "Ses kanalına bağlanılamadı. Bot'un kanal izinlerini kontrol et.",
      };
    }

    const player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
    });
    connection.subscribe(player);

    queue = { tracks: [], player, paused: false, textChannel };
    queues.set(guildId, queue);

    player.on(AudioPlayerStatus.Idle, () => {
      const q = queues.get(guildId);
      if (!q || q.paused) return;
      q.tracks.shift();
      playNext(guildId).catch((e) => logger.error({ e }, "playNext hatası"));
    });

    player.on("error", (err) => {
      logger.error({ err }, "Audio player hatası");
      const q = queues.get(guildId);
      if (q) {
        q.textChannel
          .send(`❌ Oynatıcı hatası: ${err.message}`)
          .catch(() => null);
        q.tracks.shift();
        setTimeout(() => playNext(guildId).catch(() => null), 800);
      }
    });

    connection.on(
      VoiceConnectionStatus.Disconnected,
      async (_old, newState) => {
        if (
          newState.reason === VoiceConnectionDisconnectReason.WebSocketClose &&
          newState.closeCode === 4014
        ) {
          try {
            await entersState(connection, VoiceConnectionStatus.Connecting, 5_000);
          } catch {
            connection.destroy();
            queues.delete(guildId);
          }
          return;
        }
        if (connection.rejoinAttempts < 5) {
          await new Promise<void>((res) =>
            setTimeout(res, (connection.rejoinAttempts + 1) * 5_000)
          );
          connection.rejoin();
        } else {
          connection.destroy();
          queues.delete(guildId);
        }
      }
    );

    connection.on(VoiceConnectionStatus.Destroyed, () => {
      queues.delete(guildId);
    });
  } else {
    queue.textChannel = textChannel;
  }

  queue.tracks.push(trackInfo);
  const position = queue.tracks.length;

  if (position === 1) {
    await playNext(guildId);
  }

  return { track: trackInfo, position };
}

export function pauseResume(
  guildId: string
): "paused" | "resumed" | "not_playing" {
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
  if (!queue) {
    const conn = getVoiceConnection(guildId);
    if (conn) { conn.destroy(); return true; }
    return false;
  }
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
  return (
    queues.has(guildId) &&
    (queues.get(guildId)?.tracks.length ?? 0) > 0
  );
}
