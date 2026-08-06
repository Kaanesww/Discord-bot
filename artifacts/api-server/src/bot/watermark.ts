/**
 * Watermark Modülü
 * ─────────────────────────────────────────────────────────────────────────────
 * Fotoğraflar  → @napi-rs/canvas ile sol üst köşeye yazı basar
 * Videolar     → ffmpeg drawtext filtresi ile sol üst köşeye yazı basar
 */

import { createCanvas, loadImage } from "@napi-rs/canvas";
import { execFile }                 from "child_process";
import { promisify }                from "util";
import { writeFile, readFile, unlink } from "fs/promises";
import { tmpdir }                   from "os";
import { join }                     from "path";

const exec = promisify(execFile);

const FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";

// ── Fotoğraf watermark ────────────────────────────────────────────────────────

export async function watermarkImage(
  buffer: Buffer,
  text:   string,
  ext:    string, // ".jpg" | ".png" | ".gif" | ".webp"
): Promise<Buffer> {
  const img    = await loadImage(buffer);
  const canvas = createCanvas(img.width, img.height);
  const ctx    = canvas.getContext("2d");

  // Orijinal resmi çiz
  ctx.drawImage(img, 0, 0);

  // Yazı boyutunu resim genişliğine göre ölçekle (min 22px, max 72px)
  const fontSize = Math.min(72, Math.max(22, Math.floor(img.width / 22)));
  const padding  = Math.floor(fontSize * 0.6);

  ctx.font      = `bold ${fontSize}px "DejaVu Sans"`;
  ctx.textBaseline = "top";

  // Arka plan kutusu (yarı saydam siyah) — okunabilirlik için
  const metrics    = ctx.measureText(text);
  const boxPad     = Math.floor(fontSize * 0.3);
  const boxW       = metrics.width  + boxPad * 2;
  const boxH       = fontSize       + boxPad * 2;

  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  ctx.beginPath();
  // Yuvarlatılmış köşe (basit dikdörtgen fallback)
  ctx.fillRect(padding - boxPad, padding - boxPad, boxW, boxH);

  // Gölge
  ctx.shadowColor   = "rgba(0,0,0,0.9)";
  ctx.shadowBlur    = 6;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;

  // Beyaz yazı
  ctx.fillStyle = "#FFFFFF";
  ctx.fillText(text, padding, padding);

  const fmt = ext === ".png" ? "image/png" : "image/jpeg";
  return canvas.toBuffer(fmt as any, 92);
}

// ── Video watermark ───────────────────────────────────────────────────────────

export async function watermarkVideo(
  buffer: Buffer,
  text:   string,
  ext:    string, // ".mp4" | ".webm" | ".mov" | ".avi" | ".mkv"
): Promise<{ buffer: Buffer; ext: string }> {
  const ts    = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const tmpIn  = join(tmpdir(), `wm_in_${ts}${ext}`);
  const tmpOut = join(tmpdir(), `wm_out_${ts}.mp4`); // Her zaman mp4 çıktı

  try {
    await writeFile(tmpIn, buffer);

    // ffmpeg drawtext: özel karakterleri kaçır
    const escaped = text
      .replace(/\\/g, "\\\\")
      .replace(/:/g,  "\\:")
      .replace(/'/g,  "\\'")
      .replace(/\[/g, "\\[")
      .replace(/\]/g, "\\]");

    await exec("ffmpeg", [
      "-i", tmpIn,
      "-vf",
      [
        `drawtext=fontfile='${FONT_PATH}'`,
        `text='${escaped}'`,
        "fontsize=36",
        "fontcolor=white",
        "x=20",
        "y=20",
        "shadowcolor=black@0.9",
        "shadowx=2",
        "shadowy=2",
        "box=1",
        "boxcolor=black@0.50",
        "boxborderw=8",
      ].join(":"),
      "-c:v", "libx264",
      "-preset", "veryfast",   // Hızlı encode
      "-crf", "23",
      "-c:a", "copy",
      "-movflags", "+faststart",
      "-y", tmpOut,
    ]);

    const out = await readFile(tmpOut);
    return { buffer: out, ext: ".mp4" };

  } finally {
    await unlink(tmpIn).catch(() => {});
    await unlink(tmpOut).catch(() => {});
  }
}

// ── Tek giriş noktası ─────────────────────────────────────────────────────────

export async function applyWatermark(
  buffer:  Buffer,
  name:    string,
  isVideo: boolean,
  text:    string,
): Promise<{ buffer: Buffer; name: string }> {
  const dotIdx = name.lastIndexOf(".");
  const base   = dotIdx >= 0 ? name.slice(0, dotIdx) : name;
  const ext    = dotIdx >= 0 ? name.slice(dotIdx).toLowerCase() : "";

  if (isVideo) {
    const result = await watermarkVideo(buffer, text, ext);
    return { buffer: result.buffer, name: `${base}${result.ext}` };
  } else {
    const wm = await watermarkImage(buffer, text, ext);
    // PNG kalır PNG, geri kalan JPEG
    const outExt = ext === ".png" ? ".png" : ".jpg";
    return { buffer: wm, name: `${base}${outExt}` };
  }
}
