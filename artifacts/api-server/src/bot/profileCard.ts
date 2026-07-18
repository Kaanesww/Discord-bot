import { createCanvas, loadImage } from "@napi-rs/canvas";

export interface ProfileCardOptions {
  username: string;
  avatarUrl: string;
  level: number;
  xp: number;
  xpNeeded: number;
  rank: number;
  messageCount: number;
  accentColor?: string;
}

export async function generateProfileCard(opts: ProfileCardOptions): Promise<Buffer> {
  const W = 760;
  const H = 240;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // --- Arka plan ---
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0f0c29");
  bg.addColorStop(0.5, "#1a1a3e");
  bg.addColorStop(1, "#24243e");
  roundRect(ctx, 0, 0, W, H, 20);
  ctx.fillStyle = bg;
  ctx.fill();

  // Dekoratif ışık efekti
  const glow = ctx.createRadialGradient(200, 120, 0, 200, 120, 200);
  glow.addColorStop(0, "rgba(88,101,242,0.15)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const accent = opts.accentColor ?? "#5865f2";

  // --- Avatar ---
  const avSize = 150;
  const avX = 45;
  const avY = (H - avSize) / 2;
  const cx = avX + avSize / 2;
  const cy = avY + avSize / 2;
  const r = avSize / 2;

  // Renkli halka
  ctx.beginPath();
  ctx.arc(cx, cy, r + 5, 0, Math.PI * 2);
  const ring = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  ring.addColorStop(0, accent);
  ring.addColorStop(1, "#eb459e");
  ctx.strokeStyle = ring;
  ctx.lineWidth = 5;
  ctx.stroke();

  // Avatar görseli
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  try {
    const img = await loadImage(opts.avatarUrl + "?size=256");
    ctx.drawImage(img, avX, avY, avSize, avSize);
  } catch {
    ctx.fillStyle = accent;
    ctx.fillRect(avX, avY, avSize, avSize);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 48px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(opts.username.charAt(0).toUpperCase(), cx, cy + 17);
    ctx.textAlign = "left";
  }
  ctx.restore();

  // Seviye rozeti (avatar üstünde)
  const badgeR = 22;
  const bx = avX + avSize - 2;
  const by = avY + avSize - 2;
  ctx.beginPath();
  ctx.arc(bx, by, badgeR, 0, Math.PI * 2);
  ctx.fillStyle = accent;
  ctx.fill();
  ctx.strokeStyle = "#1a1a3e";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.font = `bold ${opts.level >= 100 ? 11 : 13}px sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(String(opts.level), bx, by + 5);
  ctx.textAlign = "left";

  // --- Sağ bölüm ---
  const tx = avX + avSize + 30;

  // Kullanıcı adı
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 30px sans-serif";
  ctx.fillText(clip(opts.username, 22), tx, 70);

  // Rozet satırı: Sıra + Seviye + Mesaj
  const tagY = 100;
  const tags = [
    { text: `🏅 Sıra #${opts.rank}`, color: "#faa61a" },
    { text: `⭐ Seviye ${opts.level}`, color: accent },
    { text: `💬 ${opts.messageCount} mesaj`, color: "#57f287" },
  ];
  let tagX = tx;
  for (const tag of tags) {
    const tw = ctx.measureText(tag.text).width + 20;
    roundRect(ctx, tagX, tagY - 18, tw, 26, 13);
    ctx.fillStyle = hexToRgba(tag.color, 0.18);
    ctx.fill();
    ctx.fillStyle = tag.color;
    ctx.font = "bold 13px sans-serif";
    ctx.fillText(tag.text, tagX + 10, tagY + 2);
    tagX += tw + 10;
  }

  // XP bar
  const barX = tx;
  const barY = 145;
  const barW = W - tx - 40;
  const barH = 22;
  const progress = Math.min(opts.xp / Math.max(opts.xpNeeded, 1), 1);

  // Arka plan
  roundRect(ctx, barX, barY, barW, barH, barH / 2);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fill();

  // Dolgu
  if (progress > 0) {
    const filled = Math.max(progress * barW, barH);
    const grad = ctx.createLinearGradient(barX, 0, barX + filled, 0);
    grad.addColorStop(0, accent);
    grad.addColorStop(1, "#eb459e");
    roundRect(ctx, barX, barY, filled, barH, barH / 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Parlak kenar
    const shine = ctx.createLinearGradient(barX, barY, barX, barY + barH);
    shine.addColorStop(0, "rgba(255,255,255,0.25)");
    shine.addColorStop(0.5, "rgba(255,255,255,0)");
    roundRect(ctx, barX, barY, filled, barH / 2, barH / 2);
    ctx.fillStyle = shine;
    ctx.fill();
  }

  // XP yazısı
  ctx.fillStyle = "#dcddde";
  ctx.font = "13px sans-serif";
  ctx.fillText(`${opts.xp.toLocaleString()} / ${opts.xpNeeded.toLocaleString()} XP`, barX, barY + barH + 20);

  const pct = Math.round(progress * 100);
  ctx.fillStyle = "#b9bbbe";
  ctx.font = "bold 13px sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(`%${pct}`, barX + barW, barY + barH + 20);
  ctx.textAlign = "left";

  return canvas.toBuffer("image/png");
}

function roundRect(
  ctx: ReturnType<ReturnType<typeof createCanvas>["getContext"]>,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
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

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function clip(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}
