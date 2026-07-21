import { createCanvas } from "@napi-rs/canvas";
import { type MaintenanceEntry, formatElapsed } from "./maintenance";

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

export interface MaintenanceCardOptions {
  entries: MaintenanceEntry[];
  ownerName: string;
  botName?: string;
}

export async function generateMaintenanceCard(opts: MaintenanceCardOptions): Promise<Buffer> {
  const W = 780;
  const HEADER_H = 110;
  const ENTRY_H = 72;
  const FOOTER_H = 56;
  const EMPTY_H = 100;
  const hasEntries = opts.entries.length > 0;
  const contentH = hasEntries ? opts.entries.length * ENTRY_H + 16 : EMPTY_H;
  const H = HEADER_H + contentH + FOOTER_H;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d") as any;

  // ── Arka plan (koyu amber/turuncu uyarı teması) ────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0d0900");
  bg.addColorStop(0.5, "#1a1000");
  bg.addColorStop(1, "#0d0800");
  roundRect(ctx, 0, 0, W, H, 20);
  ctx.fillStyle = bg; ctx.fill();

  // Üst amber glow
  const glow = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, 260);
  glow.addColorStop(0, "rgba(255,165,0,0.22)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);

  // Sağ alt kırmızı glow (tehlike)
  const glow2 = ctx.createRadialGradient(W, H, 0, W, H, 200);
  glow2.addColorStop(0, "rgba(240,71,71,0.12)");
  glow2.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow2; ctx.fillRect(0, 0, W, H);

  // Kenarlık (amber→kırmızı degrade)
  const bord = ctx.createLinearGradient(0, 0, W, H);
  bord.addColorStop(0, "#ffa500"); bord.addColorStop(0.5, "#ff6b00"); bord.addColorStop(1, "#f04747");
  roundRect(ctx, 0, 0, W, H, 20);
  ctx.strokeStyle = bord; ctx.lineWidth = 2.5; ctx.stroke();

  // Sol aksan çizgisi
  roundRect(ctx, 0, 0, 6, H, 3);
  const accentBar = ctx.createLinearGradient(0, 0, 0, H);
  accentBar.addColorStop(0, "#ffa500"); accentBar.addColorStop(1, "#f04747");
  ctx.fillStyle = accentBar; ctx.fill();

  // Uyarı çizgisi deseni (üst köşe)
  ctx.save();
  ctx.globalAlpha = 0.04;
  const stripe = ctx.createLinearGradient(0, 0, 40, 40);
  stripe.addColorStop(0, "#ffa500"); stripe.addColorStop(0.5, "#000000"); stripe.addColorStop(1, "#ffa500");
  for (let i = -H; i < W + H; i += 28) {
    ctx.beginPath();
    ctx.moveTo(i, 0); ctx.lineTo(i + H, H);
    ctx.strokeStyle = "#ffa500"; ctx.lineWidth = 10; ctx.stroke();
  }
  ctx.restore();

  // ── Başlık ─────────────────────────────────────────────────────────────────
  roundRect(ctx, 14, 10, W - 28, HEADER_H - 14, 12);
  ctx.fillStyle = "rgba(255,165,0,0.06)"; ctx.fill();

  // Uyarı ikonu
  ctx.font = "bold 28px sans-serif"; ctx.textAlign = "center";
  ctx.fillStyle = "#ffa500";
  ctx.fillText("⚠️", W / 2, 44);

  // Başlık metni
  const titleGrad = ctx.createLinearGradient(W / 2 - 180, 0, W / 2 + 180, 0);
  titleGrad.addColorStop(0, "#ffa500"); titleGrad.addColorStop(0.5, "#ffcc00"); titleGrad.addColorStop(1, "#ffa500");
  ctx.fillStyle = titleGrad; ctx.font = "bold 26px sans-serif";
  ctx.fillText(`🔧  ${opts.botName ?? "VBRI"} — BAKIM MODU`, W / 2, 70);

  // Alt bilgi
  const now = new Date();
  const dateStr = now.toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" });
  const timeStr = now.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  ctx.fillStyle = "#a08040"; ctx.font = "13px sans-serif";
  ctx.fillText(`${opts.entries.length} komut bakımda  •  ${dateStr} ${timeStr}`, W / 2, 92);
  ctx.textAlign = "left";

  // ── İçerik ─────────────────────────────────────────────────────────────────
  if (!hasEntries) {
    // Boş durum
    roundRect(ctx, 20, HEADER_H + 8, W - 40, EMPTY_H - 16, 12);
    ctx.fillStyle = "rgba(255,255,255,0.02)"; ctx.fill();
    ctx.fillStyle = "#57f287"; ctx.font = "bold 15px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("✅  Şu an bakımda olan komut yok — her şey çalışıyor!", W / 2, HEADER_H + 56);
    ctx.textAlign = "left";
  } else {
    for (let i = 0; i < opts.entries.length; i++) {
      const entry = opts.entries[i]!;
      const rowY = HEADER_H + 8 + i * ENTRY_H;

      // Satır arka planı
      roundRect(ctx, 20, rowY + 4, W - 40, ENTRY_H - 8, 10);
      ctx.fillStyle = i % 2 === 0 ? "rgba(255,165,0,0.05)" : "rgba(0,0,0,0.15)"; ctx.fill();

      // Sol kırmızı çizgi
      roundRect(ctx, 20, rowY + 4, 4, ENTRY_H - 8, 2);
      ctx.fillStyle = "#f04747"; ctx.fill();

      // İndeks numarası
      ctx.fillStyle = "#a08040"; ctx.font = "bold 13px sans-serif"; ctx.textAlign = "center";
      ctx.fillText(`${i + 1}`, 46, rowY + ENTRY_H / 2 + 5);
      ctx.textAlign = "left";

      // Komut adı (büyük, parlak)
      ctx.fillStyle = "#ffcc00"; ctx.font = "bold 18px sans-serif";
      ctx.fillText(`v!${entry.command}`, 64, rowY + 28);

      // Sebep
      const reason = entry.reason.length > 70 ? entry.reason.slice(0, 69) + "…" : entry.reason;
      ctx.fillStyle = "#a09060"; ctx.font = "13px sans-serif";
      ctx.fillText(reason, 64, rowY + 50);

      // Sağ: geçen süre
      const elapsed = formatElapsed(entry.addedAt);
      ctx.textAlign = "right";
      roundRect(ctx, W - 130, rowY + 14, 110, 30, 8);
      ctx.fillStyle = "rgba(240,71,71,0.15)"; ctx.fill();
      ctx.strokeStyle = "rgba(240,71,71,0.4)"; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = "#f04747"; ctx.font = "bold 13px sans-serif";
      ctx.fillText(`🕐 ${elapsed}`, W - 28, rowY + 34);
      ctx.textAlign = "left";
    }
  }

  // ── Footer ─────────────────────────────────────────────────────────────────
  const fy = H - FOOTER_H;
  ctx.strokeStyle = "rgba(255,165,0,0.12)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(20, fy); ctx.lineTo(W - 20, fy); ctx.stroke();

  ctx.fillStyle = "#a08040"; ctx.font = "12px sans-serif"; ctx.textAlign = "center";
  ctx.fillText(`👑 Sistem yöneticisi: ${opts.ownerName}`, W / 2, fy + 18);
  ctx.fillStyle = "rgba(255,165,0,0.45)"; ctx.font = "11px sans-serif";
  ctx.fillText(`bakım <komut> [sebep] — bakım kaldır <komut> — bakım liste — bakım hepsini kaldır`, W / 2, fy + 36);
  ctx.textAlign = "left";

  return canvas.toBuffer("image/png");
}
