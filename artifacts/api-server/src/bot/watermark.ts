/**
 * Watermark Modülü
 * ─────────────────────────────────────────────────────────────────────────────
 * Onaylanan medya dosyalarının SAĞ ÜST köşesine Discord logosu + metin watermark ekler.
 * Ekran görüntüsündeki gibi: mavi Discord dairesi + beyaz kalın metin, arka plan kutusu yok.
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

// ── ffmpeg binary ─────────────────────────────────────────────────────────────
function resolveFfmpeg(): string | null {
  const SYSTEM_FFMPEG = "/nix/store/jj9hkc8i90yb3dpcyyqlncijyj71w9id-replit-runtime-path/bin/ffmpeg";
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs") as typeof import("node:fs");
    if (fs.existsSync(SYSTEM_FFMPEG)) return SYSTEM_FFMPEG;
  } catch { /* ignore */ }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const p = require("ffmpeg-static") as string | null;
    if (p) return p;
  } catch { /* ignore */ }
  return null;
}
const ffmpegPath: string | null = resolveFfmpeg();

// ── Discord ikonu önbelleği ───────────────────────────────────────────────────
// Discord'un mavi Clyde / logo ikonu, bir kez indirilip bellekte tutulur.
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
      const buf = Buffer.from(await res.arrayBuffer());
      _discordIconImg = await loadImage(buf);
      return _discordIconImg;
    } catch { /* dene */ }
  }
  logger.warn("Discord ikonu indirilemedi, yedek çizilecek");
  return null;
}

// ── Mavi Discord dairesi çiz (yedek) ─────────────────────────────────────────
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

// ── Watermark PNG oluşturucu ──────────────────────────────────────────────────
// Sonuçtaki PNG, hem görsel overlay'i hem de ffmpeg için kullanılır.
// Layout: [icon] [boşluk] [metin]   — sağ üst köşeye yerleştirilir

async function buildWatermarkPng(text: string, fontSize: number): Promise<Buffer> {
  const iconSize = Math.round(fontSize * 1.55); // daire çapı
  const gap      = Math.round(fontSize * 0.4);  // ikon-metin arası
  const iconR    = iconSize / 2;

  // Metin ölçüsü
  const mc  = createCanvas(1, 1);
  const mCtx = mc.getContext("2d");
  mCtx.font = `bold ${fontSize}px sans-serif`;
  const textW = Math.ceil(mCtx.measureText(text).width);

  const totalW = iconSize + gap + textW;
  const totalH = Math.max(iconSize, fontSize + 4);

  const canvas = createCanvas(totalW, totalH);
  const ctx    = canvas.getContext("2d");

  // ── Discord ikonu ──
  const iconCX = iconR;
  const iconCY = totalH / 2;
  const icon   = await getDiscordIcon();

  if (icon) {
    // Dairesel kırpma ile ikon çiz
    ctx.save();
    ctx.beginPath();
    ctx.arc(iconCX, iconCY, iconR, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(icon, iconCX - iconR, iconCY - iconR, iconSize, iconSize);
    ctx.restore();
  } else {
    drawFallbackIcon(ctx, iconCX, iconCY, iconR);
  }

  // ── Metin: gölge + beyaz yazı ──
  const textX = iconSize + gap;
  const textY = iconCY + fontSize * 0.35; // dikey ortalama

  // Gölge — okunabilirlik için
  ctx.shadowColor   = "rgba(0,0,0,0.75)";
  ctx.shadowBlur    = 5;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 1;

  ctx.font      = `bold ${fontSize}px sans-serif`;
  ctx.fillStyle = "white";
  ctx.fillText(text, textX, textY);

  return canvas.toBuffer("image/png");
}

// ── Görsel watermark ──────────────────────────────────────────────────────────

export async function applyImageWatermark(
  buffer: Buffer,
  filename: string,
  text: string,
): Promise<{ buffer: Buffer; name: string }> {
  try {
    const img    = await loadImage(buffer);
    const canvas = createCanvas(img.width, img.height);
    const ctx    = canvas.getContext("2d");

    ctx.drawImage(img, 0, 0);

    // Yazı tipi boyutu: görselin genişliğine göre, min 18 max 32 px
    const fontSize = Math.max(18, Math.min(32, Math.round(img.width * 0.038)));
    const iconSize = Math.round(fontSize * 1.55);
    const iconR    = iconSize / 2;
    const gap      = Math.round(fontSize * 0.4);
    const margin   = 14; // kenardan boşluk

    // Metin genişliği
    ctx.font = `bold ${fontSize}px sans-serif`;
    const textW = Math.ceil(ctx.measureText(text).width);

    const totalW = iconSize + gap + textW;
    const totalH = Math.max(iconSize, fontSize + 4);

    // Sağ üst köşe konumu
    const startX = img.width  - totalW - margin;
    const startY = margin;
    const iconCX = startX + iconR;
    const iconCY = startY + totalH / 2;

    // ── Discord ikonu ──
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

    // ── Metin ──
    const textX = startX + iconSize + gap;
    const textY = startY + totalH / 2 + fontSize * 0.35;

    ctx.shadowColor   = "rgba(0,0,0,0.75)";
    ctx.shadowBlur    = 5;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    ctx.font          = `bold ${fontSize}px sans-serif`;
    ctx.fillStyle     = "white";
    ctx.fillText(text, textX, textY);

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
  text: string,
): Promise<{ buffer: Buffer; name: string }> {
  if (!ffmpegPath) {
    logger.warn("ffmpeg bulunamadı, video watermark atlandı");
    return { buffer, name: filename };
  }

  let wmBuffer: Buffer;
  try {
    wmBuffer = await buildWatermarkPng(text, 24); // videolar için 24px
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
    // Sağ üst köşe: main_w - overlay_w - 14 piksel sağdan, 14 piksel üstten
    await execFileAsync(ffmpegPath, [
      "-i",  inputPath,
      "-i",  wmPath,
      "-filter_complex",
      "[0:v][1:v]overlay=main_w-overlay_w-14:14",
      "-c:a", "copy",
      "-y",
      outputPath,
    ]);

    const result = await readFile(outputPath);
    logger.info({ filename }, "Video watermark eklendi (sağ üst)");
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
