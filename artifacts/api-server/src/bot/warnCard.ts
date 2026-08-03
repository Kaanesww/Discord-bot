import { createCanvas, loadImage } from "@napi-rs/canvas";

export interface WarnCardOptions {
  username: string;
  avatarUrl: string;
  moderatorName: string;
  reason: string;
  warnId: number;
  totalWarns: number;
  guildName: string;
}

function roundRect(ctx: any, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function clip(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export async function generateWarnCard(opts: WarnCardOptions): Promise<Buffer> {
  const W = 760;
  const H = 270;
  const ACCENT = "#faa61a";
  const ACCENT2 = "#e67e00";

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d") as any;

  // ── Arka plan ──────────────────────────────────────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#120a00");
  bg.addColorStop(0.45, "#1e1000");
  bg.addColorStop(1, "#120a00");
  roundRect(ctx, 0, 0, W, H, 22);
  ctx.fillStyle = bg;
  ctx.fill();

  // Sol turuncu glow
  const glow = ctx.createRadialGradient(180, H / 2, 0, 180, H / 2, 220);
  glow.addColorStop(0, "rgba(250,166,26,0.15)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Sağ üst subtle glow
  const glow2 = ctx.createRadialGradient(W - 80, 50, 0, W - 80, 50, 160);
  glow2.addColorStop(0, "rgba(230,126,0,0.10)");
  glow2.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, W, H);

  // Kenarlık
  roundRect(ctx, 0, 0, W, H, 22);
  const border = ctx.createLinearGradient(0, 0, W, H);
  border.addColorStop(0, ACCENT);
  border.addColorStop(0.6, ACCENT2);
  border.addColorStop(1, "#c0540a");
  ctx.strokeStyle = border;
  ctx.lineWidth = 3;
  ctx.stroke();

  // Sol turuncu şerit
  const stripe = ctx.createLinearGradient(0, 0, 0, H);
  stripe.addColorStop(0, ACCENT);
  stripe.addColorStop(1, ACCENT2);
  roundRect(ctx, 0, 0, 7, H, 22);
  ctx.fillStyle = stripe;
  ctx.fill();

  // ── Avatar ─────────────────────────────────────────────────────────────────
  const avSize = 130;
  const avX = 36;
  const avY = (H - avSize) / 2;
  const cx = avX + avSize / 2;
  const cy = avY + avSize / 2;

  // Avatar dış halka
  ctx.beginPath();
  ctx.arc(cx, cy, avSize / 2 + 8, 0, Math.PI * 2);
  const ring = ctx.createLinearGradient(avX, avY, avX + avSize, avY + avSize);
  ring.addColorStop(0, ACCENT); ring.addColorStop(1, ACCENT2);
  ctx.strokeStyle = ring;
  ctx.lineWidth = 3.5;
  ctx.stroke();

  // Avatar dış ışıma
  ctx.beginPath();
  ctx.arc(cx, cy, avSize / 2 + 14, 0, Math.PI * 2);
  ctx.strokeStyle = hexToRgba(ACCENT, 0.25);
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, avSize / 2, 0, Math.PI * 2);
  ctx.clip();
  try {
    const img = await loadImage(opts.avatarUrl + "?size=256");
    ctx.drawImage(img, avX, avY, avSize, avSize);
  } catch {
    ctx.fillStyle = ACCENT;
    ctx.fillRect(avX, avY, avSize, avSize);
    ctx.fillStyle = "#fff";
    ctx.font = `bold 44px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(opts.username.charAt(0).toUpperCase(), cx, cy);
    ctx.textBaseline = "alphabetic";
  }
  ctx.restore();

  // Uyarı ID rozeti (avatar sağ alt)
  const badgeR = 24;
  const bx = avX + avSize + 2;
  const by = avY + avSize + 2;
  const badgeBg = ctx.createLinearGradient(bx - badgeR, by - badgeR, bx + badgeR, by + badgeR);
  badgeBg.addColorStop(0, ACCENT); badgeBg.addColorStop(1, ACCENT2);
  ctx.beginPath();
  ctx.arc(bx, by, badgeR, 0, Math.PI * 2);
  ctx.fillStyle = badgeBg;
  ctx.fill();
  ctx.strokeStyle = "#120a00";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = "#1a0900";
  ctx.font = "bold 20px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("!", bx, by + 1);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  // ── Sağ bölüm ─────────────────────────────────────────────────────────────
  const tx = avX + avSize + 36;
  const rightW = W - tx - 28;

  // Üst etiket
  ctx.fillStyle = ACCENT;
  ctx.font = "bold 11px sans-serif";
  ctx.letterSpacing = "2px";
  ctx.fillText("⚠  UYARI VERİLDİ", tx, 35);
  ctx.letterSpacing = "0px";

  // Kullanıcı adı
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 30px sans-serif";
  ctx.fillText(clip(opts.username, 24), tx, 72);

  // Uyarı ID badge
  const warnIdText = `Uyarı #${opts.warnId}`;
  ctx.font = "bold 11px sans-serif";
  const bw = ctx.measureText(warnIdText).width + 20;
  roundRect(ctx, tx, 82, bw, 22, 11);
  ctx.fillStyle = hexToRgba(ACCENT, 0.18);
  ctx.fill();
  ctx.strokeStyle = hexToRgba(ACCENT, 0.55);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = ACCENT;
  ctx.fillText(warnIdText, tx + 10, 97);

  // Ayırıcı
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(tx, 116);
  ctx.lineTo(W - 28, 116);
  ctx.stroke();

  // Sebep
  ctx.fillStyle = "rgba(255,255,255,0.40)";
  ctx.font = "10px sans-serif";
  ctx.letterSpacing = "1.5px";
  ctx.fillText("SEBEP", tx, 136);
  ctx.letterSpacing = "0px";
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 15px sans-serif";
  ctx.fillText(clip(opts.reason, 52), tx, 158);

  // Moderatör (sol) + Toplam uyarı (sağ)
  const midX = tx + Math.floor(rightW * 0.55);

  ctx.fillStyle = "rgba(255,255,255,0.40)";
  ctx.font = "10px sans-serif";
  ctx.letterSpacing = "1.5px";
  ctx.fillText("MODERATÖR", tx, 184);
  ctx.fillText("TOPLAM UYARI", midX, 184);
  ctx.letterSpacing = "0px";

  ctx.fillStyle = "#dcddde";
  ctx.font = "bold 14px sans-serif";
  ctx.fillText(clip(opts.moderatorName, 22), tx, 204);

  // Toplam uyarı sayısı — renk duruma göre
  const warnColor = opts.totalWarns >= 5 ? "#ed4245" : opts.totalWarns >= 3 ? "#faa61a" : "#57f287";
  ctx.fillStyle = warnColor;
  ctx.font = `bold 26px sans-serif`;
  ctx.fillText(String(opts.totalWarns), midX, 207);

  // Alt ayırıcı
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(tx, 222);
  ctx.lineTo(W - 28, 222);
  ctx.stroke();

  // Footer — sunucu adı + tarih
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.font = "12px sans-serif";
  ctx.fillText(clip(opts.guildName, 36), tx, 244);

  ctx.textAlign = "right";
  ctx.fillStyle = hexToRgba(ACCENT, 0.55);
  ctx.font = "bold 12px sans-serif";
  ctx.fillText(new Date().toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" }), W - 28, 244);
  ctx.textAlign = "left";

  return canvas.toBuffer("image/png");
}
