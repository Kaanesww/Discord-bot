/**
 * Watermark Modülü
 * ─────────────────────────────────────────────────────────────────────────────
 * Onaylanan medya dosyalarının sol üst köşesine Discord logosu + metin ekler.
 * • Görseller : @napi-rs/canvas  (JPEG→JPEG, PNG/GIF/WEBP→PNG)
 * • Videolar  : ffmpeg libx264 re-encode  (her format → mp4, garantili çalışır)
 */

import { createCanvas, loadImage, type Image } from "@napi-rs/canvas";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import nodePath from "node:path";
import { writeFile, readFile, unlink } from "node:fs/promises";
import { promisify } from "node:util";
import { logger } from "../lib/logger";

const execFileAsync = promisify(execFile);

// ffmpeg'i PATH üzerinden çağır — Nix store hash değişse de çalışır
const ffmpegPath = "ffmpeg";

// ── Discord ikonu önbelleği ───────────────────────────────────────────────────
let _discordIconImg: Image | null = null;

async function getDiscordIcon(): Promise<Image | null> {
  if (_discordIconImg) return _discordIconImg;
  const URLS = [
    "https://discord.com/assets/f9bb9c4af2b9c32a2c5ee0014661546d.png",
    "https://assets-global.discord.com/assets/f9bb9c4af2b9c32a2c5ee0014661546d.png",
  ];
  for (const url of URLS) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      _discordIconImg = await loadImage(Buffer.from(await res.arrayBuffer()));
      return _discordIconImg;
    } catch { /* dene */ }
  }
  return null;
}

