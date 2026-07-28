/**
 * Müzik sistemi — SoundCloud üzerinden play-dl ile ses akışı.
 * YouTube datacenter IP engelini aşmak için SoundCloud kullanılır.
 */
import play from "play-dl";
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

// ── Tipler ────────────────────────────────────────────────────────────────────

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

// ── SoundCloud başlatma ───────────────────────────────────────────────────────

let scReady = false;
let scInitPromise: Promise<void> | null = null;

async function ensureSoundCloud(): Promise<void> {
  if (scReady) return;
  // Aynı anda birden fazla çağrı varsa tek bir promise'e bağlan
  if (scInitPromise) return scInitPromise;

  scInitPromise = (async () => {
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        if (attempt > 1) {
          await new Promise<void>((r) => setTimeout(r, attempt * 1000));
        }
        const clientId = await play.getFreeClientID();
        if (!clientId) throw new Error("Boş client_id");
        await play.setToken({ soundcloud: { client_id: clientId } });
        scReady = true;
        scInitPromise = null;
        logger.info({ attempt }, "SoundCloud istemci kimliği alındı");
        return;
      } catch (err) {
        logger.warn({ err, attempt }, "SoundCloud başlatma denemesi başarısız");
        if (attempt === 5) {
          scInitPromise = null; // sonraki çağrıda tekrar denesin
          throw new Error(`SoundCloud bağlantısı kurulamadı (${attempt} deneme)`);
        }
      }
    }
  })();

  return scInitPromise;
}

/** Bot startup'ta müzik sistemini ısındır — ilk kullanıcı komutunu hızlandırır */
export async function warmupMusic(): Promise<void> {
  try {
    await ensureSoundCloud();
  } catch (err) {
    logger.warn({ err }, "Müzik ısınma başarısız (ilk kullanımda tekrar denenecek)");
  }
}

// ── Yardımcılar ───────────────────────────────────────────────────────────────

function formatDuration(sec: number): string {
  if (!sec || sec <= 0) return "?:??";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ── Şarkı arama ───────────────────────────────────────────────────────────────

async function resolveTrack(query: string): Promise<Track> {
  await ensureSoundCloud();

  // SoundCloud URL'si mi?
  const isSoundCloudUrl =
    query.startsWith("https://soundcloud.com/") ||
    query.startsWith("http://soundcloud.com/");

  if (isSoundCloudUrl) {
    const info = await play.soundcloud(query);
    const sc = info as any;
    return {
      title: sc.name ?? "Bilinmeyen",
      url: sc.url ?? query,
      duration: formatDuration(sc.durationInSec ?? 0),
      thumbnail: sc.thumbnail ?? "",
      requestedBy: "",
    };
  }

  // YouTube URL ise video ID / sorgu olarak arama yap
  let searchQuery = query;
  if (query.startsWith("http://") || query.startsWith("https://")) {
    // YouTube URL — URL'den çıkaramayız, metin olarak arayalım
    const urlObj = new URL(query);
    const v = urlObj.searchParams.get("v");
    searchQuery = v ?? query; // en azından video ID ile arama yap
  }

  const results = await play.search(searchQuery, {
    source: { soundcloud: "tracks" },
    limit: 1,
  });

  if (!results || results.length === 0) {
    throw new Error(`"${searchQuery}" için SoundCloud'da sonuç bulunamadı`);
  }

  const sc = results[0] as any;
  return {
    title: sc.name ?? "Bilinmeyen",
    url: sc.url ?? "",
    duration: formatDuration(sc.durationInSec ?? 0),
    thumbnail: sc.thumbnail ?? "",
    requestedBy: "",
  };
}

// ── Ses akışı ─────────────────────────────────────────────────────────────────

async function createSoundCloudStream(
  url: string
): Promise<{ stream: NodeJS.ReadableStream; type: StreamType }> {
  await ensureSoundCloud();
  let result: Awaited<ReturnType<typeof play.stream>>;
  try {
    result = await play.stream(url);
  } catch (err: any) {
    // Token süresi dolmuş ya da 401 — token sıfırla ve tekrar dene
    if (
      err?.message?.includes("401") ||
      err?.message?.includes("403") ||
      err?.message?.includes("client_id")
    ) {
      scReady = false;
      await ensureSoundCloud();
      result = await play.stream(url);
    } else {
      throw err;
    }
  }
  // play-dl StreamType → @discordjs/voice StreamType doğru eşleşmesi
  // "opus" = ham Opus çerçeveleri → ffmpeg gerekir → Arbitrary
  // "ogg/opus" = OGG kapsayıcısı → OggOpus
  // "webm/opus" = WebM kapsayıcısı → WebmOpus
  let dtype: StreamType;
  switch (result.type) {
    case "ogg/opus":
      dtype = StreamType.OggOpus;
      break;
    case "webm/opus":
      dtype = StreamType.WebmOpus;
      break;
    default:
      dtype = StreamType.Arbitrary; // ham opus veya bilinmeyen → ffmpeg decode eder
  }
  return { stream: result.stream as unknown as NodeJS.ReadableStream, type: dtype };
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

  try {
    const { stream, type } = await createSoundCloudStream(track.url);
    const resource = createAudioResource(stream, { inputType: type });
    queue.player.play(resource);
    logger.info({ title: track.title, guildId, type }, "Müzik çalınıyor");
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
  // 1. Şarkı bilgisini SoundCloud'dan al
  let trackInfo: Track;
  try {
    const resolved = await resolveTrack(query);
    trackInfo = { ...resolved, requestedBy };
  } catch (err: any) {
    logger.error({ err }, "Şarkı bilgisi alınamadı");
    return {
      track: null,
      position: 0,
      error: err?.message ?? "Şarkı bulunamadı",
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

    // Şarkı bitince bir sonrakine geç
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

    // Bağlantı kopunca yeniden bağlanmayı dene
    connection.on(
      VoiceConnectionStatus.Disconnected,
      async (_old, newState) => {
        if (
          newState.reason ===
            VoiceConnectionDisconnectReason.WebSocketClose &&
          newState.closeCode === 4014
        ) {
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
    if (conn) {
      conn.destroy();
      return true;
    }
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
    queues.has(guildId) && (queues.get(guildId)?.tracks.length ?? 0) > 0
  );
}
