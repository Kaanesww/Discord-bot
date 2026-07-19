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
    // Kuyruk bitti — bağlantıyı kapat
    getVoiceConnection(guildId)?.destroy();
    queues.delete(guildId);
    queue.textChannel
      .send("📭 Kuyruk bitti, ses kanalından çıkıldı.")
      .catch(() => null);
    return;
  }

  const track = queue.tracks[0]!;

  try {
    // play-dl ile stream al
    const streamData = await play.stream(track.url, { quality: 2 });
    const resource = createAudioResource(streamData.stream, {
      inputType: streamData.type,
    });
    queue.player.play(resource);
    logger.info({ title: track.title, guildId }, "Müzik çalınıyor");
  } catch (err) {
    logger.error({ err, title: track.title }, "Şarkı oynatılamadı, atlanıyor");

    // Hatayı kanala bildir
    queue.textChannel
      .send(`❌ **${track.title}** oynatılamadı, atlanıyor...`)
      .catch(() => null);

    queue.tracks.shift();
    // Kısa bekleme sonrası bir sonrakini dene
    setTimeout(() => playNext(guildId).catch(() => null), 500);
  }
}

export async function addToQueue(
  guildId: string,
  voiceChannel: VoiceBasedChannel,
  textChannel: TextBasedChannel,
  query: string,
  requestedBy: string,
): Promise<{ track: Track | null; position: number; error?: string }> {
  // ── 1. Şarkı bilgisini al ────────────────────────────────────────────────
  let trackInfo: Track;

  try {
    const ytType = play.yt_validate(query);

    if (ytType === "video") {
      const info = await play.video_info(query);
      const v = info.video_details;
      trackInfo = {
        title: v.title ?? "Bilinmeyen",
        url: v.url,
        duration: formatDuration(v.durationInSec ?? 0),
        thumbnail: v.thumbnails?.[0]?.url ?? "",
        requestedBy,
      };
    } else if (ytType === "playlist") {
      // Playlist verilmişse ilk videoyu al
      const playlist = await play.playlist_info(query, { incomplete: true });
      const videos = await playlist.all_videos();
      if (!videos.length) return { track: null, position: 0, error: "Oynatma listesi boş." };
      const v = videos[0]!;
      trackInfo = {
        title: v.title ?? "Bilinmeyen",
        url: v.url,
        duration: formatDuration(v.durationInSec ?? 0),
        thumbnail: v.thumbnails?.[0]?.url ?? "",
        requestedBy,
      };
    } else {
      // Arama
      const results = await play.search(query, { limit: 1, source: { youtube: "video" } });
      if (!results.length)
        return { track: null, position: 0, error: "Sonuç bulunamadı. Farklı arama dene." };
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
    return {
      track: null,
      position: 0,
      error: "Müzik aranırken hata oluştu. YouTube URL veya arama başlığı gir.",
    };
  }

  // ── 2. Varolan kuyruğa ekle ya da yeni oturum başlat ────────────────────
  let queue = queues.get(guildId);

  if (!queue) {
    // Ses kanalına bağlan
    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: false,
    });

    // Bağlantı Ready olana kadar bekle (30 sn timeout)
    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
    } catch (err) {
      logger.error({ err }, "Ses kanalı bağlantısı kurulamadı");
      connection.destroy();
      return { track: null, position: 0, error: "Ses kanalına bağlanılamadı. Bot'un kanal izinlerini kontrol et." };
    }

    // Player oluştur — abone olmayan varsa duraklat
    const player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
    });
    connection.subscribe(player);

    queue = { tracks: [], player, paused: false, textChannel };
    queues.set(guildId, queue);

    // Şarkı bitince bir sonrakine geç
    player.on(AudioPlayerStatus.Idle, () => {
      const q = queues.get(guildId);
      if (!q || q.paused) return; // Duraklatıldıysa tetiklenme
      q.tracks.shift();
      playNext(guildId).catch((err) => logger.error({ err }, "playNext hatası"));
    });

    player.on("error", (err) => {
      logger.error({ err }, "Audio player hatası");
      const q = queues.get(guildId);
      if (q) {
        q.textChannel
          .send(`❌ Oynatıcı hatası: ${err.message}`)
          .catch(() => null);
        q.tracks.shift();
        setTimeout(() => playNext(guildId).catch(() => null), 500);
      }
    });

    // Bağlantı kopunca yeniden bağlanmayı dene
    connection.on(VoiceConnectionStatus.Disconnected, async (_old, newState) => {
      // 4014 = Moved/kicked
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

      // Geçici kopukluk — yeniden bağlanmayı dene
      if (connection.rejoinAttempts < 5) {
        await new Promise<void>((res) =>
          setTimeout(res, (connection.rejoinAttempts + 1) * 5_000)
        );
        connection.rejoin();
      } else {
        connection.destroy();
        queues.delete(guildId);
      }
    });

    connection.on(VoiceConnectionStatus.Destroyed, () => {
      queues.delete(guildId);
    });
  } else {
    // Varolan oturumda text kanalını güncelle
    queue.textChannel = textChannel;
  }

  queue.tracks.push(trackInfo);
  const position = queue.tracks.length;

  // İlk şarkıysa hemen çal
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
  queue.player.stop(true); // Idle event tetiklenir → playNext çağrılır
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
  return queues.has(guildId) && (queues.get(guildId)?.tracks.length ?? 0) > 0;
}
