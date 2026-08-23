import { createCanvas, loadImage } from "@napi-rs/canvas";
import { econRankTitle } from "./economy";

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
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export interface EconProfileCardOptions {
  username: string;
  avatarUrl: string;
  level: number;
  xpProgress: number;
  xpNeeded: number;
  coins: number;
  streak: number;
  rank: number;
  luckActive: boolean;
  nextReward: number;
  coinSymbol?: string;
}

export async function generateEconProfileCard(opts: EconProfileCardOptions): Promise<Buffer> {
  const W = 820;
  const H = 290;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d") as any;

  // ── Arka plan (koyu fintech teması) ─────────────────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#060f0a");
  bg.addColorStop(0.5, "#0b1c10");
  bg.addColorStop(1, "#050d08");
  roundRect(ctx, 0, 0, W, H, 20);
  ctx.fillStyle = bg;
  ctx.fill();

  // Sol yeşil glow
  const glowL = ctx.createRadialGradient(180, H / 2, 0, 180, H / 2, 210);
  glowL.addColorStop(0, "rgba(0,230,118,0.16)");
  glowL.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glowL; ctx.fillRect(0, 0, W, H);

  // Sağ altın glow
  const glowR = ctx.createRadialGradient(W - 80, 50, 0, W - 80, 50, 180);
  glowR.addColorStop(0, "rgba(255,215,0,0.12)");
  glowR.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glowR; ctx.fillRect(0, 0, W, H);

  // Izgara deseni
  ctx.save();
  ctx.globalAlpha = 0.03;
  ctx.strokeStyle = "#00e676"; ctx.lineWidth = 0.5;
  for (let x = 0; x < W; x += 35) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 35) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  ctx.restore();

  // Kenarlık
  const bord = ctx.createLinearGradient(0, 0, W, H);
  bord.addColorStop(0, "#00e676"); bord.addColorStop(0.5, "#ffd700"); bord.addColorStop(1, "#00e676");
  roundRect(ctx, 0, 0, W, H, 20);
  ctx.strokeStyle = bord; ctx.lineWidth = 2.5; ctx.stroke();

  // Sol aksan çizgisi
  roundRect(ctx, 0, 0, 6, H, 3);
  const accentBar = ctx.createLinearGradient(0, 0, 0, H);
  accentBar.addColorStop(0, "#00e676"); accentBar.addColorStop(0.5, "#ffd700"); accentBar.addColorStop(1, "#00e676");
  ctx.fillStyle = accentBar; ctx.fill();

  // ── Avatar ──────────────────────────────────────────────────────────────────
  const avSize = 145;
  const avX = 28;
  const avY = (H - avSize) / 2;
  const cx = avX + avSize / 2;
  const cy = avY + avSize / 2;

  const ring = ctx.createLinearGradient(avX, avY, avX + avSize, avY + avSize);
  ring.addColorStop(0, "#00e676"); ring.addColorStop(1, "#ffd700");
  ctx.beginPath(); ctx.arc(cx, cy, avSize / 2 + 7, 0, Math.PI * 2);
  ctx.strokeStyle = ring; ctx.lineWidth = 3.5; ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, avSize / 2 + 11, 0, Math.PI * 2);
  ctx.strokeStyle = hexToRgba("#00e676", 0.25); ctx.lineWidth = 2; ctx.stroke();

  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, avSize / 2, 0, Math.PI * 2); ctx.clip();
  try {
    const img = await loadImage(opts.avatarUrl + "?size=256");
    ctx.drawImage(img, avX, avY, avSize, avSize);
  } catch {
    ctx.fillStyle = "#1a3a1f"; ctx.fillRect(avX, avY, avSize, avSize);
    ctx.fillStyle = "#00e676"; ctx.font = "bold 50px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(opts.username.charAt(0).toUpperCase(), cx, cy + 18);
  }
  ctx.restore();

  // Seviye rozeti
  const badgeR = 24;
  const bx = avX + avSize - 2;
  const by = avY + avSize - 2;
  const badgeBg = ctx.createLinearGradient(bx - badgeR, by - badgeR, bx + badgeR, by + badgeR);
  badgeBg.addColorStop(0, "#00e676"); badgeBg.addColorStop(1, "#ffd700");
  ctx.beginPath(); ctx.arc(bx, by, badgeR, 0, Math.PI * 2);
  ctx.fillStyle = badgeBg; ctx.fill();
  ctx.strokeStyle = "#060f0a"; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = "#000";
  ctx.font = `bold ${opts.level >= 100 ? 10 : opts.level >= 10 ? 13 : 15}px sans-serif`;
  ctx.textAlign = "center"; ctx.fillText(String(opts.level), bx, by + 5); ctx.textAlign = "left";

  // ── Sağ içerik alanı ────────────────────────────────────────────────────────
  const tx = avX + avSize + 30;
  const rightW = W - tx - 24;

  // Unvan badge
  const title = econRankTitle(opts.level);
  ctx.font = "bold 12px sans-serif";
  const titleW = ctx.measureText(title).width + 24;
  roundRect(ctx, tx, 18, titleW, 26, 13);
  ctx.fillStyle = "rgba(0,230,118,0.18)"; ctx.fill();
  ctx.strokeStyle = "rgba(0,230,118,0.5)"; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = "#00e676"; ctx.fillText(title, tx + 12, 35);

  // Kullanıcı adı
  const uname = opts.username.length > 22 ? opts.username.slice(0, 21) + "…" : opts.username;
  ctx.fillStyle = "#ffffff"; ctx.font = "bold 30px sans-serif";
  ctx.fillText(uname, tx, 80);

  // İstatistikler (2 kolon)
  const statY = 98;
  const statGap = 23;
  const stats: Array<{ label: string; value: string; color: string }> = [
    { label: "🏅 Sıra", value: `#${opts.rank}`, color: "#faa61a" },
    { label: "💰 Bakiye", value: `${opts.coins.toLocaleString("tr-TR")} vivincy`, color: "#ffd700" },
    { label: "🔥 Streak", value: `${opts.streak} gün`, color: "#ff7043" },
    { label: opts.luckActive ? "🍀 Şans" : "🍀 Şans", value: opts.luckActive ? "AKTİF ✨" : "Pasif", color: opts.luckActive ? "#00e676" : "#72767d" },
  ];

  const colW = Math.floor(rightW / 2);
  stats.forEach((s, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const sx = tx + col * colW;
    const sy = statY + row * statGap;
    ctx.fillStyle = "rgba(255,255,255,0.4)"; ctx.font = "12px sans-serif";
    ctx.fillText(s.label + ": ", sx, sy);
    const lw = ctx.measureText(s.label + ": ").width;
    ctx.fillStyle = s.color; ctx.font = "bold 12px sans-serif";
    ctx.fillText(s.value, sx + lw, sy);
  });

  // XP Bar
  const barY = 150;
  const barH = 22;
  const barX = tx;
  const barW = rightW;
  const progress = Math.min(opts.xpProgress / Math.max(opts.xpNeeded, 1), 1);

  roundRect(ctx, barX, barY, barW, barH, barH / 2);
  ctx.fillStyle = "rgba(255,255,255,0.07)"; ctx.fill();

  if (progress > 0) {
    const filled = Math.max(progress * barW, barH);
    const grad = ctx.createLinearGradient(barX, 0, barX + filled, 0);
    grad.addColorStop(0, "#00e676"); grad.addColorStop(1, "#ffd700");
    roundRect(ctx, barX, barY, filled, barH, barH / 2);
    ctx.fillStyle = grad; ctx.fill();
    const shine = ctx.createLinearGradient(barX, barY, barX, barY + barH);
    shine.addColorStop(0, "rgba(255,255,255,0.25)"); shine.addColorStop(0.6, "rgba(255,255,255,0)");
    roundRect(ctx, barX, barY, filled, barH / 2, barH / 2);
    ctx.fillStyle = shine; ctx.fill();
  }

  const pct = Math.round(progress * 100);
  ctx.fillStyle = "#dcddde"; ctx.font = "bold 12px sans-serif"; ctx.textAlign = "left";
  ctx.fillText(`${opts.xpProgress.toLocaleString("tr-TR")} / ${opts.xpNeeded.toLocaleString("tr-TR")} XP`, barX, barY + barH + 17);
  ctx.fillStyle = "#00e676"; ctx.textAlign = "right";
  ctx.fillText(`%${pct}`, barX + barW, barY + barH + 17);
  ctx.textAlign = "left";

  // Ayırıcı
  ctx.strokeStyle = "rgba(0,230,118,0.10)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(tx, 208); ctx.lineTo(W - 24, 208); ctx.stroke();

  // Alt bilgiler
  ctx.fillStyle = "#72767d"; ctx.font = "12px sans-serif";
  ctx.fillText(`Sonraki seviyeye ${(opts.xpNeeded - opts.xpProgress).toLocaleString("tr-TR")} XP gerekiyor`, tx, 228);
  ctx.fillStyle = "rgba(255,215,0,0.65)"; ctx.font = "bold 12px sans-serif"; ctx.textAlign = "right";
  ctx.fillText(`🎁 +${opts.nextReward.toLocaleString("tr-TR")} vivincy ödül`, W - 24, 228);
  ctx.textAlign = "left";

  ctx.fillStyle = "rgba(0,230,118,0.35)"; ctx.font = "11px sans-serif";
  ctx.fillText(`${opts.coinSymbol ?? "🪙"} Vivincy Ekonomi Sistemi  •  Tüm sunucularda ortak  •  pray ile şansını artır!`, tx, 260);

  return canvas.toBuffer("image/png");
}
