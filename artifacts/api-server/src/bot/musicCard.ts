/**
 * Müzik görsel kartı — @napi-rs/canvas ile "Now Playing" / "Added to Queue" görseli
 */
import { createCanvas, loadImage, type SKRSContext2D } from "@napi-rs/canvas";
import type { Track } from "./music";

const W = 900;
const H = 280;

const SRC_COLORS: Record<string, string> = {
  youtube: "#FF0000",
  soundcloud: "#FF5500",
  spotify: "#1DB954",
  unknown: "#5865F2",
};

const SRC_LABELS: Record<string, string> = {
  youtube: "YouTube",
  soundcloud: "SoundCloud",
  spotify: "Spotify",
  unknown: "Müzik",
};

// EQ bar heights (snapshot for "playing" look)
const EQ_PRESETS = [
  [0.4, 0.7, 1.0, 0.6, 0.9, 0.5, 0.8, 0.3, 0.7, 0.95],
  [0.6, 0.3, 0.8, 1.0, 0.5, 0.9, 0.4, 0.7, 0.6, 0.8],
  [0.9, 0.5, 0.7, 0.4, 1.0, 0.6, 0.8, 0.3, 0.9, 0.5],
];

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "…";
}

function roundRect(
  ctx: SKRSContext2D,
  x: number, y: number, w: number, h: number, r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export async function generateMusicCard(
  track: Track,
  mode: "playing" | "queued" = "playing",
  queuePos?: number
): Promise<Buffer> {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // ── Background ────────────────────────────────────────────────────────────
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, "#0a0e1a");
  bgGrad.addColorStop(0.5, "#0d1424");
  bgGrad.addColorStop(1, "#060a12");
  ctx.fillStyle = bgGrad;
  roundRect(ctx, 0, 0, W, H, 18);
  ctx.fill();

  // Subtle top stripe
  const stripeGrad = ctx.createLinearGradient(0, 0, W, 0);
  const accent = SRC_COLORS[track.source ?? "unknown"] ?? "#5865F2";
  stripeGrad.addColorStop(0, accent + "44");
  stripeGrad.addColorStop(0.5, accent + "22");
  stripeGrad.addColorStop(1, accent + "00");
  ctx.fillStyle = stripeGrad;
  roundRect(ctx, 0, 0, W, 4, 2);
  ctx.fill();

  // ── Thumbnail ────────────────────────────────────────────────────────────
  const THUMB_SIZE = 240;
  const THUMB_X = 20;
  const THUMB_Y = 20;
  const THUMB_R = 14;

  // Glow behind thumbnail
  ctx.save();
  ctx.shadowColor = accent + "88";
  ctx.shadowBlur = 28;
  ctx.fillStyle = accent + "33";
  roundRect(ctx, THUMB_X - 4, THUMB_Y - 4, THUMB_SIZE + 8, THUMB_SIZE + 8, THUMB_R + 4);
  ctx.fill();
  ctx.restore();

  // Thumbnail image or colored placeholder
  let thumbLoaded = false;
  if (track.thumbnail) {
    try {
      const img = await loadImage(track.thumbnail);
      ctx.save();
      roundRect(ctx, THUMB_X, THUMB_Y, THUMB_SIZE, THUMB_SIZE, THUMB_R);
      ctx.clip();
      ctx.drawImage(img, THUMB_X, THUMB_Y, THUMB_SIZE, THUMB_SIZE);
      ctx.restore();
      thumbLoaded = true;
    } catch { /* fallback */ }
  }

  if (!thumbLoaded) {
    // Colored placeholder with music note
    const placeholderGrad = ctx.createLinearGradient(THUMB_X, THUMB_Y, THUMB_X + THUMB_SIZE, THUMB_Y + THUMB_SIZE);
    placeholderGrad.addColorStop(0, accent + "55");
    placeholderGrad.addColorStop(1, "#1e2a3a");
    ctx.save();
    roundRect(ctx, THUMB_X, THUMB_Y, THUMB_SIZE, THUMB_SIZE, THUMB_R);
    ctx.clip();
    ctx.fillStyle = placeholderGrad;
    ctx.fillRect(THUMB_X, THUMB_Y, THUMB_SIZE, THUMB_SIZE);
    ctx.restore();
    ctx.fillStyle = "#ffffff33";
    ctx.font = "bold 80px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🎵", THUMB_X + THUMB_SIZE / 2, THUMB_Y + THUMB_SIZE / 2);
  }

  // Thumbnail border
  ctx.save();
  ctx.strokeStyle = accent + "88";
  ctx.lineWidth = 2;
  roundRect(ctx, THUMB_X, THUMB_Y, THUMB_SIZE, THUMB_SIZE, THUMB_R);
  ctx.stroke();
  ctx.restore();

  // ── Content Area ─────────────────────────────────────────────────────────
  const CX = THUMB_X + THUMB_SIZE + 24; // content start X
  const CW = W - CX - 20;              // content width

  // Mode badge (▶ Çalınıyor / ➕ Kuyruğa Eklendi)
  const badgeText = mode === "playing"
    ? "▶  ÇALINIYOR"
    : queuePos ? `➕  KUYRUK #${queuePos}` : "➕  KUYRUĞA EKLENDİ";
  const badgeBg = mode === "playing" ? accent : "#374151";

  ctx.save();
  const badgeW = 180;
  const badgeH = 26;
  const badgeX = CX;
  const badgeY = 22;
  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 6);
  ctx.fillStyle = badgeBg;
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 12px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(badgeText, badgeX + 10, badgeY + badgeH / 2);
  ctx.restore();

  // Source badge (right side)
  const srcLabel = SRC_LABELS[track.source ?? "unknown"] ?? "Müzik";
  ctx.save();
  const srcW = 110;
  const srcH = 26;
  const srcX = W - srcW - 20;
  const srcY = 22;
  roundRect(ctx, srcX, srcY, srcW, srcH, 6);
  ctx.fillStyle = accent + "33";
  ctx.fill();
  ctx.strokeStyle = accent + "88";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.font = "bold 12px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(srcLabel, srcX + srcW / 2, srcY + srcH / 2);
  ctx.restore();

  // Title
  ctx.fillStyle = "#f1f5f9";
  ctx.font = "bold 26px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const titleMaxChars = Math.floor(CW / 14);
  ctx.fillText(truncate(track.title, titleMaxChars), CX, 82);

  // Artist / uploader
  if (track.artist) {
    ctx.fillStyle = "#94a3b8";
    ctx.font = "15px sans-serif";
    ctx.fillText(truncate(track.artist, Math.floor(CW / 9)), CX, 106);
  }

  // Separator line
  ctx.strokeStyle = "#1e2d3d";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(CX, 120);
  ctx.lineTo(W - 20, 120);
  ctx.stroke();

  // Duration
  ctx.fillStyle = "#64748b";
  ctx.font = "14px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(`⏱  ${track.duration}`, CX, 142);

  // Requester
  ctx.fillStyle = "#64748b";
  ctx.font = "14px sans-serif";
  ctx.fillText(`👤  ${truncate(track.requestedBy, 32)}`, CX, 165);

  // ── Progress bar ─────────────────────────────────────────────────────────
  const BAR_X = CX;
  const BAR_Y = 185;
  const BAR_W = CW;
  const BAR_H = 8;
  const fillRatio = mode === "playing" ? 0.0 : 0; // fresh start

  // Track background
  ctx.fillStyle = "#1e2a3a";
  roundRect(ctx, BAR_X, BAR_Y, BAR_W, BAR_H, 4);
  ctx.fill();

  // Filled portion (for queued items: show 0%)
  if (fillRatio > 0) {
    const fillGrad = ctx.createLinearGradient(BAR_X, 0, BAR_X + BAR_W * fillRatio, 0);
    fillGrad.addColorStop(0, accent);
    fillGrad.addColorStop(1, accent + "bb");
    ctx.fillStyle = fillGrad;
    roundRect(ctx, BAR_X, BAR_Y, BAR_W * fillRatio, BAR_H, 4);
    ctx.fill();
  }

  // ── EQ Visualizer bars (bottom) ────────────────────────────────────────
  const preset = EQ_PRESETS[Math.floor(Math.random() * EQ_PRESETS.length)]!;
  const BAR_COUNT = preset.length;
  const EQ_X = CX;
  const EQ_Y_BOTTOM = H - 18;
  const EQ_BAR_W = 12;
  const EQ_MAX_H = 36;
  const EQ_GAP = 6;

  for (let i = 0; i < BAR_COUNT; i++) {
    const h = preset[i]! * EQ_MAX_H;
    const bx = EQ_X + i * (EQ_BAR_W + EQ_GAP);
    const by = EQ_Y_BOTTOM - h;
    const eqGrad = ctx.createLinearGradient(bx, by, bx, EQ_Y_BOTTOM);
    eqGrad.addColorStop(0, accent);
    eqGrad.addColorStop(1, accent + "55");
    ctx.fillStyle = eqGrad;
    roundRect(ctx, bx, by, EQ_BAR_W, h, 3);
    ctx.fill();
  }

  // ── Outer border ─────────────────────────────────────────────────────────
  const outerGrad = ctx.createLinearGradient(0, 0, W, H);
  outerGrad.addColorStop(0, accent + "55");
  outerGrad.addColorStop(1, "#1e2a3a44");
  ctx.strokeStyle = outerGrad;
  ctx.lineWidth = 1.5;
  roundRect(ctx, 0, 0, W, H, 18);
  ctx.stroke();

  return canvas.toBuffer("image/png");
}
