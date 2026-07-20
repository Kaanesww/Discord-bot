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

// Para sembolu çiz (basit coin icon)
function drawCoin(ctx: any, cx: number, cy: number, r: number): void {
  // Dış çember
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "#ffd700";
  ctx.fill();
  // İç çember
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.75, 0, Math.PI * 2);
  ctx.fillStyle = "#f0a500";
  ctx.fill();
  // ₺ işareti
  ctx.fillStyle = "#ffd700";
  ctx.font = `bold ${Math.round(r * 1.1)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("$", cx, cy + 1);
  ctx.textBaseline = "alphabetic";
}

export async function generateEconLevelUpCard(opts: {
  username: string;
  avatarUrl: string;
  newLevel: number;
  reward: number;
  rankTitle: string;
  coinSymbol?: string;
}): Promise<Buffer> {
  const W = 720;
  const H = 220;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d") as any;

  // ── Arka plan: koyu yeşil → siyah fintech teması ───────────────────────────
  roundRect(ctx, 0, 0, W, H, 20);
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, "#0a1a0f");
  bgGrad.addColorStop(0.5, "#0d2010");
  bgGrad.addColorStop(1, "#06120a");
  ctx.fillStyle = bgGrad;
  ctx.fill();

  // Sol taraf yeşil aksan şeridi
  const accentGrad = ctx.createLinearGradient(0, 0, 0, H);
  accentGrad.addColorStop(0, "#00e676");
  accentGrad.addColorStop(0.5, "#00c853");
  accentGrad.addColorStop(1, "#69f0ae");
  roundRect(ctx, 0, 0, 6, H, 3);
  ctx.fillStyle = accentGrad;
  ctx.fill();

  // Sağ köşe dekoratif para sembolleri (soluk)
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = "#00e676";
  ctx.font = "bold 80px sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("$", W - 20, 80);
  ctx.font = "bold 50px sans-serif";
  ctx.fillText("₺", W - 30, 160);
  ctx.font = "bold 35px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("€", W - 120, 200);
  ctx.restore();

  // Izgara deseni (ince çizgiler)
  ctx.save();
  ctx.globalAlpha = 0.04;
  ctx.strokeStyle = "#00e676";
  ctx.lineWidth = 0.5;
  for (let x = 0; x < W; x += 30) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y < H; y += 30) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  ctx.restore();

  // ── Kenarlık: ince neon yeşil ──────────────────────────────────────────────
  roundRect(ctx, 1, 1, W - 2, H - 2, 20);
  ctx.strokeStyle = "rgba(0,230,118,0.35)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // ── Avatar (kare, köşe yuvarlatılmış — bankacılık kimlik kartı stili) ──────
  const AV_SIZE = 80;
  const AV_X = 30;
  const AV_Y = H / 2 - AV_SIZE / 2;

  // Dış çerçeve — altın kart çerçevesi
  roundRect(ctx, AV_X - 4, AV_Y - 4, AV_SIZE + 8, AV_SIZE + 8, 14);
  const frameGrad = ctx.createLinearGradient(AV_X, AV_Y, AV_X + AV_SIZE, AV_Y + AV_SIZE);
  frameGrad.addColorStop(0, "#ffd700");
  frameGrad.addColorStop(0.5, "#00e676");
  frameGrad.addColorStop(1, "#ffd700");
  ctx.strokeStyle = frameGrad;
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.save();
  roundRect(ctx, AV_X, AV_Y, AV_SIZE, AV_SIZE, 10);
  ctx.clip();
  try {
    const img = await loadImage(opts.avatarUrl + "?size=128");
    ctx.drawImage(img, AV_X, AV_Y, AV_SIZE, AV_SIZE);
  } catch {
    ctx.fillStyle = "#1a3a1f";
    ctx.fillRect(AV_X, AV_Y, AV_SIZE, AV_SIZE);
    ctx.fillStyle = "#00e676";
    ctx.font = "bold 36px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(opts.username.charAt(0).toUpperCase(), AV_X + AV_SIZE / 2, AV_Y + AV_SIZE / 2 + 13);
  }
  ctx.restore();

  // ── Sağ içerik alanı ──────────────────────────────────────────────────────
  const TX = AV_X + AV_SIZE + 22;

  // "EKONOMİ SEVİYE ATLANDI!" başlığı
  const titleGrad = ctx.createLinearGradient(TX, 0, TX + 380, 0);
  titleGrad.addColorStop(0, "#00e676");
  titleGrad.addColorStop(0.5, "#ffd700");
  titleGrad.addColorStop(1, "#00e676");
  ctx.fillStyle = titleGrad;
  ctx.font = "bold 22px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("💹  EKONOMİ SEVİYE ATLANDI!", TX, 45);

  // Kullanıcı adı
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.font = "14px sans-serif";
  const uname = opts.username.length > 28 ? opts.username.slice(0, 27) + "…" : opts.username;
  ctx.fillText(uname, TX, 68);

  // ── Seviye badge'i ─────────────────────────────────────────────────────────
  const badgeX = TX;
  const badgeY = 84;
  const badgeW = 130;
  const badgeH = 52;

  // Badge arkaplan
  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 12);
  const badgeBg = ctx.createLinearGradient(badgeX, badgeY, badgeX + badgeW, badgeY + badgeH);
  badgeBg.addColorStop(0, "rgba(0,230,118,0.18)");
  badgeBg.addColorStop(1, "rgba(0,200,83,0.08)");
  ctx.fillStyle = badgeBg;
  ctx.fill();
  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 12);
  ctx.strokeStyle = "rgba(0,230,118,0.6)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = "rgba(0,230,118,0.7)";
  ctx.font = "10px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("YENİ SEVİYE", badgeX + badgeW / 2, badgeY + 16);

  ctx.fillStyle = "#00e676";
  ctx.font = "bold 28px sans-serif";
  ctx.fillText(`SEVİYE ${opts.newLevel}`, badgeX + badgeW / 2, badgeY + 43);

  // ── Rank unvanı ────────────────────────────────────────────────────────────
  const titleBadgeX = badgeX + badgeW + 14;
  const titleBadgeW = 160;

  roundRect(ctx, titleBadgeX, badgeY, titleBadgeW, badgeH, 12);
  const tbBg = ctx.createLinearGradient(titleBadgeX, badgeY, titleBadgeX + titleBadgeW, badgeY + badgeH);
  tbBg.addColorStop(0, "rgba(255,215,0,0.15)");
  tbBg.addColorStop(1, "rgba(255,215,0,0.05)");
  ctx.fillStyle = tbBg;
  ctx.fill();
  roundRect(ctx, titleBadgeX, badgeY, titleBadgeW, badgeH, 12);
  ctx.strokeStyle = "rgba(255,215,0,0.5)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = "rgba(255,215,0,0.7)";
  ctx.font = "10px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("UNVAN", titleBadgeX + titleBadgeW / 2, badgeY + 16);
  ctx.fillStyle = "#ffd700";
  ctx.font = "bold 15px sans-serif";
  const rankText = opts.rankTitle.length > 16 ? opts.rankTitle.slice(0, 15) + "…" : opts.rankTitle;
  ctx.fillText(rankText, titleBadgeX + titleBadgeW / 2, badgeY + 39);

  // ── Ödül alanı (sağ taraf) ─────────────────────────────────────────────────
  const rewardX = titleBadgeX + titleBadgeW + 18;
  const rewardW = W - rewardX - 20;

  roundRect(ctx, rewardX, badgeY, rewardW, badgeH, 12);
  const rewBg = ctx.createLinearGradient(rewardX, badgeY, rewardX + rewardW, badgeY + badgeH);
  rewBg.addColorStop(0, "rgba(255,215,0,0.2)");
  rewBg.addColorStop(1, "rgba(255,165,0,0.1)");
  ctx.fillStyle = rewBg;
  ctx.fill();
  roundRect(ctx, rewardX, badgeY, rewardW, badgeH, 12);
  ctx.strokeStyle = "rgba(255,215,0,0.7)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Küçük coin çiz
  drawCoin(ctx, rewardX + 18, badgeY + 16, 10);

  ctx.fillStyle = "rgba(255,215,0,0.8)";
  ctx.font = "10px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("ÖDÜL", rewardX + rewardW / 2, badgeY + 16);

  ctx.fillStyle = "#ffd700";
  ctx.font = `bold ${opts.reward >= 10000 ? "14" : "17"}px sans-serif`;
  ctx.fillText(`+${opts.reward.toLocaleString("en-US")}`, rewardX + rewardW / 2, badgeY + 43);

  // ── Alt bilgi çizgisi ─────────────────────────────────────────────────────
  const lineY = H - 38;
  ctx.strokeStyle = "rgba(0,230,118,0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(TX, lineY); ctx.lineTo(W - 20, lineY); ctx.stroke();

  ctx.fillStyle = "rgba(0,230,118,0.45)";
  ctx.font = "11px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`${opts.coinSymbol ?? "🪙"} Vivincy Ekonomi Sistemi  •  ekono komutuyla seviyeni gör`, TX, lineY + 17);

  ctx.textAlign = "left";
  return canvas.toBuffer("image/png");
}
