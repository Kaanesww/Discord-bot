import { createCanvas, loadImage } from "@napi-rs/canvas";

export interface ProfileCardOptions {
  username: string;
  avatarUrl: string;
  level: number;
  xp: number;
  xpNeeded: number;
  rank: number;
  messageCount: number;
  coins?: number;
  voiceMinutes?: number;
  accentColor?: string;
}

interface LevelTheme {
  bg1: string; bg2: string; bg3: string;
  accent: string; accent2: string;
  title: string; titleEmoji: string;
  glowColor: string;
}

function getTheme(level: number): LevelTheme {
  if (level >= 100) return { bg1: "#1a0005", bg2: "#350010", bg3: "#1a0010", accent: "#ff4466", accent2: "#ff0044", title: "TANRI", titleEmoji: "👑", glowColor: "rgba(255,50,80,0.25)" };
  if (level >= 50)  return { bg1: "#1a1200", bg2: "#3d2a00", bg3: "#1a1000", accent: "#ffd700", accent2: "#ff8c00", title: "EFSANE", titleEmoji: "⭐", glowColor: "rgba(255,215,0,0.20)" };
  if (level >= 25)  return { bg1: "#0f0020", bg2: "#220040", bg3: "#0a0018", accent: "#9b59b6", accent2: "#8e44ad", title: "UZMAN", titleEmoji: "💜", glowColor: "rgba(155,89,182,0.20)" };
  if (level >= 10)  return { bg1: "#001a16", bg2: "#003d30", bg3: "#001210", accent: "#1abc9c", accent2: "#16a085", title: "GELİŞEN", titleEmoji: "💎", glowColor: "rgba(26,188,156,0.18)" };
  return { bg1: "#0a0a1a", bg2: "#1a1a3e", bg3: "#0a0a2a", accent: "#5865f2", accent2: "#4752c4", title: "ACEMİ", titleEmoji: "🔷", glowColor: "rgba(88,101,242,0.18)" };
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

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function clip(s: string, max: number) { return s.length > max ? s.slice(0, max-1)+"…" : s; }

/** Para simgesi: tamamen siyah daire, üstünde beyaz V */
function drawCoinIcon(ctx: any, cx: number, cy: number, radius: number, accentColor: string): void {
  // Siyah dolu daire
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = "#000000";
  ctx.fill();
  // İnce altın kenarlık
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Beyaz V harfi
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${Math.round(radius * 1.3)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("V", cx, cy + radius * 0.05);
  ctx.textBaseline = "alphabetic";
  ctx.restore();
}

export async function generateProfileCard(opts: ProfileCardOptions): Promise<Buffer> {
  const W = 920;
  const H = 320;
  const theme = getTheme(opts.level);
  const accent = opts.accentColor ?? theme.accent;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d") as any;

  // ── Arka plan ──────────────────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, theme.bg1);
  bg.addColorStop(0.5, theme.bg2);
  bg.addColorStop(1, theme.bg3);
  roundRect(ctx, 0, 0, W, H, 22);
  ctx.fillStyle = bg;
  ctx.fill();

  // Sol glow
  const glow = ctx.createRadialGradient(220, H/2, 0, 220, H/2, 240);
  glow.addColorStop(0, theme.glowColor);
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Sağ üst glow
  const glow2 = ctx.createRadialGradient(W-100, 40, 0, W-100, 40, 160);
  glow2.addColorStop(0, hexToRgba(theme.accent2, 0.15));
  glow2.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, W, H);

  // Kenarlık
  const border = ctx.createLinearGradient(0, 0, W, H);
  border.addColorStop(0, accent);
  border.addColorStop(0.5, theme.accent2);
  border.addColorStop(1, "#eb459e");
  roundRect(ctx, 0, 0, W, H, 22);
  ctx.strokeStyle = border;
  ctx.lineWidth = 3;
  ctx.stroke();

  // ── Avatar ─────────────────────────────────────────────
  const avSize = 170;
  const avX = 36;
  const avY = (H - avSize) / 2;
  const cx = avX + avSize/2, cy = avY + avSize/2;

  const ring = ctx.createLinearGradient(avX, avY, avX+avSize, avY+avSize);
  ring.addColorStop(0, accent);
  ring.addColorStop(1, theme.accent2);
  ctx.beginPath(); ctx.arc(cx, cy, avSize/2+8, 0, Math.PI*2);
  ctx.strokeStyle = ring; ctx.lineWidth = 4; ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, avSize/2+12, 0, Math.PI*2);
  ctx.strokeStyle = hexToRgba(accent, 0.3); ctx.lineWidth = 2; ctx.stroke();

  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, avSize/2, 0, Math.PI*2); ctx.clip();
  try {
    const img = await loadImage(opts.avatarUrl + "?size=256");
    ctx.drawImage(img, avX, avY, avSize, avSize);
  } catch {
    ctx.fillStyle = accent; ctx.fillRect(avX, avY, avSize, avSize);
    ctx.fillStyle = "#fff"; ctx.font = "bold 56px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(opts.username.charAt(0).toUpperCase(), cx, cy+20);
  }
  ctx.restore();

  // Seviye rozeti
  const badgeR = 28;
  const bx = avX + avSize - 4, by = avY + avSize - 4;
  const badgeBg = ctx.createLinearGradient(bx-badgeR, by-badgeR, bx+badgeR, by+badgeR);
  badgeBg.addColorStop(0, accent); badgeBg.addColorStop(1, theme.accent2);
  ctx.beginPath(); ctx.arc(bx, by, badgeR, 0, Math.PI*2);
  ctx.fillStyle = badgeBg; ctx.fill();
  ctx.strokeStyle = theme.bg1; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.font = `bold ${opts.level >= 100 ? 13 : opts.level >= 10 ? 15 : 17}px sans-serif`;
  ctx.textAlign = "center"; ctx.fillText(String(opts.level), bx, by+6); ctx.textAlign = "left";

  // ── Sağ bölüm ─────────────────────────────────────────
  const tx = avX + avSize + 36;
  const rightW = W - tx - 28;

  // Ünvan badge
  ctx.font = "bold 13px sans-serif";
  const titleText = `${theme.titleEmoji} ${theme.title}`;
  const titleW = ctx.measureText(titleText).width + 26;
  roundRect(ctx, tx, 24, titleW, 28, 14);
  ctx.fillStyle = hexToRgba(accent, 0.22); ctx.fill();
  ctx.strokeStyle = hexToRgba(accent, 0.6); ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = accent;
  ctx.fillText(titleText, tx+13, 43);

  // Kullanıcı adı
  ctx.fillStyle = "#ffffff"; ctx.font = "bold 34px sans-serif";
  ctx.fillText(clip(opts.username, 20), tx, 98);

  // ── İstatistikler — YAZI olarak ──────────────────────
  // Küçük renkli satırlar: Rank | Level | Mesaj | Ses | Bakiye
  ctx.font = "bold 13px sans-serif";
  const stats: Array<{ label: string; value: string; color: string; coin?: boolean }> = [
    { label: "🏅 Sıra", value: `#${opts.rank}`, color: "#faa61a" },
    { label: "⭐ Seviye", value: String(opts.level), color: accent },
    { label: "💬 Mesaj", value: opts.messageCount.toLocaleString("tr-TR") + " mesaj", color: "#57f287" },
    ...(opts.voiceMinutes !== undefined ? [{ label: "🎤 Ses", value: opts.voiceMinutes > 0 ? `${opts.voiceMinutes} dakika` : "0 dakika", color: "#5865f2" } as const] : []),
    ...(opts.coins !== undefined ? [{ label: "Bakiye", value: opts.coins.toLocaleString("tr-TR"), color: "#ffd700", coin: true } as const] : []),
  ];

  // İki kolon halinde yan yana
  const statStartY = 116;
  const colW = Math.floor(rightW / 2);
  stats.forEach((s, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const sx = tx + col * colW;
    const sy = statStartY + row * 22;

    // Label (soluk)
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.font = "12px sans-serif";
    ctx.fillText(s.label + ": ", sx, sy);
    const labelW = ctx.measureText(s.label + ": ").width;

    // Eğer coin ise, özel ikon çiz + değer yaz
    if (s.coin) {
      const iconR = 7;
      drawCoinIcon(ctx, sx + labelW + iconR + 1, sy - iconR + 2, iconR, "#ffd700");
      ctx.fillStyle = s.color;
      ctx.font = "bold 12px sans-serif";
      ctx.fillText(s.value, sx + labelW + iconR * 2 + 5, sy);
    } else {
      ctx.fillStyle = s.color;
      ctx.font = "bold 12px sans-serif";
      ctx.fillText(s.value, sx + labelW, sy);
    }
  });

  // XP bar
  const barY = 172;
  const barH = 26;
  const barX = tx;
  const barW = rightW;
  const progress = Math.min(opts.xp / Math.max(opts.xpNeeded, 1), 1);

  roundRect(ctx, barX, barY, barW, barH, barH/2);
  ctx.fillStyle = "rgba(255,255,255,0.08)"; ctx.fill();

  if (progress > 0) {
    const filled = Math.max(progress * barW, barH);
    const grad = ctx.createLinearGradient(barX, 0, barX+filled, 0);
    grad.addColorStop(0, accent); grad.addColorStop(1, "#eb459e");
    roundRect(ctx, barX, barY, filled, barH, barH/2);
    ctx.fillStyle = grad; ctx.fill();
    const shine = ctx.createLinearGradient(barX, barY, barX, barY+barH);
    shine.addColorStop(0, "rgba(255,255,255,0.28)"); shine.addColorStop(0.6, "rgba(255,255,255,0)");
    roundRect(ctx, barX, barY, filled, barH/2, barH/2);
    ctx.fillStyle = shine; ctx.fill();
  }

  ctx.fillStyle = "#dcddde"; ctx.font = "bold 14px sans-serif"; ctx.textAlign = "left";
  ctx.fillText(`${opts.xp.toLocaleString("tr-TR")} / ${opts.xpNeeded.toLocaleString("tr-TR")} XP`, barX, barY + barH + 22);
  const pct = Math.round(progress * 100);
  ctx.fillStyle = accent; ctx.font = "bold 14px sans-serif"; ctx.textAlign = "right";
  ctx.fillText(`%${pct}`, barX + barW, barY + barH + 22); ctx.textAlign = "left";

  // Ayırıcı çizgi
  ctx.strokeStyle = "rgba(255,255,255,0.07)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(tx, 240); ctx.lineTo(W-28, 240); ctx.stroke();

  ctx.fillStyle = "#72767d"; ctx.font = "13px sans-serif";
  ctx.fillText(`Sonraki seviye için ${(opts.xpNeeded - opts.xp).toLocaleString("tr-TR")} XP gerekiyor`, tx, 265);

  ctx.textAlign = "right";
  ctx.fillStyle = hexToRgba(accent, 0.7); ctx.font = "bold 13px sans-serif";
  ctx.fillText(`${theme.titleEmoji} ${theme.title} KART`, W-30, 265);
  ctx.textAlign = "left";

  return canvas.toBuffer("image/png");
}
