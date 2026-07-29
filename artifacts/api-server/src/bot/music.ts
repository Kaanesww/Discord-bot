/**
 * Müzik sistemi v3
 * Akış önceliği: play-dl (YouTube/SoundCloud) → ytdl-core fallback
 * Bağlantı: otomatik yeniden bağlanma, 5 deneme
 */
import play from "play-dl";
import ytdl from "@distube/ytdl-core";
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  getVoiceConnection,
  entersState,
  NoSubscriberBehavior,
  StreamType,
} from "@discordjs/voice";
import type { VoiceBasedChannel, TextBasedChannel } from "discord.js";
import { AttachmentBuilder } from "discord.js";
import { generateMusicCard } from "./musicCard";
import { logger } from "../lib/logger";

// ── Track tipi ────────────────────────────────────────────────────────────────

export interface Track {
  title: string;
  url: string;
  duration: string;
  thumbnail: string;
  requestedBy: string;
  source?: "youtube" | "soundcloud" | "unknown";
  artist?: string;
}

interface GuildQueue {
  tracks: Track[];
  player: ReturnType<typeof createAudioPlayer>;
  paused: boolean;
  textChannel: TextBasedChannel;
  volume: number;
}

const queues = new Map<string, GuildQueue>();

// ── SoundCloud başlatma ───────────────────────────────────────────────────────

let scReady = false;
let scInitPromise: Promise<void> | null = null;

async function ensureSoundCloud(): Promise<void> {
  if (scReady) return;
  if (scInitPromise) return scInitPromise;
  scInitPromise = (async () => {
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        if (attempt > 1) await sleep((attempt) * 1200);
        const clientId = await play.getFreeClientID();
        if (!clientId) throw new Error("Boş client_id");
        await play.setToken({ soundcloud: { client_id: clientId } });
        scReady = true;
        scInitPromise = null;
        logger.info({ attempt }, "SoundCloud istemci kimliği alındı");
        return;
      } catch (err) {
        logger.warn({ err, attempt }, "SoundCloud başlatma denemesi başarısız");
        if (attempt === 5) { scInitPromise = null; throw new Error("SoundCloud bağlantısı kurulamadı"); }
      }
    }
  })();
  return scInitPromise;
}

export async function warmupMusic(): Promise<void> {
  try { await ensureSoundCloud(); } catch (err) { logger.warn({ err }, "Müzik ısınma başarısız"); }
}

// ── Yardımcılar ───────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }

function formatDuration(sec: number): string {
  if (!sec || sec <= 0) return "?:??";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function isYouTubeUrl(q: string): boolean {
  return /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)/.test(q);
}

function isSoundCloudUrl(q: string): boolean {
  return q.startsWith("https://soundcloud.com/") || q.startsWith("http://soundcloud.com/");
}

function isSpotifyUrl(q: string): boolean {
  return q.startsWith("https://open.spotify.com/track/") || q.startsWith("https://spotify.com/track/");
}

// ── Track çözümleme ───────────────────────────────────────────────────────────

async function resolveYouTube(query: string): Promise<Track> {
  if (isYouTubeUrl(query)) {
    // URL → bilgileri al
    try {
      const info = await play.video_info(query);
      const v = info.video_details as any;
      return {
        title: v.title ?? "YouTube",
        url: query,
        duration: formatDuration(v.durationInSec ?? 0),
        thumbnail: v.thumbnails?.[0]?.url ?? "",
        requestedBy: "",
        source: "youtube",
        artist: v.channel?.name ?? "",
      };
    } catch {
      const info = await ytdl.getInfo(query);
      return {
        title: info.videoDetails.title,
        url: query,
        duration: formatDuration(parseInt(info.videoDetails.lengthSeconds, 10)),
        thumbnail: info.videoDetails.thumbnails?.[0]?.url ?? "",
        requestedBy: "",
        source: "youtube",
        artist: info.videoDetails.author?.name ?? "",
      };
    }
  }

  // Metin araması
  const results = await play.search(query, { source: { youtube: "video" }, limit: 3 });
  if (!results || results.length === 0) throw new Error("YouTube'da sonuç bulunamadı");
  const best = results[0] as any;
  const videoUrl = best.url ?? best.video_url ?? "";
  if (!videoUrl) throw new Error("YouTube URL alınamadı");
  return {
    title: best.title ?? query,
    url: videoUrl,
    duration: formatDuration(best.durationInSec ?? 0),
    thumbnail: best.thumbnails?.[0]?.url ?? best.thumbnail?.url ?? "",
    requestedBy: "",
    source: "youtube",
    artist: best.channel?.name ?? "",
  };
}

