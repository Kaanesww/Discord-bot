/**
 * Watermark Modülü
 * ─────────────────────────────────────────────────────────────────────────────
 * Onaylanan medya dosyalarının sol üst köşesine URL watermark ekler.
 * • Görseller: @napi-rs/canvas ile metin overlay
 * • Videolar:  ffmpeg-static ile image overlay filtresi
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
// ffmpeg-static modül tipi için
import ffmpegBin from "ffmpeg-static";
const ffmpegPath: string | null = ffmpegBin ?? null;

// ── Watermark görsel oluşturucu ───────────────────────────────────────────────

async function createWatermarkPng(url: string, fontSize: number): Promise<Buffer> {
  const padding = 6;
  const margin  = 0; // canvas'a 0,0'dan başlayacak, overlay sırasında offset verilir

  const measureCanvas = createCanvas(1, 1);
  const mCtx = measureCanvas.getContext("2d");
  mCtx.font = `bold ${fontSize}px sans-serif`;
  const measured = mCtx.measureText(url);
  const textW = Math.ceil(measured.width);
  const textH = fontSize;

  const cw = textW + padding * 2;
  const ch = textH + padding * 2;

  const canvas = createCanvas(cw, ch);
  const ctx = canvas.getContext("2d");

  // Yarı saydam arka plan
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 0, cw, ch);

  // URL metni
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.fillStyle = "rgba(255,255,255,0.95)";
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
    const img = await loadImage(buffer);
    const canvas = createCanvas(img.width, img.height);
    const ctx    = canvas.getContext("2d");

    // Orijinal görseli çiz
    ctx.drawImage(img, 0, 0);

    // Yazı tipi: görselin genişliğine göre ölçekle, min 12 max 22 px
    const fontSize = Math.max(12, Math.min(22, Math.round(img.width * 0.022)));
    const padding  = 6;
    const margin   = 10; // sol üst boşluk

    ctx.font = `bold ${fontSize}px sans-serif`;
    const measured = ctx.measureText(url);
    const textW = Math.ceil(measured.width);
    const textH = fontSize;

    // Arka plan kutusu
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(margin, margin, textW + padding * 2, textH + padding * 2);

    // Metin
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.fillText(url, margin + padding, margin + padding + textH - 2);

    // Çıkış: PNG olarak kaydet (dosya adı uzantısını güncelle)
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

  const fontSize    = 16;
  const overlayX    = 10;
  const overlayY    = 10;

  let wmBuffer: Buffer;
  try {
    wmBuffer = await createWatermarkPng(url, fontSize);
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
    await execFileAsync(ffmpegPath, [
      "-i",  inputPath,
      "-i",  wmPath,
      "-filter_complex", `[0:v][1:v]overlay=${overlayX}:${overlayY}`,
      "-c:a", "copy",
      "-y",
      outputPath,
    ]);

    const result = await readFile(outputPath);
    logger.info({ filename, overlayX, overlayY }, "Video watermark eklendi");
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
