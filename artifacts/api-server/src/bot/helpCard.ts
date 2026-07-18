import { createCanvas } from "@napi-rs/canvas";

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

interface CommandEntry {
  name: string;
  desc: string;
}

interface Category {
  label: string;
  icon: string;
  color: string;
  commands: CommandEntry[];
}

export async function generateHelpCard(prefix: string): Promise<Buffer> {
  const categories: Category[] = [
    {
      label: "Moderasyon",
      icon: "🛡️",
      color: "#ed4245",
      commands: [
        { name: `${prefix}ban / /ban`, desc: "Kullanıcıyı yasaklar" },
        { name: `${prefix}kick / /kick`, desc: "Kullanıcıyı atar" },
        { name: `${prefix}warn / /warn`, desc: "Uyarı verir + DM atar" },
        { name: `/timeout`, desc: "Kullanıcıyı susturur" },
        { name: `/untimeout`, desc: "Susturmayı kaldırır" },
        { name: `/unban`, desc: "Yasağı kaldırır" },
        { name: `/uyarikaldir`, desc: "Uyarıyı sicitten siler" },
        { name: `${prefix}temizle / /temizle`, desc: "Toplu mesaj siler (maks 100)" },
      ],
    },
    {
      label: "Sicil & Kayıt",
      icon: "📋",
      color: "#faa61a",
      commands: [
        { name: `${prefix}sicil / /sicil`, desc: "Görselli sicil kaydı" },
      ],
    },
    {
      label: "Level Sistemi",
      icon: "⭐",
      color: "#5865f2",
      commands: [
        { name: `${prefix}level / /level`, desc: "Seviye kartını gösterir" },
        { name: `${prefix}profil / /profil`, desc: "Profil kartını gösterir" },
        { name: `${prefix}lb / /leaderboard`, desc: "Liderboard görselini gösterir" },
        { name: `/levelrol ekle`, desc: "Seviyeye rol ödülü bağlar" },
        { name: `/levelrol liste`, desc: "Tüm rol ödüllerini listeler" },
        { name: `/levelrol kaldir`, desc: "Rol ödülünü kaldırır" },
      ],
    },
    {
      label: "Ayarlar",
      icon: "⚙️",
      color: "#57f287",
      commands: [
        { name: `${prefix}setprefix / /setprefix`, desc: "Bot prefixini değiştirir" },
        { name: `${prefix}yardim / /yardim`, desc: "Bu yardım kartını gösterir" },
      ],
    },
  ];

  // Boyut hesapla
  const W = 820;
  const COL_W = (W - 60) / 2;
  const CMD_H = 28;
  const CAT_HEADER_H = 40;
  const CAT_PAD = 14;

  // Kategorileri iki sütuna böl
  const leftCats = [categories[0]!, categories[1]!];
  const rightCats = [categories[2]!, categories[3]!];

  function colHeight(cats: Category[]): number {
    return cats.reduce((sum, c) => sum + CAT_HEADER_H + c.commands.length * CMD_H + CAT_PAD * 2 + 12, 0);
  }

  const HEADER_H = 100;
  const FOOTER_H = 44;
  const bodyH = Math.max(colHeight(leftCats), colHeight(rightCats));
  const H = HEADER_H + bodyH + FOOTER_H + 24;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d") as any;

  // ── Arka plan ──────────────────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0a0a1a");
  bg.addColorStop(0.45, "#111130");
  bg.addColorStop(1, "#0a1020");
  roundRect(ctx, 0, 0, W, H, 20);
  ctx.fillStyle = bg;
  ctx.fill();

  // Üst glow
  const topGlow = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, 280);
  topGlow.addColorStop(0, "rgba(88,101,242,0.20)");
  topGlow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = topGlow;
  ctx.fillRect(0, 0, W, H);

  // Sol alt glow
  const blGlow = ctx.createRadialGradient(0, H, 0, 0, H, 200);
  blGlow.addColorStop(0, "rgba(235,69,158,0.10)");
  blGlow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = blGlow;
  ctx.fillRect(0, 0, W, H);

  // Kenarlık
  const border = ctx.createLinearGradient(0, 0, W, H);
  border.addColorStop(0, "#5865f2");
  border.addColorStop(0.5, "#eb459e");
  border.addColorStop(1, "#5865f2");
  roundRect(ctx, 0, 0, W, H, 20);
  ctx.strokeStyle = border;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // ── Başlık ──────────────────────────────────────────────
  const titleGrad = ctx.createLinearGradient(0, 0, W, 0);
  titleGrad.addColorStop(0, "#5865f2");
  titleGrad.addColorStop(0.5, "#ffffff");
  titleGrad.addColorStop(1, "#eb459e");
  ctx.fillStyle = titleGrad;
  ctx.font = "bold 36px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("📖  BOT KOMUT REHBERİ", W / 2, 52);

  ctx.fillStyle = "#72767d";
  ctx.font = "15px sans-serif";
  ctx.fillText(`Prefix: ${prefix}komut  veya  /komut şeklinde kullanabilirsin`, W / 2, 80);
  ctx.textAlign = "left";

  // Başlık çizgisi
  const lineGrad = ctx.createLinearGradient(20, 0, W - 20, 0);
  lineGrad.addColorStop(0, "rgba(88,101,242,0)");
  lineGrad.addColorStop(0.3, "#5865f2");
  lineGrad.addColorStop(0.7, "#eb459e");
  lineGrad.addColorStop(1, "rgba(235,69,158,0)");
  ctx.strokeStyle = lineGrad;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(20, HEADER_H - 8);
  ctx.lineTo(W - 20, HEADER_H - 8);
  ctx.stroke();

  // ── Kategorileri çiz ────────────────────────────────────
  function drawCategory(cat: Category, x: number, y: number): number {
    const catH = CAT_HEADER_H + cat.commands.length * CMD_H + CAT_PAD * 2;

    // Kategori kutusu arka planı
    roundRect(ctx, x, y, COL_W, catH, 12);
    ctx.fillStyle = "rgba(255,255,255,0.04)";
    ctx.fill();

    // Sol renk şeridi
    roundRect(ctx, x, y, 4, catH, 2);
    ctx.fillStyle = cat.color;
    ctx.fill();

    // Kategori başlığı arka planı
    roundRect(ctx, x, y, COL_W, CAT_HEADER_H, 12);
    ctx.fillStyle = cat.color + "22";
    ctx.fill();

    // Başlık metni
    ctx.fillStyle = cat.color;
    ctx.font = "bold 15px sans-serif";
    ctx.fillText(`${cat.icon}  ${cat.label}`, x + 16, y + 26);

    // Komut sayısı badge
    const countText = `${cat.commands.length} komut`;
    const countW = ctx.measureText(countText).width + 16;
    roundRect(ctx, x + COL_W - countW - 12, y + 10, countW, 22, 8);
    ctx.fillStyle = cat.color + "33";
    ctx.fill();
    ctx.fillStyle = cat.color;
    ctx.font = "11px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(countText, x + COL_W - 20, y + 26);
    ctx.textAlign = "left";

    // Komutlar
    for (let i = 0; i < cat.commands.length; i++) {
      const cmd = cat.commands[i]!;
      const cmdY = y + CAT_HEADER_H + i * CMD_H + CAT_PAD;
      const isEven = i % 2 === 0;

      if (isEven) {
        roundRect(ctx, x + 8, cmdY - 4, COL_W - 16, CMD_H, 6);
        ctx.fillStyle = "rgba(255,255,255,0.03)";
        ctx.fill();
      }

      // Komut adı
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 13px sans-serif";
      ctx.fillText(cmd.name, x + 18, cmdY + 14);

      // Açıklama (sağa hizalı, griler)
      ctx.fillStyle = "#72767d";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "right";
      const descClipped = cmd.desc.length > 28 ? cmd.desc.slice(0, 27) + "…" : cmd.desc;
      ctx.fillText(descClipped, x + COL_W - 12, cmdY + 14);
      ctx.textAlign = "left";
    }

    return catH + 12;
  }

  let leftY = HEADER_H + 10;
  const leftX = 20;
  for (const cat of leftCats) {
    leftY += drawCategory(cat, leftX, leftY);
  }

  let rightY = HEADER_H + 10;
  const rightX = 20 + COL_W + 20;
  for (const cat of rightCats) {
    rightY += drawCategory(cat, rightX, rightY);
  }

  // ── Footer ──────────────────────────────────────────────
  const footerY = H - FOOTER_H;
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(20, footerY);
  ctx.lineTo(W - 20, footerY);
  ctx.stroke();

  ctx.fillStyle = "#72767d";
  ctx.font = "13px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Seviye sistemi otomatiktir — her mesaj XP kazandırır  •  Moderasyon komutları için yetki gerekir", W / 2, footerY + 26);
  ctx.textAlign = "left";

  return canvas.toBuffer("image/png");
}