async function resolveSoundCloud(query: string): Promise<Track> {
  await ensureSoundCloud();
  if (isSoundCloudUrl(query)) {
    const sc = await play.soundcloud(query) as any;
    return {
      title: sc.name ?? "Bilinmeyen",
      url: sc.url ?? query,
      duration: formatDuration(sc.durationInSec ?? 0),
      thumbnail: sc.thumbnail ?? "",
      requestedBy: "",
      source: "soundcloud",
      artist: sc.user?.username ?? "",
    };
  }
  const results = await play.search(query, { source: { soundcloud: "tracks" }, limit: 3 });
  if (!results || results.length === 0) throw new Error(`"${query}" SoundCloud'da bulunamadı`);
  const sc = results[0] as any;
  return {
    title: sc.name ?? "Bilinmeyen",
    url: sc.url ?? "",
    duration: formatDuration(sc.durationInSec ?? 0),
    thumbnail: sc.thumbnail ?? "",
    requestedBy: "",
    source: "soundcloud",
    artist: sc.user?.username ?? "",
  };
}

export async function resolveTrack(query: string): Promise<Track> {
  if (isSpotifyUrl(query)) {
    // Spotify → başlıkla ara (API anahtarı olmadan)
    try {
      const url = new URL(query);
      const parts = url.pathname.split("/").filter(Boolean);
      query = parts[parts.length - 1] ?? query; // track ID → arama query olarak kullan
    } catch { /* ignore */ }
  }

  if (isSoundCloudUrl(query)) return resolveSoundCloud(query);

  if (isYouTubeUrl(query)) {
    try { return await resolveYouTube(query); }
    catch (ytErr: any) {
      logger.warn({ err: ytErr }, "YouTube URL çözümlenemedi, SoundCloud'da aranıyor");
      try {
        const info = await ytdl.getInfo(query).catch(() => null);
        return resolveSoundCloud(info?.videoDetails.title ?? query);
      } catch { throw ytErr; }
    }
  }

  // Metin → YouTube önce, SoundCloud fallback
  try { return await resolveYouTube(query); }
  catch (ytErr: any) {
    logger.warn({ err: ytErr, query }, "YouTube arama başarısız, SoundCloud'a geçiliyor");
    return resolveSoundCloud(query);
  }
}

// ── Ses akışı ─────────────────────────────────────────────────────────────────

async function createStream(track: Track): Promise<{ stream: any; type: StreamType }> {
  if (track.source === "youtube") {
    // Önce play-dl ile dene (Replit ortamında daha güvenilir)
    try {
      const result = await play.stream(track.url, { quality: 2, discordPlayerCompatibility: true });
      let dtype: StreamType;
      switch (result.type) {
        case "ogg/opus":  dtype = StreamType.OggOpus; break;
        case "webm/opus": dtype = StreamType.WebmOpus; break;
        default:          dtype = StreamType.Arbitrary;
      }
      return { stream: result.stream, type: dtype };
    } catch (playdlErr: any) {
      logger.warn({ err: playdlErr }, "play-dl YouTube stream başarısız, ytdl deneniyor");
    }

    // ytdl fallback
    try {
      const stream = ytdl(track.url, {
        filter: "audioonly",
        quality: "highestaudio",
        highWaterMark: 1 << 25,
        dlChunkSize: 0,
        requestOptions: {
          headers: {
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          },
        },
      });
      return { stream, type: StreamType.Arbitrary };
    } catch (ytdlErr: any) {
      logger.warn({ err: ytdlErr }, "ytdl stream başarısız, SoundCloud fallback");
      const scTrack = await resolveSoundCloud(track.title);
      return createStream(scTrack);
    }
  }

  // SoundCloud akışı — play-dl
  await ensureSoundCloud();
  let result: Awaited<ReturnType<typeof play.stream>>;
  try {
    result = await play.stream(track.url, { quality: 2 });
  } catch (err: any) {
    if (err?.message?.includes("401") || err?.message?.includes("403") || err?.message?.includes("client_id")) {
      scReady = false;
      await ensureSoundCloud();
      result = await play.stream(track.url, { quality: 2 });
    } else {
      throw err;
    }
  }
  let dtype: StreamType;
  switch (result.type) {
    case "ogg/opus":  dtype = StreamType.OggOpus; break;
    case "webm/opus": dtype = StreamType.WebmOpus; break;
    default:          dtype = StreamType.Arbitrary;
  }
  return { stream: result.stream, type: dtype };
}

// ── Kuyruk oynatma ────────────────────────────────────────────────────────────

