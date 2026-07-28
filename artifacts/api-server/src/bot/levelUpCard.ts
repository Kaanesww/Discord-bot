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

export async function generateLevelUpCard(opts: {
  username: string;
  avatarUrl: string;
  oldLevel: number;
  newLevel: number;
}): Promise<Buffer> {
  const W = 700;
  const H = 200;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d") as any;

  // Arka plan - parlak kutlama gradyanı
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0f0030");
  bg.addColorStop(0.4, "#1a0050");
  bg.addColorStop(1, "#300020");
  roundRect(ctx, 0, 0, W, H, 18);
  ctx.fillStyle = bg;
  ctx.fill();

  // Merkez parlaklık
  const centerGlow = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 250);
  centerGlow.addColorStop(0, "rgba(255,200,0,0.22)");
  centerGlow.addColorStop(0.4, "rgba(235,69,158,0.12)");
  centerGlow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = centerGlow;
  ctx.fillRect(0, 0, W, H);

  // Kenarlık efekti
  const border = ctx.createLinearGradient(0, 0, W, H);
  border.addColorStop(0, "#ffd700");
  border.addColorStop(0.5, "#eb459e");
  border.addColorStop(1, "#5865f2");
  roundRect(ctx, 0, 0, W, H, 18);
  ctx.strokeStyle = border;
  ctx.lineWidth = 3;
  ctx.stroke();

  // Dekoratif yıldız noktaları
  const stars = [
    [60, 30], [640, 25], [30, 150], [670, 160],
    [120, 170], [580, 40], [350, 15], [400, 185],
  ] as [number, number][];
  for (const [sx, sy] of stars) {
    ctx.fillStyle = `rgba(255,215,0,${Math.random() * 0.5 + 0.3})`;
    ctx.beginPath();
    ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Avatar
  const avR = 60;
  const avX = 100;
  const avY = H / 2;

  const ring = ctx.createLinearGradient(avX - avR, avY - avR, avX + avR, avY + avR);
  ring.addColorStop(0, "#ffd700");
  ring.addColorStop(1, "#eb459e");
  ctx.beginPath();
  ctx.arc(avX, avY, avR + 5, 0, Math.PI * 2);
  ctx.strokeStyle = ring;
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.arc(avX, avY, avR, 0, Math.PI * 2);
  ctx.clip();
  try {
    const img = await loadImage(opts.avatarUrl + "?size=128");
    ctx.drawImage(img, avX - avR, avY - avR, avR * 2, avR * 2);
  } catch {
    ctx.fillStyle = "#5865f2";
    ctx.fillRect(avX - avR, avY - avR, avR * 2, avR * 2);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 40px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(opts.username.charAt(0).toUpperCase(), avX, avY + 14);
  }
  ctx.restore();

  // "SEVİYE ATLADIN!" başlığı
  const textX = avX + avR + 30;
  const titleGrad = ctx.createLinearGradient(textX, 0, textX + 400, 0);
  titleGrad.addColorStop(0, "#ffd700");
  titleGrad.addColorStop(0.5, "#fff");
  titleGrad.addColorStop(1, "#eb459e");
  ctx.fillStyle = titleGrad;
  ctx.font = "bold 30px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("🎉  SEVİYE ATLADIN!", textX, 64);

  // Kullanıcı adı
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = "16px sans-serif";
  const uname = opts.username.length > 24 ? opts.username.slice(0, 23) + "…" : opts.username;
  ctx.fillText(uname, textX, 92);

  // Seviye geçişi: eski → yeni
  const lvlY = 138;
  // Eski seviye kutusu
  roundRect(ctx, textX, lvlY - 28, 90, 44, 10);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fill();
  ctx.fillStyle = "#b9bbbe";
  ctx.font = "11px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("ESKİ", textX + 45, lvlY - 10);
  ctx.fillStyle = "#dcddde";
  ctx.font = "bold 22px sans-serif";
  ctx.fillText(String(opts.oldLevel), textX + 45, lvlY + 14);

  // Ok
  ctx.fillStyle = "#ffd700";
  ctx.font = "bold 28px sans-serif";
  ctx.fillText("→", textX + 104, lvlY + 10);

  // Yeni seviye kutusu (parlak)
  const newBg = ctx.createLinearGradient(textX + 140, lvlY - 28, textX + 230, lvlY + 16);
  newBg.addColorStop(0, "rgba(255,215,0,0.3)");
  newBg.addColorStop(1, "rgba(235,69,158,0.3)");
  roundRect(ctx, textX + 140, lvlY - 28, 90, 44, 10);
  ctx.fillStyle = newBg;
  ctx.fill();
  roundRect(ctx, textX + 140, lvlY - 28, 90, 44, 10);
  ctx.strokeStyle = "#ffd700";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = "#ffd700";
  ctx.font = "11px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("YENİ", textX + 185, lvlY - 10);
  ctx.fillStyle = "#ffd700";
  ctx.font = "bold 26px sans-serif";
  ctx.fillText(String(opts.newLevel), textX + 185, lvlY + 14);

  ctx.textAlign = "left";

  return canvas.toBuffer("image/png");
}