// ── Yedek ikon (mavi daire + "d") ────────────────────────────────────────────
function drawFallbackIcon(
  ctx: ReturnType<ReturnType<typeof createCanvas>["getContext"]>,
  cx: number,
  cy: number,
  r: number,
): void {
  ctx.save();
  ctx.fillStyle = "#5865F2";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "white";
  ctx.font = `bold ${Math.round(r * 1.1)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("d", cx, cy + 1);
  ctx.restore();
}

// ── https:// ön ekini kaldır ──────────────────────────────────────────────────
function stripHttps(url: string): string {
  return url.replace(/^https?:\/\//i, "");
}

// ── Watermark konumu ──────────────────────────────────────────────────────────
function randomPos(
  cw: number, ch: number,
  wmW: number, wmH: number,
  m: number,
): { x: number; y: number } {
  // Sunucu sahibinin belirlediği URL her medyada tutarlı olarak sol üstte
  // görünür. Sınırlar negatif olursa da görselin içine sabitlenir.
  return {
    x: Math.max(0, Math.min(m, cw - wmW)),
    y: Math.max(0, Math.min(m, ch - wmH)),
  };
}

// ── Görsel watermark ──────────────────────────────────────────────────────────
// JPEG girişi → JPEG çıkış (küçük), diğerleri → PNG

export async function applyImageWatermark(
  buffer: Buffer,
  filename: string,
  rawText: string,
): Promise<{ buffer: Buffer; name: string }> {
  const text = stripHttps(rawText);
  const displayText = text.length > 80 ? `${text.slice(0, 77)}...` : text;
  try {
    const img    = await loadImage(buffer);
    const canvas = createCanvas(img.width, img.height);
    const ctx    = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);

    // Font: görselin genişliğine göre, küçük görsellerde de taşmayacak boyut.
    let fontSize = Math.max(12, Math.min(32, Math.round(img.width * 0.038)));
    const margin   = 14;

    ctx.font = `bold ${fontSize}px sans-serif`;
    let textW = Math.ceil(ctx.measureText(displayText).width);
    let totalW = Math.round(fontSize * 1.55) + Math.round(fontSize * 0.4) + textW;
    while (fontSize > 10 && totalW > img.width - margin * 2) {
      fontSize -= 1;
      ctx.font = `bold ${fontSize}px sans-serif`;
      textW = Math.ceil(ctx.measureText(displayText).width);
      totalW = Math.round(fontSize * 1.55) + Math.round(fontSize * 0.4) + textW;
    }
    const iconSize = Math.round(fontSize * 1.55);
    const iconR    = iconSize / 2;
    const gap      = Math.round(fontSize * 0.4);
    const totalH   = Math.max(iconSize, fontSize + 4);

    // Sol üst köşe, kontrollü kenar boşluğu
    const { x: sx, y: sy } = randomPos(img.width, img.height, totalW, totalH, margin);
    const iconCX = sx + iconR;
    const iconCY = sy + totalH / 2;

    // Discord ikonu
    const icon = await getDiscordIcon();
    if (icon) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(iconCX, iconCY, iconR, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(icon, iconCX - iconR, iconCY - iconR, iconSize, iconSize);
      ctx.restore();
    } else {
      drawFallbackIcon(ctx, iconCX, iconCY, iconR);
    }

    // Metin
    const textX = sx + iconSize + gap;
    const textY = sy + totalH / 2 + fontSize * 0.35;
    ctx.shadowColor   = "rgba(0,0,0,0.75)";
    ctx.shadowBlur    = 5;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    ctx.font      = `bold ${fontSize}px sans-serif`;
    ctx.fillStyle = "white";
    ctx.fillText(displayText, textX, textY);

    // Çıkış formatı: JPEG girişi için JPEG (küçük), diğerleri PNG
    const ext  = nodePath.extname(filename).toLowerCase();
    const base = nodePath.basename(filename, ext);
    if (ext === ".jpg" || ext === ".jpeg") {
      return {
        buffer:  canvas.toBuffer("image/jpeg", 88),
        name:    filename,           // aynı isim, aynı uzantı
      };
    }
    return {
      buffer:  canvas.toBuffer("image/png"),
      name:    `${base}.png`,
    };
  } catch (err) {
    logger.warn({ err, filename }, "Görsel watermark hatası, orijinal gönderiliyor");
    return { buffer, name: filename };
  }
}

// ── Video watermark ───────────────────────────────────────────────────────────
// Her format → mp4 (libx264, ultrafast) — en güvenilir yaklaşım.

const VIDEO_OVERLAY_POSITIONS = [
  "14:14",
  "main_w-overlay_w-14:14",
  "14:main_h-overlay_h-14",
  "main_w-overlay_w-14:main_h-overlay_h-14",
  "(main_w-overlay_w)/2:14",
  "(main_w-overlay_w)/2:main_h-overlay_h-14",
  "14:(main_h-overlay_h)/2",
  "main_w-overlay_w-14:(main_h-overlay_h)/2",
] as const;

async function buildWatermarkPng(text: string, fontSize: number): Promise<Buffer> {
  const iconSize = Math.round(fontSize * 1.55);
  const iconR    = iconSize / 2;
  const gap      = Math.round(fontSize * 0.4);

  const mc   = createCanvas(1, 1);
  const mCtx = mc.getContext("2d");
  mCtx.font = `bold ${fontSize}px sans-serif`;
  const textW  = Math.ceil(mCtx.measureText(text).width);
  const totalW = iconSize + gap + textW;
  const totalH = Math.max(iconSize, fontSize + 4);

  const canvas = createCanvas(totalW, totalH);
  const ctx    = canvas.getContext("2d");

  // Ikon
  const iconCX = iconR;
  const iconCY = totalH / 2;
  const icon   = await getDiscordIcon();
  if (icon) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(iconCX, iconCY, iconR, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(icon, iconCX - iconR, iconCY - iconR, iconSize, iconSize);
    ctx.restore();
  } else {
    drawFallbackIcon(ctx, iconCX, iconCY, iconR);
  }

  // Metin
  ctx.shadowColor   = "rgba(0,0,0,0.75)";
  ctx.shadowBlur    = 5;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 1;
  ctx.font      = `bold ${fontSize}px sans-serif`;
  ctx.fillStyle = "white";
  ctx.fillText(text, iconSize + gap, iconCY + fontSize * 0.35);

  return canvas.toBuffer("image/png");
}

export async function applyVideoWatermark(
  buffer: Buffer,
  filename: string,
  rawText: string,
): Promise<{ buffer: Buffer; name: string }> {
  const text = stripHttps(rawText);
  const displayText = text.length > 80 ? `${text.slice(0, 77)}...` : text;

  const wmBuffer = await buildWatermarkPng(displayText, 24);

  const id         = randomUUID();
  const inExt      = nodePath.extname(filename).toLowerCase() || ".mp4";
  const base       = nodePath.basename(filename, inExt);
  const inputPath  = nodePath.join(tmpdir(), `wm-in-${id}${inExt}`);
  const wmPath     = nodePath.join(tmpdir(), `wm-img-${id}.png`);
  const outputPath = nodePath.join(tmpdir(), `wm-out-${id}.mp4`); // her zaman mp4

  await Promise.all([writeFile(inputPath, buffer), writeFile(wmPath, wmBuffer)]);

  const overlayPos = VIDEO_OVERLAY_POSITIONS[0]!;

  try {
    // libx264 re-encode: her giriş formatıyla çalışır
    // scale filtresi: h264 çift piksel zorunluluğunu karşılar
    await execFileAsync(ffmpegPath, [
      "-y",
      "-i",  inputPath,
      "-i",  wmPath,
      "-filter_complex",
      `[0:v]scale=trunc(iw/2)*2:trunc(ih/2)*2[sv];[sv][1:v]overlay=${overlayPos}[out]`,
      "-map", "[out]",
      "-map", "0:a?",           // ses varsa kopyala
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-crf", "23",
      "-c:a", "aac",
      "-movflags", "+faststart",
      outputPath,
    ], { timeout: 120_000, killSignal: "SIGKILL" });

    const result  = await readFile(outputPath);
    const outName = `${base}.mp4`;
    logger.info({ filename, outName, overlayPos }, "Video watermark eklendi");
    return { buffer: result, name: outName };
  } catch (err) {
    logger.error({ err, filename }, "ffmpeg watermark hatası, orijinal video gönderiliyor");
    return { buffer, name: filename };
  } finally {
    await Promise.allSettled([unlink(inputPath), unlink(wmPath), unlink(outputPath)]);
  }
}
