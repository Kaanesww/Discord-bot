import { createCanvas } from "@napi-rs/canvas";

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

export interface GuardModuleInfo {
  name: string;
  displayName: string;
  icon: string;
  enabled: boolean;
  details: string;
}

export interface GuardCardOptions {
  guildName: string;
  guildIcon?: string;
  modules: GuardModuleInfo[];
  logChannel: string | null;
}

export async function generateGuardCard(opts: GuardCardOptions): Promise<Buffer> {
  const W = 800;
  const HEADER_H = 100;
  const FOOTER_H = 52;
  const COLS = 2;
  const MOD_W = (W - 48 - 16) / COLS;
  const MOD_H = 80;
  const ROWS = Math.ceil(opts.modules.length / COLS);
  const H = HEADER_H + ROWS * (MOD_H + 12) + FOOTER_H + 20;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d") as any;

  // ── Arka plan ─────────────────────────────────────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0a0305");
  bg.addColorStop(0.5, "#160510");
  bg.addColorStop(1, "#0a0308");
  roundRect(ctx, 0, 0, W, H, 20);
  ctx.fillStyle = bg; ctx.fill();

  // Üst kırmızı glow
  const glow = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, 250);
  glow.addColorStop(0, "rgba(240,71,71,0.20)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);

  // Izgara
  ctx.save();
  ctx.globalAlpha = 0.025;
  ctx.strokeStyle = "#f04747"; ctx.lineWidth = 0.5;
  for (let x = 0; x < W; x += 35) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 35) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  ctx.restore();

  // Kenarlık
  const bord = ctx.createLinearGradient(0, 0, W, H);
  bord.addColorStop(0, "#f04747"); bord.addColorStop(0.5, "#ed4245"); bord.addColorStop(1, "#f04747");
  roundRect(ctx, 0, 0, W, H, 20);
  ctx.strokeStyle = bord; ctx.lineWidth = 2.5; ctx.stroke();

  // Sol aksan çizgisi
  roundRect(ctx, 0, 0, 6, H, 3);
  const accentBar = ctx.createLinearGradient(0, 0, 0, H);
  accentBar.addColorStop(0, "#f04747"); accentBar.addColorStop(1, "#ed4245");
  ctx.fillStyle = accentBar; ctx.fill();

  // ── Başlık ──────────────────────────────────────────────────────────────────
  roundRect(ctx, 16, 10, W - 32, HEADER_H - 14, 12);
  ctx.fillStyle = "rgba(240,71,71,0.06)"; ctx.fill();

  const titleGrad = ctx.createLinearGradient(W / 2 - 200, 0, W / 2 + 200, 0);
  titleGrad.addColorStop(0, "#f04747"); titleGrad.addColorStop(0.5, "#ff8c8c"); titleGrad.addColorStop(1, "#f04747");
  ctx.fillStyle = titleGrad; ctx.font = "bold 28px sans-serif"; ctx.textAlign = "center";
  ctx.fillText("🛡️  GUARD KORUMA SİSTEMİ", W / 2, 52);
  ctx.fillStyle = "#72767d"; ctx.font = "13px sans-serif";
  ctx.fillText(`${opts.guildName}  •  Koruma durumu`, W / 2, 76);

  // Etkin modül sayısı rozeti
  const activeCount = opts.modules.filter(m => m.enabled).length;
  const totalCount = opts.modules.length;
  const badgeText = `${activeCount}/${totalCount} modül aktif`;
  const badgeW = ctx.measureText(badgeText).width + 24;
  roundRect(ctx, W / 2 - badgeW / 2, 82, badgeW, 20, 10);
  ctx.fillStyle = activeCount > 0 ? "rgba(87,242,135,0.15)" : "rgba(240,71,71,0.15)"; ctx.fill();
  ctx.fillStyle = activeCount > 0 ? "#57f287" : "#f04747"; ctx.font = "bold 11px sans-serif";
  ctx.fillText(badgeText, W / 2 - badgeW / 2 + 12, 96);
  ctx.textAlign = "left";

  // ── Modül kartları ──────────────────────────────────────────────────────────
  opts.modules.forEach((mod, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = 24 + col * (MOD_W + 16);
    const y = HEADER_H + 8 + row * (MOD_H + 12);

    // Kart arka planı
    roundRect(ctx, x, y, MOD_W, MOD_H, 12);
    ctx.fillStyle = mod.enabled
      ? "rgba(87,242,135,0.05)"
      : "rgba(255,255,255,0.02)";
    ctx.fill();

    // Sol çizgi
    roundRect(ctx, x, y, 4, MOD_H, 2);
    ctx.fillStyle = mod.enabled ? "#57f287" : "#f04747"; ctx.fill();

    // Üst başlık bar
    roundRect(ctx, x + 4, y, MOD_W - 4, 40, 10);
    ctx.fillStyle = mod.enabled
      ? "rgba(87,242,135,0.08)"
      : "rgba(240,71,71,0.06)";
    ctx.fill();

    // Durum göstergesi (LED efekti)
    ctx.beginPath();
    ctx.arc(x + 20, y + 20, 7, 0, Math.PI * 2);
    ctx.fillStyle = mod.enabled ? "#57f287" : "#f04747"; ctx.fill();
    if (mod.enabled) {
      ctx.beginPath(); ctx.arc(x + 20, y + 20, 11, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(87,242,135,0.25)"; ctx.fill();
    }

    // İkon + isim
    ctx.fillStyle = mod.enabled ? "#57f287" : "#f04747";
    ctx.font = "bold 14px sans-serif";
    ctx.fillText(`${mod.icon}  ${mod.displayName}`, x + 36, y + 25);

    // Durum yazısı
    const statusText = mod.enabled ? "AKTİF" : "PASİF";
    ctx.fillStyle = mod.enabled ? "rgba(87,242,135,0.7)" : "rgba(240,71,71,0.6)";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(statusText, x + MOD_W - 12, y + 25);
    ctx.textAlign = "left";

    // Detay metni
    ctx.fillStyle = "#9b9da4"; ctx.font = "11px sans-serif";
    const detail = mod.details.length > 60 ? mod.details.slice(0, 59) + "…" : mod.details;
    ctx.fillText(detail, x + 12, y + 58);
  });

  // ── Footer ─────────────────────────────────────────────────────────────────
  const fy = H - FOOTER_H;
  ctx.strokeStyle = "rgba(240,71,71,0.12)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(20, fy); ctx.lineTo(W - 20, fy); ctx.stroke();

  ctx.fillStyle = "#72767d"; ctx.font = "12px sans-serif"; ctx.textAlign = "center";
  const logText = opts.logChannel
    ? `📋 Log kanalı: ${opts.logChannel}`
    : "📋 Log kanalı ayarlanmamış — guard log #kanal ile ayarla";
  ctx.fillText(logText, W / 2, fy + 18);
  ctx.fillStyle = "rgba(240,71,71,0.5)"; ctx.font = "11px sans-serif";
  ctx.fillText("guard spam aç / link aç / bot aç / emoji aç / rol aç / kanal aç — guard kapat ile kapat", W / 2, fy + 36);
  ctx.textAlign = "left";

  return canvas.toBuffer("image/png");
}
