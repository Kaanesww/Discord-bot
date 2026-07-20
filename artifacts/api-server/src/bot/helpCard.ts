import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { existsSync } from "node:fs";

// Sistem fontu kaydet — dikdörtgen glyph sorununu çözer
const FONT_PATHS: { path: string; bold?: string }[] = [
  {
    path: "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    bold: "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  },
];
let FONT_FAMILY = "sans-serif";
for (const f of FONT_PATHS) {
  if (existsSync(f.path)) {
    GlobalFonts.registerFromPath(f.path);
    if (f.bold && existsSync(f.bold)) GlobalFonts.registerFromPath(f.bold);
    FONT_FAMILY = "DejaVu Sans";
    break;
  }
}

// ── Yardım kartı kategorileri ──────────────────────────────────────────────────

export interface CmdEntry { name: string; desc: string; }
export interface HelpCategory {
  key: string;
  label: string;
  icon: string;
  color: string;
  gradient: [string, string];
  commands: CmdEntry[];
}

export const HELP_CATEGORIES: HelpCategory[] = [
  {
    key: "moderasyon", label: "Moderasyon", icon: "🛡️",
    color: "#ed4245", gradient: ["#ed424533", "#ed424511"],
    commands: [
      { name: "ban @kişi [sebep]",       desc: "Kullanıcıyı yasaklar" },
      { name: "kick @kişi [sebep]",      desc: "Kullanıcıyı atar" },
      { name: "warn @kişi [sebep]",      desc: "Uyarı verir ve DM gönderir" },
      { name: "timeout @kişi 10m [seb]", desc: "Susturur: 10m / 1sa / 1g" },
      { name: "untimeout @kişi",         desc: "Susturmayı kaldırır" },
      { name: "unban <userID> [sebep]",  desc: "Yasağı kaldırır" },
      { name: "uyarikaldir <warnID>",    desc: "Uyarıyı sicitten siler" },
      { name: "kilitle [#kanal]",        desc: "Kanalı mesaja kilitler" },
      { name: "ac [#kanal]",             desc: "Kanal kilidini açar" },
      { name: "temizle [adet]",          desc: "Toplu mesaj siler (maks 100)" },
      { name: "nuke",                    desc: "Kanalı temizler & yeniden açar" },
      { name: "sicil @kişi",             desc: "Sicil kayıt kartı" },
    ],
  },
  {
    key: "seviye", label: "Seviye", icon: "⭐",
    color: "#5865f2", gradient: ["#5865f233", "#5865f211"],
    commands: [
      { name: "level [@kişi]",           desc: "Seviye ve profil kartı" },
      { name: "lb",                      desc: "Sunucu liderboard kartı" },
      { name: "levelrol ekle <lvl> @rol",desc: "Seviye rol ödülü ekler" },
      { name: "levelrol liste",          desc: "Tüm rol ödüllerini listeler" },
      { name: "levelrol kaldir <lvl>",   desc: "Rol ödülünü kaldırır" },
    ],
  },
  {
    key: "ekonomi", label: "Ekonomi", icon: "💰",
    color: "#ffd700", gradient: ["#ffd70033", "#ffd70011"],
    commands: [
      { name: "daily",                    desc: "Claim daily vivincy reward" },
      { name: "balance [@kişi]",         desc: "Check vivincy balance" },
      { name: "transfer @kişi <miktar>", desc: "Coin gönderir" },
      { name: "kumar <bahis>",           desc: "🎰 Slot makinesi (min 10)" },
      { name: "rulet <seçim> <bahis>",   desc: "Rulet: kırmızı/siyah/0-36" },
      { name: "coinflip <taş/yazı> <b>", desc: "Yazı-tura" },
      { name: "blackjack <bahis>",       desc: "Krupiye veya 1v1 blackjack" },
      { name: "duel @kişi <bahis>",      desc: "1v1 yazı-tura düellosu" },
      { name: "pray",                    desc: "🍀 2dk şans artışı (4dk cd)" },
    ],
  },
  {
    key: "oyunlar", label: "Oyunlar", icon: "🎮",
    color: "#eb459e", gradient: ["#eb459e33", "#eb459e11"],
    commands: [
      { name: "rps @kişi [bahis]",       desc: "Taş-kağıt-makas" },
      { name: "patla [@kişi]",           desc: "Patlat! (eğlence)" },
      { name: "zar [adet]",              desc: "Zar at (1-5 adet)" },
      { name: "8top <soru>",             desc: "Sihirli 8 top" },
    ],
  },
  {
    key: "muzik", label: "Müzik", icon: "🎵",
    color: "#1db954", gradient: ["#1db95433", "#1db95411"],
    commands: [
      { name: "çal <URL veya arama>",    desc: "Şarkı çal / kuyruğa ekle" },
      { name: "dur",                     desc: "Duraklat / devam et" },
      { name: "atla",                    desc: "Mevcut şarkıyı atla" },
      { name: "kuyruk",                  desc: "Müzik kuyruğunu göster" },
      { name: "şarkı",                   desc: "Şu an çalan şarkıyı göster" },
      { name: "durdur",                  desc: "Durdur ve kanaldan çık" },
    ],
  },
  {
    key: "yonetim", label: "Yönetim", icon: "⚙️",
    color: "#57f287", gradient: ["#57f28733", "#57f28711"],
    commands: [
      { name: "setprefix <yeni>",        desc: "Sunucu prefix'ini değiştirir" },
      { name: "sunucukur",               desc: "Tüm kanalları oluşturur" },
      { name: "sunucukopyala <ID>",      desc: "Başka sunucuyu kopyalar" },
      { name: "userinfo [@kişi]",        desc: "Kullanıcı bilgileri" },
      { name: "ping",                    desc: "Bot gecikme ölçümü" },
      { name: "yardim [kategori]",       desc: "Komut rehberi" },
    ],
  },
];