async function playNext(guildId: string): Promise<void> {
  const queue = queues.get(guildId);
  if (!queue) return;

  if (queue.tracks.length === 0) {
    getVoiceConnection(guildId)?.destroy();
    queues.delete(guildId);
    queue.textChannel.send("📭 Kuyruk bitti, ses kanalından çıkıldı.").catch(() => null);
    return;
  }

  const track = queue.tracks[0]!;

  try {
    const { stream, type } = await createStream(track);
    const resource = createAudioResource(stream, { inputType: type, inlineVolume: false });
    queue.player.play(resource);
    logger.info({ title: track.title, source: track.source, guildId }, "Müzik çalınıyor");

    try {
      const buf = await generateMusicCard(track, "playing");
      await queue.textChannel.send({
        content: `🎵 **${track.title}**`,
        files: [new AttachmentBuilder(buf, { name: "nowplaying.png" })],
      });
    } catch {
      queue.textChannel.send(`▶️ **Çalınıyor:** ${track.title} — ${track.duration}`).catch(() => null);
    }
  } catch (err) {
    logger.error({ err, title: track.title }, "Şarkı oynatılamadı, atlanıyor");
    queue.textChannel.send(`❌ **${track.title}** oynatılamadı, atlanıyor...`).catch(() => null);
    queue.tracks.shift();
    if (queue.tracks.length > 0) setTimeout(() => playNext(guildId).catch(() => null), 800);
    else {
      getVoiceConnection(guildId)?.destroy();
      queues.delete(guildId);
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function addToQueue(
  guildId: string,
  voiceChannel: VoiceBasedChannel,
  textChannel: TextBasedChannel,
  query: string,
  requestedBy: string,
): Promise<{ track: Track | null; position: number; error?: string }> {
  let trackInfo: Track;
  try {
    const resolved = await resolveTrack(query);
    trackInfo = { ...resolved, requestedBy };
  } catch (err: any) {
    logger.error({ err }, "Şarkı bilgisi alınamadı");
    return { track: null, position: 0, error: err?.message ?? "Şarkı bulunamadı" };
  }

  let queue = queues.get(guildId);

  if (!queue) {
    const player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Play },
    });

    let connection = getVoiceConnection(guildId);
    if (!connection) {
      connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        selfDeaf: true,
        selfMute: false,
      });
    }

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
    } catch (err) {
      logger.error({ err }, "Ses kanalı bağlantısı kurulamadı");
      connection.destroy();
      return { track: null, position: 0, error: "Ses kanalına bağlanılamadı (20 saniye içinde hazır olmadı)" };
    }

    connection.subscribe(player);

    queue = { tracks: [], player, paused: false, textChannel, volume: 100 };
    queues.set(guildId, queue);

    // Bağlantı kopunca yeniden bağlan
    connection.on(VoiceConnectionStatus.Disconnected, async (_oldState, _newState) => {
      if (!queues.has(guildId)) return;
      try {
        // Discord'un kendiliğinden yeniden bağlanmasını 5 sn bekle
        await Promise.race([
          entersState(connection!, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection!, VoiceConnectionStatus.Connecting, 5_000),
        ]);
        // Signalling/Connecting → Ready'e geçmesini bekle
        await entersState(connection!, VoiceConnectionStatus.Ready, 20_000);
      } catch {
        // Yeniden bağlanamadı — connection hâlâ canlıysa yeniden katıl
        if (connection!.state.status !== VoiceConnectionStatus.Destroyed) {
          try {
            if (connection!.rejoinAttempts < 5) {
              await sleep((connection!.rejoinAttempts + 1) * 2_000);
              connection!.rejoin();
              await entersState(connection!, VoiceConnectionStatus.Ready, 20_000);
            } else {
              connection!.destroy();
              queues.delete(guildId);
              textChannel.send("⚠️ Ses kanalı bağlantısı kesildi ve yeniden kurulamadı.").catch(() => null);
            }
          } catch {
            connection!.destroy();
            queues.delete(guildId);
          }
        }
      }
    });

    connection.on(VoiceConnectionStatus.Destroyed, () => {
      queues.delete(guildId);
    });

    // Şarkı bitince sonraki şarkıya geç
    player.on(AudioPlayerStatus.Idle, () => {
      const q = queues.get(guildId);
      if (!q) return;
      q.tracks.shift();
      playNext(guildId).catch(() => null);
    });

    player.on("error", (err) => {
      logger.error({ err }, "Oynatıcı hatası");
      const q = queues.get(guildId);
      if (!q) return;
      q.tracks.shift();
      setTimeout(() => playNext(guildId).catch(() => null), 800);
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

export function pauseResume(guildId: string): "paused" | "resumed" | "not_playing" {
  const queue = queues.get(guildId);
  if (!queue || queue.tracks.length === 0) return "not_playing";
  if (queue.paused) { queue.player.unpause(); queue.paused = false; return "resumed"; }
  queue.player.pause(); queue.paused = true; return "paused";
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
  return queues.has(guildId) && (queues.get(guildId)?.tracks.length ?? 0) > 0;
}
