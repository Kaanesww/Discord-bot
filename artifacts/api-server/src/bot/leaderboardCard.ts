import { createCanvas, loadImage } from "@napi-rs/canvas";

function roundRect(ctx: any, x: number, y: number, w: number, h: number, r: number): void {
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

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  avatarUrl: string;
  level: number;
  xp: number;
  xpCurrent: number;
  xpNeeded: number;
}

const MEDAL_COLORS = ["#ffd700", "#c0c0c0", "#cd7f32"];
const RANK_BG = ["rgba(255,215,0,0.15)", "rgba(192,192,192,0.12)", "rgba(205,127,50,0.12)"];

export async function generateLeaderboardCard(entries: LeaderboardEntry[]): Promise<Buffer> {
  const W = 760;
  const ROW_H = 72;
  const HEADER_H = 90;
  const H = HEADER_H + entries.length * ROW_H + 24;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d") as any;

  // Arka plan
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0d0d1a");
  bg.addColorStop(0.5, "#1a1a3e");
  bg.addColorStop(1, "#0d1020");
  roundRect(ctx, 0, 0, W, H, 20);
  ctx.fillStyle = bg;
  ctx.fill();

  // Dekoratif glow (üstte altın)
  const topGlow = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, 220);
  topGlow.addColorStop(0, "rgba(255,215,0,0.18)");
  topGlow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = topGlow;
  ctx.fillRect(0, 0, W, H);

  // Başlık
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  roundRect(ctx, 16, 14, W - 32, HEADER_H - 20, 12);
  ctx.fill();

  ctx.fillStyle = "#ffd700";
  ctx.font = "bold 32px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("🏆  SUNUCU LİDERBOARD", W / 2, 60);
  ctx.fillStyle = "#72767d";
  ctx.font = "14px sans-serif";
  ctx.fillText(`${entries.length} aktif üye`, W / 2, 82);
  ctx.textAlign = "left";

  // Satırlar
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    const rowY = HEADER_H + i * ROW_H;
    const isTop3 = i < 3;

    // Satır arka planı
    roundRect(ctx, 16, rowY + 4, W - 32, ROW_H - 8, 12);
    ctx.fillStyle = isTop3 ? RANK_BG[i]! : (i % 2 === 0 ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.2)");
    ctx.fill();

    // Sol renk çizgisi (top3)
    if (isTop3) {
      roundRect(ctx, 16, rowY + 4, 4, ROW_H - 8, 2);
      ctx.fillStyle = MEDAL_COLORS[i]!;
      ctx.fill();
    }

    // Rank
    const rankX = 34;
    const rankCY = rowY + ROW_H / 2;
    if (isTop3) {
      ctx.fillStyle = MEDAL_COLORS[i]!;
      ctx.font = "bold 22px sans-serif";
    } else {
      ctx.fillStyle = "#72767d";
      ctx.font = "bold 16px sans-serif";
    }
    ctx.textAlign = "center";
    ctx.fillText(isTop3 ? ["🥇", "🥈", "🥉"][i]! : `#${entry.rank}`, rankX + 14, rankCY + 6);
    ctx.textAlign = "left";

    // Avatar
    const avR = 22;
    const avX = 80;
    const avY = rankCY;
    ctx.save();
    ctx.beginPath();
    ctx.arc(avX, avY, avR, 0, Math.PI * 2);
    ctx.clip();
    try {
      const img = await loadImage(entry.avatarUrl + "?size=64");
      ctx.drawImage(img, avX - avR, avY - avR, avR * 2, avR * 2);
    } catch {
      ctx.fillStyle = "#5865f2";
      ctx.fillRect(avX - avR, avY - avR, avR * 2, avR * 2);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 16px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(entry.username.charAt(0).toUpperCase(), avX, avY + 6);
    }
    ctx.restore();

    // Avatar border (top3)
    if (isTop3) {
      ctx.beginPath();
      ctx.arc(avX, avY, avR + 2, 0, Math.PI * 2);
      ctx.strokeStyle = MEDAL_COLORS[i]!;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Kullanıcı adı
    const textX = avX + avR + 14;
    const username = entry.username.length > 18 ? entry.username.slice(0, 17) + "…" : entry.username;
    ctx.fillStyle = isTop3 ? "#ffffff" : "#dcddde";
    ctx.font = `${isTop3 ? "bold " : ""}${isTop3 ? 16 : 14}px sans-serif`;
    ctx.fillText(username, textX, rankCY - 8);

    // XP bar
    const barX = textX;
    const barY = rankCY + 2;
    const barW = 220;
    const barH = 10;
    const progress = Math.min(entry.xpCurrent / Math.max(entry.xpNeeded, 1), 1);

    roundRect(ctx, barX, barY, barW, barH, barH / 2);
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fill();

    if (progress > 0) {
      const grad = ctx.createLinearGradient(barX, 0, barX + barW * progress, 0);
      grad.addColorStop(0, isTop3 ? MEDAL_COLORS[i]! : "#5865f2");
      grad.addColorStop(1, "#eb459e");
      roundRect(ctx, barX, barY, Math.max(barW * progress, barH), barH, barH / 2);
      ctx.fillStyle = grad;
      ctx.fill();
    }

    // XP text (küçük)
    ctx.fillStyle = "#72767d";
    ctx.font = "11px sans-serif";
    ctx.fillText(`${entry.xpCurrent.toLocaleString()} / ${entry.xpNeeded.toLocaleString()} XP`, barX, rankCY + 22);

    // Sağ: Seviye badge + toplam XP
    const rightX = W - 36;
    ctx.textAlign = "right";

    // Seviye
    const lvlColor = isTop3 ? MEDAL_COLORS[i]! : "#5865f2";
    ctx.fillStyle = lvlColor + "33";
    roundRect(ctx, rightX - 80, rankCY - 20, 84, 26, 8);
    ctx.fill();
    ctx.fillStyle = lvlColor;
    ctx.font = "bold 14px sans-serif";
    ctx.fillText(`SEV. ${entry.level}`, rightX - 4, rankCY - 3);

    // Toplam XP
    ctx.fillStyle = "#72767d";
    ctx.font = "12px sans-serif";
    ctx.fillText(`${entry.xp.toLocaleString()} XP`, rightX, rankCY + 18);
    ctx.textAlign = "left";
  }

  return canvas.toBuffer("image/png");
}