// ── Yardımcı çizim fonksiyonları ──────────────────────────────────────────────

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

function drawBg(ctx: any, W: number, H: number): void {
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#07070f");
  bg.addColorStop(0.5, "#0d0d28");
  bg.addColorStop(1, "#070712");
  roundRect(ctx, 0, 0, W, H, 22);
  ctx.fillStyle = bg;
  ctx.fill();

  // Ambient glow
  const g1 = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, 300);
  g1.addColorStop(0, "rgba(88,101,242,0.18)");
  g1.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, W, H);

  const g2 = ctx.createRadialGradient(0, H, 0, 0, H, 220);
  g2.addColorStop(0, "rgba(235,69,158,0.10)");
  g2.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, W, H);

  // Border
  const bord = ctx.createLinearGradient(0, 0, W, H);
  bord.addColorStop(0, "#5865f2");
  bord.addColorStop(0.5, "#eb459e");
  bord.addColorStop(1, "#5865f2");
  roundRect(ctx, 0, 0, W, H, 22);
  ctx.strokeStyle = bord;
  ctx.lineWidth = 2.5;
  ctx.stroke();
}

function drawHeader(ctx: any, W: number, title: string, sub: string, HEADER_H: number): void {
  const tg = ctx.createLinearGradient(0, 0, W, 0);
  tg.addColorStop(0, "#5865f2");
  tg.addColorStop(0.5, "#ffffff");
  tg.addColorStop(1, "#eb459e");
  ctx.fillStyle = tg;
  ctx.font = `bold 32px '${FONT_FAMILY}'`;
  ctx.textAlign = "center";
  ctx.fillText(title, W / 2, 50);

  ctx.fillStyle = "#72767d";
  ctx.font = `13px '${FONT_FAMILY}'`;
  ctx.fillText(sub, W / 2, 76);
  ctx.textAlign = "left";

  const lg = ctx.createLinearGradient(20, 0, W - 20, 0);
  lg.addColorStop(0, "rgba(88,101,242,0)");
  lg.addColorStop(0.3, "#5865f2");
  lg.addColorStop(0.7, "#eb459e");
  lg.addColorStop(1, "rgba(235,69,158,0)");
  ctx.strokeStyle = lg;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(20, HEADER_H - 8);
  ctx.lineTo(W - 20, HEADER_H - 8);
  ctx.stroke();
}

// ── Genel yardım kartı (tüm kategoriler) ─────────────────────────────────────

