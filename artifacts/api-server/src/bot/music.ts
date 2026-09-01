/**
 * Müzik sistemi v4
 * ─────────────────────────────────────────────────────────────────────────────
 * Replit ortamında YouTube IP engeli nedeniyle:
 *   - Metadata (başlık, süre, thumbnail): YouTube arama / SC arama
 *   - Streaming (ses): HER ZAMAN SoundCloud üzerinden
 *
 * Akış:
 *  1. Sorgu çözümlenir → Track metadata (başlık vb.)
 *  2. Stream açılır   → SoundCloud'da başlık araması → play-dl stream
 */

import play from "play-dl";
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
import { sendTextBasedChannel } from "./types";

// ── Track tipi ────────────────────────────────────────────────────────────────

export interface Track {
  title: string;
  url: string;
  duration: string;
  thumbnail: string;
  requestedBy: string;
  source?: "youtube" | "soundcloud" | "unknown";
  artist?: string;
  /** SoundCloud stream URL'i — her zaman dolu olacak */
  scUrl?: string;
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
        if (attempt > 1) await sleep(attempt * 1200);
        const clientId = await play.getFreeClientID();
        if (!clientId) throw new Error("Boş client_id");
        await play.setToken({ soundcloud: { client_id: clientId } });
        scReady = true;
        scInitPromise = null;
        logger.info({ attempt }, "SoundCloud istemci kimliği alındı");
        return;
      } catch (err) {
        logger.warn({ err, attempt }, "SoundCloud başlatma başarısız");
        if (attempt === 5) { scInitPromise = null; throw new Error("SoundCloud bağlanamadı"); }
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

function fmt(sec: number): string {
  if (!sec || sec <= 0) return "?:??";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

function isYouTubeUrl(q: string): boolean {
  return /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)/.test(q);
}
function isSoundCloudUrl(q: string): boolean {
  return /^https?:\/\/(www\.)?soundcloud\.com\//.test(q);
}
function isSpotifyUrl(q: string): boolean {
  return /^https?:\/\/open\.spotify\.com\/track\//.test(q);
}

// ── SoundCloud stream URL'i bul ───────────────────────────────────────────────
// Her zaman SoundCloud üzerinden stream ettiğimiz için kritik fonksiyon.
/** Birden fazla sorgu deneyerek ilk geçerli SoundCloud stream URL'ini döndürür */
async function findScStreamUrl(...candidates: string[]): Promise<string> {
  await ensureSoundCloud();

  // Her adayı sıraya koy: orijinal + temizlenmiş versiyon
  const queries: string[] = [];
  for (const raw of candidates) {
    if (!raw) continue;
    if (isSoundCloudUrl(raw)) return raw; // Direkt SC URL
    queries.push(raw);
    // Parantez/köşeli parantez temizlenmiş versiyon
    const clean = raw
      .replace(/\(official[^)]*\)/gi, "")
      .replace(/\[.*?\]/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (clean && clean !== raw) queries.push(clean);
  }

  // Dedupe
  const seen = new Set<string>();
  const unique = queries.filter((q) => { if (seen.has(q)) return false; seen.add(q); return true; });

  for (const q of unique) {
    const results = await play.search(q, { source: { soundcloud: "tracks" }, limit: 5 });
    if (results && results.length > 0) {
      const sc = results[0] as any;
      // sc.url = API URL (404 verir), sc.permalink = gerçek web URL
      const url: string = sc.permalink ?? sc.url ?? "";
      if (url) return url;
    }
  }

  throw new Error(`SoundCloud'da bulunamadı: ${unique[0] ?? "?"}`);
}

// ── Track çözümleme ───────────────────────────────────────────────────────────

async function resolveFromYouTube(query: string): Promise<Omit<Track, "requestedBy">> {
  if (isYouTubeUrl(query)) {
    try {
      const info = await play.video_info(query);
      const v = info.video_details as any;
      const title: string = v.title ?? "YouTube";
      const artist: string = v.channel?.name ?? "";
      // SC aramasında kanal adını kullanma — sadece başlıkla ara
      const scUrl = await findScStreamUrl(title, query);
      return {
        title,
        url: query,
        duration: fmt(v.durationInSec ?? 0),
        thumbnail: v.thumbnails?.[0]?.url ?? "",
        source: "youtube",
        artist,
        scUrl,
      };
    } catch {
      // video_info başarısız → metin araması
    }
  }

  // Metin araması
  const results = await play.search(query, { source: { youtube: "video" }, limit: 3 });
  if (!results || results.length === 0) throw new Error("YouTube'da sonuç bulunamadı");
  const best = results[0] as any;
  const videoUrl: string = best.url ?? best.video_url ?? "";
  if (!videoUrl) throw new Error("YouTube URL alınamadı");
  const title: string = best.title ?? query;
  const artist: string = best.channel?.name ?? "";
  // SC aramasında kanal adını KULLANMA — sadece başlıkla ara
  const scUrl = await findScStreamUrl(title, query);
  return {
    title,
    url: videoUrl,
    duration: fmt(best.durationInSec ?? 0),
    thumbnail: best.thumbnails?.[0]?.url ?? best.thumbnail?.url ?? "",
    source: "youtube",
    artist,
    scUrl,
  };
}

async function resolveFromSoundCloud(query: string): Promise<Omit<Track, "requestedBy">> {
  await ensureSoundCloud();

  if (isSoundCloudUrl(query)) {
    const sc = await play.soundcloud(query) as any;
    // permalink = gerçek web URL, sc.url = API URL (404)
    const streamUrl: string = sc.permalink ?? sc.url ?? query;
    return {
      title: sc.name ?? "Bilinmeyen",
      url: streamUrl,
      duration: fmt(sc.durationInSec ?? 0),
      thumbnail: sc.thumbnail ?? "",
      source: "soundcloud",
      artist: sc.user?.username ?? "",
      scUrl: streamUrl,
    };
  }

  const results = await play.search(query, { source: { soundcloud: "tracks" }, limit: 5 });
  if (!results || results.length === 0) throw new Error(`"${query}" SoundCloud'da bulunamadı`);
  const sc = results[0] as any;
  const streamUrl: string = sc.permalink ?? sc.url ?? "";
  return {
    title: sc.name ?? "Bilinmeyen",
    url: streamUrl,
    duration: fmt(sc.durationInSec ?? 0),
    thumbnail: sc.thumbnail ?? "",
    source: "soundcloud",
    artist: sc.user?.username ?? "",
    scUrl: streamUrl,
  };
}

export async function resolveTrack(query: string): Promise<Omit<Track, "requestedBy">> {
  // Spotify → sadece başlık bazlı SC araması (API yok)
  if (isSpotifyUrl(query)) {
    const m = query.match(/track\/([A-Za-z0-9]+)/);
    query = m?.[1] ?? query; // ID'yi arama terimi olarak kullan
    return resolveFromSoundCloud(query);
  }

  if (isSoundCloudUrl(query)) return resolveFromSoundCloud(query);

  // YouTube URL → önce YouTube metadata dene
  if (isYouTubeUrl(query)) {
    try { return await resolveFromYouTube(query); } catch { /* SC'ye düş */ }
    return resolveFromSoundCloud(query);
  }

  // Metin araması → YouTube metadata önce (daha iyi thumbnail), SC fallback
  try { return await resolveFromYouTube(query); } catch (ytErr: any) {
    logger.warn({ err: ytErr, query }, "YouTube arama başarısız, SoundCloud'a geçiliyor");
    return resolveFromSoundCloud(query);
  }
}

// ── Ses akışı: HER ZAMAN SoundCloud ─────────────────────────────────────────

async function createStream(track: Track): Promise<{ stream: any; type: StreamType }> {
  await ensureSoundCloud();

  const scUrl = track.scUrl ?? track.url;
  if (!scUrl) throw new Error("SoundCloud URL bulunamadı");

  let result: Awaited<ReturnType<typeof play.stream>>;
  try {
    result = await play.stream(scUrl, { quality: 2 });
  } catch (err: any) {
    // Token süresi dolmuş olabilir — yenile
    if (
      err?.message?.includes("401") ||
      err?.message?.includes("403") ||
      err?.message?.includes("client_id") ||
      err?.message?.includes("expired")
    ) {
      scReady = false;
      await ensureSoundCloud();
      result = await play.stream(scUrl, { quality: 2 });
    } else {
      // URL geçersiz → title ile yeniden ara
      logger.warn({ err, scUrl }, "SC stream başarısız, yeniden aranıyor");
      const fallbackUrl = await findScStreamUrl(track.title);
      result = await play.stream(fallbackUrl, { quality: 2 });
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
    sendTextBasedChannel(queue.textChannel, "📭 Kuyruk bitti, ses kanalından çıkıldı.").catch(() => null);
    return;
  }

  const track = queue.tracks[0]!;

  try {
    const { stream, type } = await createStream(track);
    const resource = createAudioResource(stream, { inputType: type, inlineVolume: false });
    queue.player.play(resource);
    logger.info({ title: track.title, source: track.source, guildId }, "Müzik çalınıyor (SC stream)");

    // Görsel kart
    try {
      const buf = await generateMusicCard(track, "playing");
      await sendTextBasedChannel(queue.textChannel, {
        content: `🎵 **${track.title}**`,
        files: [new AttachmentBuilder(buf, { name: "nowplaying.png" })],
      });
    } catch {
      sendTextBasedChannel(queue.textChannel, `▶️ **Çalınıyor:** ${track.title} — ${track.duration}`).catch(() => null);
    }
  } catch (err: any) {
    logger.error({ err, title: track.title }, "Şarkı oynatılamadı");
    sendTextBasedChannel(queue.textChannel, `❌ **${track.title}** oynatılamadı — ${err?.message ?? "bilinmeyen hata"}`).catch(() => null);
    queue.tracks.shift();
    if (queue.tracks.length > 0) {
      setTimeout(() => playNext(guildId).catch(() => null), 1000);
    } else {
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
  // 1. Track bilgisini çöz
  let trackInfo: Track;
  try {
    const resolved = await resolveTrack(query);
    trackInfo = { ...resolved, requestedBy };
  } catch (err: any) {
    logger.error({ err }, "Şarkı bulunamadı");
    return { track: null, position: 0, error: err?.message ?? "Şarkı bulunamadı" };
  }

  // 2. Kuyruk / bağlantı hazırla
  let queue = queues.get(guildId);

  if (!queue) {
    const player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Play },
    });

    // Mevcut bağlantı varsa kullan, yoksa yenisini oluştur
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
      connection.destroy();
      return { track: null, position: 0, error: "Ses kanalına bağlanılamadı" };
    }

    connection.subscribe(player);

    queue = { tracks: [], player, paused: false, textChannel, volume: 100 };
    queues.set(guildId, queue);

    // Yeniden bağlanma
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      if (!queues.has(guildId)) return;
      try {
        await Promise.race([
          entersState(connection!, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection!, VoiceConnectionStatus.Connecting, 5_000),
        ]);
        await entersState(connection!, VoiceConnectionStatus.Ready, 20_000);
      } catch {
        if (connection!.state.status !== VoiceConnectionStatus.Destroyed) {
          try {
            if (connection!.rejoinAttempts < 5) {
              await sleep((connection!.rejoinAttempts + 1) * 2_000);
              connection!.rejoin();
              await entersState(connection!, VoiceConnectionStatus.Ready, 20_000);
            } else {
              connection!.destroy();
              queues.delete(guildId);
              sendTextBasedChannel(textChannel, "⚠️ Ses bağlantısı kesildi ve yeniden kurulamadı.").catch(() => null);
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

    player.on(AudioPlayerStatus.Idle, () => {
      const q = queues.get(guildId);
      if (!q) return;
      q.tracks.shift();
      playNext(guildId).catch(() => null);
    });

    player.on("error", (err) => {
      logger.error({ err: err.message }, "Oynatıcı hatası");
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
