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

// ── yt-dlp yardımcıları ───────────────────────────────────────────────────────

function ytdlpBin(): string {
  // Nix ile kurulan yt-dlp
  return "yt-dlp";
}

function formatDuration(sec: number): string {
  if (!sec || sec < 0) return "?:??";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface YtInfo {
  title: string;
  webpage_url: string;
  duration: number;
  thumbnail: string;
}

/** yt-dlp ile video bilgisi al (URL veya arama sorgusu) */
function fetchInfo(query: string): Promise<YtInfo> {
  return new Promise((resolve, reject) => {
    // YouTube URL mi yoksa arama sorgusu mu?
    const isUrl =
      query.startsWith("http://") || query.startsWith("https://");
    const target = isUrl ? query : `ytsearch1:${query}`;

    const proc = spawn(ytdlpBin(), [
      "--dump-json",
      "--no-playlist",
      "--quiet",
      "--no-warnings",
      "-f", "bestaudio",
      "--extractor-args", "youtube:player_client=tv_embedded,android",
      target,
    ]);

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    proc.stderr.on("data", (d: Buffer) => (stderr += d.toString()));

    proc.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`yt-dlp hata (${code}): ${stderr.trim()}`));
      }
      try {
        // Birden fazla JSON satırı varsa ilkini al
        const line = stdout.trim().split("\n")[0]!;
        const data = JSON.parse(line) as YtInfo;
        resolve(data);
      } catch (e) {
        reject(new Error("yt-dlp JSON parse hatası"));
      }
    });

    proc.on("error", (e) => reject(e));
  });
}

/** yt-dlp ile ses stream URL'si al, ffmpeg ile Opus'a çevir */
function createFfmpegStream(videoUrl: string): Promise<NodeJS.ReadableStream> {
  return new Promise((resolve, reject) => {
    // Önce yt-dlp'den stream URL'sini al
    const ytProc = spawn(ytdlpBin(), [
      "-f", "bestaudio",
      "--get-url",
      "--no-playlist",
      "--quiet",
      "--no-warnings",
      "--extractor-args", "youtube:player_client=tv_embedded,android",
      videoUrl,
    ]);

    let streamUrl = "";
    let ytErr = "";
    ytProc.stdout.on("data", (d: Buffer) => (streamUrl += d.toString()));
    ytProc.stderr.on("data", (d: Buffer) => (ytErr += d.toString()));

    ytProc.on("close", (code) => {
      const url = streamUrl.trim().split("\n")[0]!;
      if (code !== 0 || !url) {
        return reject(
          new Error(`Stream URL alınamadı (${code}): ${ytErr.trim()}`)
        );
      }

      // ffmpeg ile URL'yi ham PCM'e çevir
      const ff = spawn("ffmpeg", [
        "-reconnect", "1",
        "-reconnect_streamed", "1",
        "-reconnect_delay_max", "5",
        "-i", url,
        "-f", "s16le",   // ham 16-bit little-endian PCM
        "-ar", "48000",  // Discord 48kHz
        "-ac", "2",      // stereo
        "-loglevel", "quiet",
        "pipe:1",
      ]);

      ff.on("error", (e) => reject(e));
      ff.stderr.on("data", () => null); // loglamayı bastır

      // ffmpeg stdout'u sağla
      resolve(ff.stdout as unknown as NodeJS.ReadableStream);
    });

    ytProc.on("error", (e) => reject(e));
  });
}

// ── Kuyruk mantığı ────────────────────────────────────────────────────────────

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

  try {
    const ffmpegStream = await createFfmpegStream(track.url);
    const resource = createAudioResource(ffmpegStream, {
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
  // 1. Şarkı bilgisini yt-dlp'den al
  let trackInfo: Track;
  try {
    const info = await fetchInfo(query);
    trackInfo = {
      title: info.title ?? "Bilinmeyen",
      url: info.webpage_url,
      duration: formatDuration(info.duration ?? 0),
      thumbnail: info.thumbnail ?? "",
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

    // Ready olana kadar bekle
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

    // Şarkı bitince bir sonrakine geç
    player.on(AudioPlayerStatus.Idle, () => {
      const q = queues.get(guildId);
      if (!q || q.paused) return;
      q.tracks.shift();
      playNext(guildId).catch((e) =>
        logger.error({ e }, "playNext hatası")
      );
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

    // Bağlantı kopunca yeniden bağlanmayı dene
    connection.on(
      VoiceConnectionStatus.Disconnected,
      async (_old, newState) => {
        if (
          newState.reason ===
            VoiceConnectionDisconnectReason.WebSocketClose &&
          newState.closeCode === 4014
        ) {
          // Kicked/moved
          try {
            await entersState(
              connection,
              VoiceConnectionStatus.Connecting,
              5_000
            );
          } catch {
            connection.destroy();
            queues.delete(guildId);
          }
          return;
        }
        // Geçici kopukluk
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