export async function generateHelpCard(prefix: string): Promise<Buffer> {
  const W = 980;
  const HEADER_H = 96;
  const FOOTER_H = 48;
  const PAD = 20;
  const COLS = 2;
  const CAT_W = (W - PAD * 2 - 16) / COLS;
  const CAT_H = 170;
  const ROWS = Math.ceil(HELP_CATEGORIES.length / COLS);
  const H = HEADER_H + ROWS * (CAT_H + 12) + FOOTER_H + 16;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d") as any;

  drawBg(ctx, W, H);
  drawHeader(ctx, W, "📖  BOT KOMUT REHBERİ",
    `Prefix: ${prefix}komut  •  Toplam ${HELP_CATEGORIES.reduce((s, c) => s + c.commands.length, 0)} komut  •  ${prefix}yardim <kategori> için detay`,
    HEADER_H);

  HELP_CATEGORIES.forEach((cat, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = PAD + col * (CAT_W + 16);
    const y = HEADER_H + 8 + row * (CAT_H + 12);

    // Card bg
    roundRect(ctx, x, y, CAT_W, CAT_H, 14);
    ctx.fillStyle = "rgba(255,255,255,0.03)";
    ctx.fill();

    // Accent left bar
    roundRect(ctx, x, y, 4, CAT_H, 2);
    ctx.fillStyle = cat.color;
    ctx.fill();

    // Header bg
    roundRect(ctx, x + 4, y, CAT_W - 4, 46, 12);
    ctx.fillStyle = cat.gradient[0];
    ctx.fill();

    // Icon + label
    ctx.fillStyle = cat.color;
    ctx.font = `bold 16px '${FONT_FAMILY}'`;
    ctx.textAlign = "left";
    ctx.fillText(`${cat.icon}  ${cat.label}`, x + 16, y + 30);

    // Command count badge
    const badge = `${cat.commands.length} komut`;
    const bW = ctx.measureText(badge).width + 18;
    roundRect(ctx, x + CAT_W - bW - 12, y + 12, bW, 22, 8);
    ctx.fillStyle = cat.color + "33";
    ctx.fill();
    ctx.fillStyle = cat.color;
    ctx.font = `11px '${FONT_FAMILY}'`;
    ctx.textAlign = "right";
    ctx.fillText(badge, x + CAT_W - 20, y + 27);
    ctx.textAlign = "left";

    // Preview commands (show up to 4)
    const preview = cat.commands.slice(0, 4);
    preview.forEach((cmd, ci) => {
      const cy = y + 56 + ci * 26;
      if (ci % 2 === 0) {
        roundRect(ctx, x + 8, cy - 3, CAT_W - 16, 24, 5);
        ctx.fillStyle = "rgba(255,255,255,0.03)";
        ctx.fill();
      }
      ctx.fillStyle = "#c8ceff";
      ctx.font = `bold 11px '${FONT_FAMILY}'`;
      const nameStr = `${prefix}${cmd.name}`;
      const maxName = nameStr.length > 28 ? nameStr.slice(0, 27) + "…" : nameStr;
      ctx.fillText(maxName, x + 16, cy + 12);

      ctx.fillStyle = "#72767d";
      ctx.font = `10px '${FONT_FAMILY}'`;
      ctx.textAlign = "right";
      const descStr = cmd.desc.length > 30 ? cmd.desc.slice(0, 29) + "…" : cmd.desc;
      ctx.fillText(descStr, x + CAT_W - 10, cy + 12);
      ctx.textAlign = "left";
    });

    if (cat.commands.length > 4) {
      ctx.fillStyle = cat.color + "aa";
      ctx.font = `10px '${FONT_FAMILY}'`;
      ctx.textAlign = "right";
      ctx.fillText(`+${cat.commands.length - 4} daha → ${prefix}yardim ${cat.key}`, x + CAT_W - 10, y + CAT_H - 10);
      ctx.textAlign = "left";
    }
  });

  // Footer
  const fy = H - FOOTER_H;
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(20, fy);
  ctx.lineTo(W - 20, fy);
  ctx.stroke();

  ctx.fillStyle = "#72767d";
  ctx.font = `12px '${FONT_FAMILY}'`;
  ctx.textAlign = "center";
  ctx.fillText("💡 Bakiye tüm sunucularda ortaktır  •  Ses kanalında dakikada XP  •  Seviye atladıkça kart teması değişir  •  🍀 pray ile şansını artır!", W / 2, fy + 22);
  ctx.fillText(`VBRI Bot  •  ${prefix}yardim <moderasyon|seviye|ekonomi|oyunlar|muzik|yonetim>`, W / 2, fy + 38);
  ctx.textAlign = "left";

  return canvas.toBuffer("image/png");
}

// ── Kategori detay kartı ──────────────────────────────────────────────────────

