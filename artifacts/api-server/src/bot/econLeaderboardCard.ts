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

export interface EconLeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  avatarUrl: string;
  econLevel: number;
  econXp: number;
  coins: number;
}

const MEDAL_COLORS = ["#ffd700", "#c0c0c0", "#cd7f32"];
const MEDAL_BG = ["rgba(255,215,0,0.14)", "rgba(192,192,192,0.10)", "rgba(205,127,50,0.10)"];

export async function generateEconLeaderboardCard(entries: EconLeaderboardEntry[], coinSymbol = "🪙"): Promise<Buffer> {
  const W = 760;
  const ROW_H = 74;
  const HEADER_H = 96;
  const H = HEADER_H + entries.length * ROW_H + 24;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d") as any;

  // ── Arka plan (yeşil fintech) ─────────────────────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#060f0a");
  bg.addColorStop(0.5, "#0b1c10");
  bg.addColorStop(1, "#050d08");
  roundRect(ctx, 0, 0, W, H, 20);
  ctx.fillStyle = bg; ctx.fill();

  // Üst altın glow
  const topGlow = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, 220);
  topGlow.addColorStop(0, "rgba(255,215,0,0.18)");
  topGlow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = topGlow; ctx.fillRect(0, 0, W, H);

  // Izgara
  ctx.save();
  ctx.globalAlpha = 0.025;
  ctx.strokeStyle = "#00e676"; ctx.lineWidth = 0.5;
  for (let x = 0; x < W; x += 35) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 35) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  ctx.restore();

  // Kenarlık
  const bord = ctx.createLinearGradient(0, 0, W, H);
  bord.addColorStop(0, "#00e676"); bord.addColorStop(0.5, "#ffd700"); bord.addColorStop(1, "#00e676");
  roundRect(ctx, 0, 0, W, H, 20);
  ctx.strokeStyle = bord; ctx.lineWidth = 2.5; ctx.stroke();

  // ── Başlık ─────────────────────────────────────────────────────────────────
  roundRect(ctx, 16, 12, W - 32, HEADER_H - 16, 12);
  ctx.fillStyle = "rgba(0,230,118,0.04)"; ctx.fill();

  ctx.fillStyle = "#00e676"; ctx.font = "bold 16px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("🏦", W / 2, 40);
  const titleGrad = ctx.createLinearGradient(W / 2 - 200, 0, W / 2 + 200, 0);
  titleGrad.addColorStop(0, "#00e676"); titleGrad.addColorStop(0.5, "#ffd700"); titleGrad.addColorStop(1, "#00e676");
  ctx.fillStyle = titleGrad; ctx.font = "bold 28px sans-serif";
  ctx.fillText("EKONOMİ LİDERBOARD — TOP 10", W / 2, 62);
  ctx.fillStyle = "#72767d"; ctx.font = "13px sans-serif";
  ctx.fillText(`${entries.length} aktif kullanıcı  •  Global sıralama  •  ${coinSymbol} Vivincy`, W / 2, 82);
  ctx.textAlign = "left";

  // ── Satırlar ───────────────────────────────────────────────────────────────
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const rowY = HEADER_H + i * ROW_H;
    const isTop3 = i < 3;

    // Satır arka planı
    roundRect(ctx, 16, rowY + 4, W - 32, ROW_H - 8, 10);
    ctx.fillStyle = isTop3 ? MEDAL_BG[i]! : (i % 2 === 0 ? "rgba(0,230,118,0.03)" : "rgba(0,0,0,0.15)");
    ctx.fill();

    // Sol aksan çizgisi
    if (isTop3) {
      roundRect(ctx, 16, rowY + 4, 4, ROW_H - 8, 2);
      ctx.fillStyle = MEDAL_COLORS[i]!; ctx.fill();
    }

    // Rank
    const rankX = 36;
    const rankCY = rowY + ROW_H / 2;
    ctx.textAlign = "center";
    if (isTop3) {
      ctx.fillStyle = MEDAL_COLORS[i]!; ctx.font = "bold 22px sans-serif";
      ctx.fillText(["🥇", "🥈", "🥉"][i]!, rankX + 12, rankCY + 7);
    } else {
      ctx.fillStyle = "#72767d"; ctx.font = "bold 14px sans-serif";
      ctx.fillText(`#${entry.rank}`, rankX + 12, rankCY + 5);
    }
    ctx.textAlign = "left";

    // Avatar
    const avR = 23;
    const avX = 86;
    ctx.save();
    ctx.beginPath(); ctx.arc(avX, rankCY, avR, 0, Math.PI * 2); ctx.clip();
    try {
      const img = await loadImage(entry.avatarUrl + "?size=64");
      ctx.drawImage(img, avX - avR, rankCY - avR, avR * 2, avR * 2);
    } catch {
      ctx.fillStyle = "#1a3a1f";
      ctx.fillRect(avX - avR, rankCY - avR, avR * 2, avR * 2);
      ctx.fillStyle = "#00e676"; ctx.font = "bold 16px sans-serif"; ctx.textAlign = "center";
      ctx.fillText(entry.username.charAt(0).toUpperCase(), avX, rankCY + 6);
    }
    ctx.restore();

    // Avatar ring (top3)
    if (isTop3) {
      ctx.beginPath(); ctx.arc(avX, rankCY, avR + 2, 0, Math.PI * 2);
      ctx.strokeStyle = MEDAL_COLORS[i]!; ctx.lineWidth = 2; ctx.stroke();
    }

    // Kullanıcı adı
    const textX = avX + avR + 14;
    const username = entry.username.length > 18 ? entry.username.slice(0, 17) + "…" : entry.username;
    ctx.fillStyle = isTop3 ? "#ffffff" : "#dcddde";
    ctx.font = `${isTop3 ? "bold " : ""}${isTop3 ? 15 : 13}px sans-serif`;
    ctx.fillText(username, textX, rankCY - 12);

    // Unvan
    const rankTitle = econRankTitle(entry.econLevel);
    ctx.fillStyle = isTop3 ? MEDAL_COLORS[i]! + "cc" : "#72767d";
    ctx.font = "11px sans-serif";
    ctx.fillText(rankTitle, textX, rankCY + 4);

    // Coins
    ctx.fillStyle = isTop3 ? "#ffd700" : "#a0a8b4";
    ctx.font = `${isTop3 ? "bold " : ""}11px sans-serif`;
    ctx.fillText(`${coinSymbol} ${entry.coins.toLocaleString("tr-TR")} vivincy`, textX, rankCY + 20);

    // Sağ: seviye + XP
    const rightX = W - 36;
    ctx.textAlign = "right";

    const lvlColor = isTop3 ? MEDAL_COLORS[i]! : "#00e676";
    roundRect(ctx, rightX - 88, rankCY - 20, 92, 26, 8);
    ctx.fillStyle = lvlColor + "22"; ctx.fill();
    ctx.fillStyle = lvlColor; ctx.font = "bold 14px sans-serif";
    ctx.fillText(`SEV. ${entry.econLevel}`, rightX - 4, rankCY - 3);

    ctx.fillStyle = "#72767d"; ctx.font = "11px sans-serif";
    ctx.fillText(`${entry.econXp.toLocaleString("tr-TR")} XP`, rightX, rankCY + 16);

    ctx.textAlign = "left";
  }

  return canvas.toBuffer("image/png");
}
