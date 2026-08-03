/**
 * Watermark Modülü
 * ─────────────────────────────────────────────────────────────────────────────
 * Onaylanan medya dosyalarının ORTASINA saydam URL watermark ekler.
 * • Görseller: @napi-rs/canvas ile metin overlay
 * • Videolar:  sistem ffmpeg ile image overlay filtresi
 */

import { createCanvas, loadImage } from "@napi-rs/canvas";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import nodePath from "node:path";
import { writeFile, readFile, unlink } from "node:fs/promises";
import { promisify } from "node:util";
import { logger } from "../lib/logger";

const execFileAsync = promisify(execFile);

// ── ffmpeg binary ─────────────────────────────────────────────────────────────
// Önce sistem ffmpeg'i dene (NixOS'ta her zaman mevcut),
// bulunamazsa ffmpeg-static paketini dene.
function resolveFfmpeg(): string | null {
  // Sistem ffmpeg – Replit NixOS ortamında mevcut
  const SYSTEM_FFMPEG = "/nix/store/jj9hkc8i90yb3dpcyyqlncijyj71w9id-replit-runtime-path/bin/ffmpeg";
  try {
    const fs = require("node:fs");
    if (fs.existsSync(SYSTEM_FFMPEG)) return SYSTEM_FFMPEG;
  } catch { /* ignore */ }

  // Yedek: ffmpeg-static paketi
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const p = require("ffmpeg-static") as string | null;
    if (p) return p;
  } catch { /* ignore */ }

  return null;
}

const ffmpegPath: string | null = resolveFfmpeg();

// ── Watermark PNG oluşturucu (hem görsel hem video için kullanılır) ────────────

async function buildWatermarkPng(url: string, fontSize: number): Promise<Buffer> {
  const padding = 14;

  // Metin genişliğini ölç
  const mc  = createCanvas(1, 1);
  const mCtx = mc.getContext("2d");
  mCtx.font = `bold ${fontSize}px sans-serif`;
  const textW = Math.ceil(mCtx.measureText(url).width);
  const textH = fontSize;

  const cw = textW + padding * 2;
  const ch = textH + padding * 2;

  const canvas = createCanvas(cw, ch);
  const ctx    = canvas.getContext("2d");

  // Yarı saydam arka plan (daha şeffaf)
  ctx.fillStyle = "rgba(0,0,0,0.30)";
  ctx.fillRect(0, 0, cw, ch);

  // Hafif gölge — okunabilirliği artırır
  ctx.shadowColor   = "rgba(0,0,0,0.60)";
  ctx.shadowBlur    = 6;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 1;

  // Metin
  ctx.font      = `bold ${fontSize}px sans-serif`;
  ctx.fillStyle = "rgba(255,255,255,0.80)";
  ctx.fillText(url, padding, padding + textH - 2);

  return canvas.toBuffer("image/png");
}

// ── Görsel watermark ──────────────────────────────────────────────────────────

export async function applyImageWatermark(
  buffer: Buffer,
  filename: string,
  url: string,
): Promise<{ buffer: Buffer; name: string }> {
  try {
    const img    = await loadImage(buffer);
    const canvas = createCanvas(img.width, img.height);
    const ctx    = canvas.getContext("2d");

    // Orijinal görseli çiz
    ctx.drawImage(img, 0, 0);

    // Font boyutu: görselin genişliğine göre ölçekle, min 24 max 44 px
    const fontSize = Math.max(24, Math.min(44, Math.round(img.width * 0.045)));
    const padding  = 14;

    ctx.font = `bold ${fontSize}px sans-serif`;
    const textW = Math.ceil(ctx.measureText(url).width);
    const textH = fontSize;

    const boxW = textW + padding * 2;
    const boxH = textH + padding * 2;

    // Merkez koordinatları
    const bx = Math.round((img.width  - boxW) / 2);
    const by = Math.round((img.height - boxH) / 2);

    // Yarı saydam arka plan
    ctx.fillStyle = "rgba(0,0,0,0.30)";
    ctx.fillRect(bx, by, boxW, boxH);

    // Gölge
    ctx.shadowColor   = "rgba(0,0,0,0.60)";
    ctx.shadowBlur    = 6;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;

    // URL metni
    ctx.font      = `bold ${fontSize}px sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.80)";
    ctx.fillText(url, bx + padding, by + padding + textH - 2);

    // PNG olarak dışa aktar
    const ext     = nodePath.extname(filename).toLowerCase();
    const base    = nodePath.basename(filename, ext);
    const outName = ext === ".png" ? filename : `${base}.png`;

    return { buffer: canvas.toBuffer("image/png"), name: outName };
  } catch (err) {
    logger.warn({ err, filename }, "Görsel watermark eklenemedi, orijinal dosya kullanılıyor");
    return { buffer, name: filename };
  }
}

// ── Video watermark ───────────────────────────────────────────────────────────

export async function applyVideoWatermark(
  buffer: Buffer,
  filename: string,
  url: string,
): Promise<{ buffer: Buffer; name: string }> {
  if (!ffmpegPath) {
    logger.warn("ffmpeg bulunamadı, video watermark atlandı");
    return { buffer, name: filename };
  }

  // Video watermark için daha büyük PNG
  const fontSize = 32;
  let wmBuffer: Buffer;
  try {
    wmBuffer = await buildWatermarkPng(url, fontSize);
  } catch (err) {
    logger.warn({ err }, "Watermark PNG oluşturulamadı, video watermark atlandı");
    return { buffer, name: filename };
  }

  const id         = randomUUID();
  const ext        = nodePath.extname(filename).toLowerCase() || ".mp4";
  const inputPath  = nodePath.join(tmpdir(), `wm-in-${id}${ext}`);
  const wmPath     = nodePath.join(tmpdir(), `wm-img-${id}.png`);
  const outputPath = nodePath.join(tmpdir(), `wm-out-${id}${ext}`);

  await Promise.all([
    writeFile(inputPath, buffer),
    writeFile(wmPath, wmBuffer),
  ]);

  try {
    // overlay filtresi: watermark PNG'yi videonun tam ortasına yerleştir
    await execFileAsync(ffmpegPath, [
      "-i",  inputPath,
      "-i",  wmPath,
      "-filter_complex",
      "[0:v][1:v]overlay=(main_w-overlay_w)/2:(main_h-overlay_h)/2",
      "-c:a", "copy",
      "-y",
      outputPath,
    ]);

    const result = await readFile(outputPath);
    logger.info({ filename }, "Video watermark eklendi (merkez)");
    return { buffer: result, name: filename };
  } catch (err) {
    logger.warn({ err, filename }, "ffmpeg watermark hatası, orijinal video kullanılıyor");
    return { buffer, name: filename };
  } finally {
    await Promise.allSettled([
      unlink(inputPath),
      unlink(wmPath),
      unlink(outputPath),
    ]);
  }
}