export async function generateCategoryHelpCard(prefix: string, catKey: string): Promise<Buffer | null> {
  const cat = HELP_CATEGORIES.find(
    (c) => c.key === catKey || c.label.toLowerCase() === catKey.toLowerCase()
  );
  if (!cat) return null;

  const W = 800;
  const CMD_H = 30;
  const PAD = 16;
  const CAT_HEAD = 52;
  const HEADER_H = 96;
  const FOOTER_H = 44;
  const bodyH = CAT_HEAD + cat.commands.length * CMD_H + PAD * 2 + 8;
  const H = HEADER_H + bodyH + FOOTER_H + 16;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d") as any;

  drawBg(ctx, W, H);

  // Color glow for this category
  const gCat = ctx.createRadialGradient(W, 0, 0, W, 0, 300);
  gCat.addColorStop(0, cat.color + "22");
  gCat.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gCat;
  ctx.fillRect(0, 0, W, H);

  drawHeader(ctx, W, `${cat.icon}  ${cat.label} Komutları`,
    `${prefix}yardim  •  ${cat.commands.length} komut  •  Prefix: ${prefix}`,
    HEADER_H);

  // Category card
  const cx = PAD;
  const cy = HEADER_H + 8;
  const CW = W - PAD * 2;
  const CH = bodyH;

  roundRect(ctx, cx, cy, CW, CH, 14);
  ctx.fillStyle = "rgba(255,255,255,0.03)";
  ctx.fill();

  // Left accent bar
  roundRect(ctx, cx, cy, 5, CH, 3);
  ctx.fillStyle = cat.color;
  ctx.fill();

  // Category header
  roundRect(ctx, cx + 5, cy, CW - 5, CAT_HEAD, 12);
  const hg = ctx.createLinearGradient(cx, cy, cx + CW, cy + CAT_HEAD);
  hg.addColorStop(0, cat.color + "44");
  hg.addColorStop(1, cat.color + "11");
  ctx.fillStyle = hg;
  ctx.fill();

  ctx.fillStyle = cat.color;
  ctx.font = `bold 18px '${FONT_FAMILY}'`;
  ctx.textAlign = "left";
  ctx.fillText(`${cat.icon}  ${cat.label}`, cx + 18, cy + 34);

  // Komut sayısı
  ctx.fillStyle = cat.color + "cc";
  ctx.font = `13px '${FONT_FAMILY}'`;
  ctx.textAlign = "right";
  ctx.fillText(`${cat.commands.length} komut`, cx + CW - 16, cy + 34);
  ctx.textAlign = "left";

  // Commands list
  cat.commands.forEach((cmd, i) => {
    const ry = cy + CAT_HEAD + i * CMD_H + PAD;

    if (i % 2 === 0) {
      roundRect(ctx, cx + 8, ry - 4, CW - 16, CMD_H, 6);
      ctx.fillStyle = "rgba(255,255,255,0.04)";
      ctx.fill();
    }

    // Command name
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold 13px '${FONT_FAMILY}'`;
    ctx.fillText(`${prefix}${cmd.name}`, cx + 18, ry + 14);

    // Arrow
    ctx.fillStyle = cat.color + "88";
    ctx.font = `11px '${FONT_FAMILY}'`;
    const nameW = ctx.measureText(`${prefix}${cmd.name}`).width;
    ctx.fillText("→", cx + 22 + nameW, ry + 14);

    // Description
    ctx.fillStyle = "#a3a6b4";
    ctx.font = `12px '${FONT_FAMILY}'`;
    ctx.textAlign = "right";
    ctx.fillText(cmd.desc, cx + CW - 14, ry + 14);
    ctx.textAlign = "left";
  });

  // Footer
  const fy = H - FOOTER_H;
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(20, fy);
  ctx.lineTo(W - 20, fy);
  ctx.stroke();

  ctx.fillStyle = "#72767d";
  ctx.font = `12px '${FONT_FAMILY}'`;
  ctx.textAlign = "center";
  const allKeys = HELP_CATEGORIES.map(c => c.key).join(" | ");
  ctx.fillText(`${prefix}yardim <${allKeys}>`, W / 2, fy + 18);
  ctx.fillText("VBRI Bot  •  Tüm komutlar prefix tabanlıdır", W / 2, fy + 34);
  ctx.textAlign = "left";

  return canvas.toBuffer("image/png");
}
