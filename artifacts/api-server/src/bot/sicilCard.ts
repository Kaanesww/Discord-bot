import { createCanvas, loadImage } from "@napi-rs/canvas";
import type { ModerationLog } from "@workspace/db";

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx2D = any;

const ACTION_COLORS: Record<string, string> = {
  warn: "#faa61a",
  kick: "#ed4245",
  ban: "#eb459e",
  unban: "#57f287",
  timeout: "#5865f2",
  untimeout: "#57f287",
};

const ACTION_ICONS: Record<string, string> = {
  warn: "⚠",
  kick: "👢",
  ban: "🔨",
  unban: "✅",
  timeout: "🔇",
  untimeout: "🔊",
};

export async function generateSicilCard(opts: {
  username: string;
  avatarUrl: string;
  logs: ModerationLog[];
}): Promise<Buffer> {
  const W = 760;
  const recentCount = Math.min(opts.logs.length, 6);
  const H = 280 + recentCount * 44 + 20;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d") as Ctx2D;

  // ── Arka plan ──────────────────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#1a0a2e");
  bg.addColorStop(0.5, "#1a1a3e");
  bg.addColorStop(1, "#0f1923");
  roundRect(ctx, 0, 0, W, H, 20);
  ctx.fillStyle = bg;
  ctx.fill();

  // Dekoratif glow
  const glow = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, 300);
  glow.addColorStop(0, "rgba(235,69,158,0.12)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // ── Başlık çizgisi ──────────────────────────────────────
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  roundRect(ctx, 20, 20, W - 40, 200, 14);
  ctx.fill();

  // ── Avatar ─────────────────────────────────────────────
  const avSize = 110;
  const avX = 44;
  const avY = 45;
  const cx = avX + avSize / 2;
  const cy = avY + avSize / 2;

  const ring = ctx.createLinearGradient(avX, avY, avX + avSize, avY + avSize);
  ring.addColorStop(0, "#eb459e");
  ring.addColorStop(1, "#5865f2");
  ctx.beginPath();
  ctx.arc(cx, cy, avSize / 2 + 4, 0, Math.PI * 2);
  ctx.strokeStyle = ring;
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, avSize / 2, 0, Math.PI * 2);
  ctx.clip();
  try {
    const img = await loadImage(opts.avatarUrl + "?size=256");
    ctx.drawImage(img, avX, avY, avSize, avSize);
  } catch {
    ctx.fillStyle = "#5865f2";
    ctx.fillRect(avX, avY, avSize, avSize);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 40px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(opts.username.charAt(0).toUpperCase(), cx, cy + 14);
  }
  ctx.restore();

  // ── Kullanıcı adı & başlık ─────────────────────────────
  const tx = avX + avSize + 24;
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 28px sans-serif";
  ctx.textAlign = "left";
  const name = opts.username.length > 20 ? opts.username.slice(0, 19) + "…" : opts.username;
  ctx.fillText(name, tx, 80);

  ctx.fillStyle = "#b9bbbe";
  ctx.font = "16px sans-serif";
  ctx.fillText("🛡️  Moderasyon Sicil Kaydı", tx, 106);

  // ── İstatistik kutucukları ─────────────────────────────
  const stats = [
    { label: "Uyarı", color: "#faa61a", count: opts.logs.filter((l) => l.action === "warn").length },
    { label: "Kick", color: "#ed4245", count: opts.logs.filter((l) => l.action === "kick").length },
    { label: "Ban", color: "#eb459e", count: opts.logs.filter((l) => l.action === "ban").length },
    { label: "Timeout", color: "#5865f2", count: opts.logs.filter((l) => l.action === "timeout").length },
  ];

  const boxW = 120;
  const boxH = 64;
  const boxY = 140;
  let boxX = tx;
  for (const stat of stats) {
    roundRect(ctx, boxX, boxY, boxW, boxH, 10);
    ctx.fillStyle = stat.color + "22";
    ctx.fill();
    roundRect(ctx, boxX, boxY, boxW, boxH, 10);
    ctx.strokeStyle = stat.color + "88";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = stat.color;
    ctx.font = "bold 26px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(String(stat.count), boxX + boxW / 2, boxY + 36);
    ctx.fillStyle = "#b9bbbe";
    ctx.font = "12px sans-serif";
    ctx.fillText(stat.label, boxX + boxW / 2, boxY + 54);
    boxX += boxW + 10;
  }

  // Toplam kayıt
  ctx.textAlign = "right";
  ctx.fillStyle = "#72767d";
  ctx.font = "13px sans-serif";
  ctx.fillText(`Toplam ${opts.logs.length} işlem`, W - 36, boxY + 54);
  ctx.textAlign = "left";

  // ── Son işlemler ───────────────────────────────────────
  if (recentCount === 0) {
    ctx.fillStyle = "#72767d";
    ctx.font = "15px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Kayıt bulunamadı", W / 2, 260);
    ctx.textAlign = "left";
  } else {
    // Başlık
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    roundRect(ctx, 20, 238, W - 40, 26, 8);
    ctx.fill();
    ctx.fillStyle = "#dcddde";
    ctx.font = "bold 13px sans-serif";
    ctx.fillText("SON İŞLEMLER", 36, 255);

    const recent = opts.logs.slice(0, recentCount);
    for (let i = 0; i < recent.length; i++) {
      const log = recent[i]!;
      const rowY = 276 + i * 44;
      const color = ACTION_COLORS[log.action] ?? "#99aab5";
      const icon = ACTION_ICONS[log.action] ?? "•";

      // Satır arka planı
      roundRect(ctx, 20, rowY, W - 40, 36, 8);
      ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.15)";
      ctx.fill();

      // Sol renk şeridi
      roundRect(ctx, 20, rowY, 4, 36, 2);
      ctx.fillStyle = color;
      ctx.fill();

      // ID badge
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      roundRect(ctx, 34, rowY + 8, 42, 20, 6);
      ctx.fill();
      ctx.fillStyle = "#72767d";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`#${log.id}`, 55, rowY + 22);
      ctx.textAlign = "left";

      // Aksiyon
      ctx.fillStyle = color;
      ctx.font = "bold 13px sans-serif";
      ctx.fillText(`${icon} ${log.action.toUpperCase()}`, 84, rowY + 23);

      // Sebep
      const reason = log.reason ?? "Sebep belirtilmedi";
      const reasonClip = reason.length > 50 ? reason.slice(0, 49) + "…" : reason;
      ctx.fillStyle = "#b9bbbe";
      ctx.font = "12px sans-serif";
      ctx.fillText(`— ${reasonClip}`, 180, rowY + 23);

      // Tarih
      const dateStr = log.createdAt.toLocaleDateString("tr-TR", {
        day: "2-digit", month: "short", year: "numeric",
      });
      ctx.fillStyle = "#72767d";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(dateStr, W - 36, rowY + 23);
      ctx.textAlign = "left";
    }
  }

  return canvas.toBuffer("image/png");
}
