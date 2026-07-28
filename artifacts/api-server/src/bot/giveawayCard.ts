import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { existsSync } from "node:fs";

// Font kayıt
const FONT_PATHS = [
  { path: "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", bold: "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" },
];
let FONT = "sans-serif";
for (const f of FONT_PATHS) {
  if (existsSync(f.path)) {
    GlobalFonts.registerFromPath(f.path);
    if (f.bold && existsSync(f.bold)) GlobalFonts.registerFromPath(f.bold);
    FONT = "DejaVu Sans";
    break;
  }
}

function roundRect(ctx: any, x: number, y: number, w: number, h: number, r: number) {
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

export interface GiveawayCardOptions {
  prize: string;
  hostName: string;
  participantCount: number;
  endsAt: Date;
  winnerId?: string;
  winnerName?: string;
  active: boolean;
}

export async function generateGiveawayCard(opts: GiveawayCardOptions): Promise<Buffer> {
  const W = 900;
  const H = 420;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d") as any;

  // ── Arka plan ─────────────────────────────────────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0a0a1a");
  bg.addColorStop(0.5, "#12102a");
  bg.addColorStop(1, "#0a0a1a");
  roundRect(ctx, 0, 0, W, H, 22);
  ctx.fillStyle = bg;
  ctx.fill();

  // Glow efektleri
  const glow1 = ctx.createRadialGradient(W / 2, H / 4, 0, W / 2, H / 4, 350);
  glow1.addColorStop(0, "rgba(255, 200, 50, 0.12)");
  glow1.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow1;
  ctx.fillRect(0, 0, W, H);

  // Bordür
  const bord = ctx.createLinearGradient(0, 0, W, H);
  bord.addColorStop(0, "#ffd700");
  bord.addColorStop(0.5, "#ff8c00");
  bord.addColorStop(1, "#ffd700");
  roundRect(ctx, 0, 0, W, H, 22);
  ctx.strokeStyle = bord;
  ctx.lineWidth = 3;
  ctx.stroke();

  // ── Başlık ────────────────────────────────────────────────────────────────
  ctx.textAlign = "center";
  const titleGrad = ctx.createLinearGradient(0, 0, W, 0);
  titleGrad.addColorStop(0, "#ffd700");
  titleGrad.addColorStop(0.5, "#ffffff");
  titleGrad.addColorStop(1, "#ffd700");

  // Büyük hediye emojisi
  ctx.font = `bold 56px '${FONT}'`;
  ctx.fillStyle = opts.active ? "#ffd700" : "#888";
  ctx.fillText("🎁", W / 2, 68);

  // Başlık
  ctx.font = `bold 28px '${FONT}'`;
  ctx.fillStyle = titleGrad;
  ctx.fillText(opts.active ? "ÇEKİLİŞ BAŞLADI!" : (opts.winnerName ? "ÇEKİLİŞ SONA ERDİ!" : "ÇEKİLİŞ İPTAL EDİLDİ!"), W / 2, 112);

  // Ayırıcı çizgi
  const lineGrad = ctx.createLinearGradient(60, 0, W - 60, 0);
  lineGrad.addColorStop(0, "rgba(255,215,0,0)");
  lineGrad.addColorStop(0.3, "#ffd700");
  lineGrad.addColorStop(0.7, "#ff8c00");
  lineGrad.addColorStop(1, "rgba(255,140,0,0)");
  ctx.strokeStyle = lineGrad;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(60, 130);
  ctx.lineTo(W - 60, 130);
  ctx.stroke();

  // ── Ödül ──────────────────────────────────────────────────────────────────
  ctx.font = `13px '${FONT}'`;
  ctx.fillStyle = "#aaaaaa";
  ctx.fillText("ÖDÜL", W / 2, 158);

  ctx.font = `bold 30px '${FONT}'`;
  ctx.fillStyle = "#ffffff";
  const prizeText = opts.prize.length > 40 ? opts.prize.slice(0, 39) + "…" : opts.prize;
  ctx.fillText(prizeText, W / 2, 196);

  // ── İstatistik kutuları ───────────────────────────────────────────────────
  const now = Date.now();
  const remaining = opts.endsAt.getTime() - now;

  let timeStr: string;
  if (!opts.active) {
    timeStr = "Sona Erdi";
  } else if (remaining <= 0) {
    timeStr = "Bitiyor...";
  } else {
    const totalSeconds = Math.ceil(remaining / 1000);
    const days    = Math.floor(totalSeconds / 86400);
    const hours   = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (days > 0)       timeStr = `${days}g ${hours}sa ${minutes}dk`;
    else if (hours > 0) timeStr = `${hours}sa ${minutes}dk ${seconds}sn`;
    else                timeStr = `${minutes}dk ${seconds}sn`;
  }

  const boxes = [
    { label: "KATILIMCI", value: opts.participantCount.toString(), color: "#5865f2" },
    { label: "KALAN SÜRE", value: timeStr, color: opts.active ? "#57f287" : "#ed4245" },
    { label: "DÜZENLEYEN", value: opts.hostName.length > 14 ? opts.hostName.slice(0, 13) + "…" : opts.hostName, color: "#ffd700" },
  ];

  const boxW = 240;
  const boxH = 90;
  const boxY = 228;
  const startX = (W - boxes.length * boxW - (boxes.length - 1) * 20) / 2;

  boxes.forEach((box, i) => {
    const bx = startX + i * (boxW + 20);
    roundRect(ctx, bx, boxY, boxW, boxH, 12);
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fill();
    roundRect(ctx, bx, boxY, boxW, 4, 2);
    ctx.fillStyle = box.color;
    ctx.fill();

    ctx.font = `11px '${FONT}'`;
    ctx.fillStyle = "#888888";
    ctx.textAlign = "center";
    ctx.fillText(box.label, bx + boxW / 2, boxY + 28);

    ctx.font = `bold 22px '${FONT}'`;
    ctx.fillStyle = box.color;
    ctx.fillText(box.value, bx + boxW / 2, boxY + 62);
  });

  // ── Kazanan (bitti ise) ───────────────────────────────────────────────────
  if (!opts.active && opts.winnerName) {
    roundRect(ctx, 60, 336, W - 120, 52, 12);
    ctx.fillStyle = "rgba(87, 242, 135, 0.12)";
    ctx.fill();
    ctx.font = `bold 18px '${FONT}'`;
    ctx.fillStyle = "#57f287";
    ctx.textAlign = "center";
    ctx.fillText(`🏆 Kazanan: ${opts.winnerName}`, W / 2, 368);
  } else if (opts.active) {
    // Footer ipucu
    ctx.font = `12px '${FONT}'`;
    ctx.fillStyle = "#666677";
    ctx.textAlign = "center";
    ctx.fillText("Katılmak için: v!çekiliş katıl  •  Görsel her 30 saniyede güncellenir", W / 2, 396);
  }

  return canvas.toBuffer("image/png");
}
