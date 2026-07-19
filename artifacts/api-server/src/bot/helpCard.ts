import { createCanvas } from "@napi-rs/canvas";

function roundRect(ctx: any, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath();
}

interface CmdEntry { name: string; desc: string; }
interface Category { label: string; icon: string; color: string; commands: CmdEntry[]; }

export async function generateHelpCard(prefix: string): Promise<Buffer> {
  const categories: Category[] = [
    {
      label: "Moderasyon", icon: "🛡️", color: "#ed4245",
      commands: [
        { name: `/ban`,          desc: "Yasaklar (onaylı)" },
        { name: `/kick`,         desc: "Atar (onaylı)" },
        { name: `/warn`,         desc: "Uyarı + DM" },
        { name: `/timeout`,      desc: "Susturur" },
        { name: `/untimeout`,    desc: "Susturmayı kaldırır" },
        { name: `/unban`,        desc: "Yasağı kaldırır" },
        { name: `/uyarikaldir`,  desc: "Uyarı siler" },
        { name: `/kilitle`,      desc: "Kanalı kilitler" },
        { name: `/ac`,           desc: "Kilidi açar" },
        { name: `/temizle`,      desc: "Toplu mesaj siler" },
        { name: `/nuke`,         desc: "Kanalı nuke eder" },
        { name: `/sicil`,        desc: "Sicil kayıt kartı" },
        { name: `/kullanicibilgi`, desc: "Kullanıcı bilgisi" },
      ],
    },
    {
      label: "Level Sistemi", icon: "⭐", color: "#5865f2",
      commands: [
        { name: `${prefix}level`,       desc: "Seviye kartı" },
        { name: `${prefix}lb`,          desc: "Liderboard görseli" },
        { name: `/profil`,              desc: "Profil kartı" },
        { name: `/leaderboard`,         desc: "Liderboard (slash)" },
        { name: `/levelrol ekle`,       desc: "Seviye rol ödülü" },
        { name: `/levelrol liste`,      desc: "Rol ödüllerini listeler" },
        { name: `/levelrol kaldir`,     desc: "Rol ödülünü siler" },
      ],
    },
    {
      label: "Ekonomi 💰", icon: "💳", color: "#ffd700",
      commands: [
        { name: `/gunlukodul`,   desc: "Günlük coin al (global)" },
        { name: `/bakiye`,       desc: "Coin bakiyesi (global)" },
        { name: `/transfer`,     desc: "Coin gönder" },
        { name: `/kumar`,        desc: "Slot makinesi" },
        { name: `/duel @kişi`,  desc: "1v1 yazı-tura düellosu" },
        { name: `/rulet`,        desc: "Kırmızı/siyah/sayı" },
      ],
    },
    {
      label: "Oyunlar 🎮", icon: "🎲", color: "#eb459e",
      commands: [
        { name: `/coinflip`,       desc: "OWO tarzı coin düşürme" },
        { name: `/blackjack`,      desc: "Solo veya 1v1 blackjack" },
        { name: `/rps @kişi`,      desc: "TKM (bahisli opsiyonel)" },
        { name: `/patla [@hedef]`, desc: "Patlat! (eğlence)" },
        { name: `/zar [adet]`,     desc: "Zar at" },
        { name: `/8top <soru>`,    desc: "Sihirli 8 top" },
      ],
    },
    {
      label: "Sunucu Yönetimi", icon: "⚙️", color: "#57f287",
      commands: [
        { name: `${prefix}setprefix`, desc: "Prefix değiştir" },
        { name: `/sunucukur`,         desc: "Tüm kanalları oluştur" },
        { name: `/sunucukopyala`,     desc: "Sunucu kopyala (ID)" },
        { name: `/setprefix`,         desc: "Prefix değiştir (slash)" },
        { name: `/ping`,              desc: "Bot gecikmesi" },
        { name: `${prefix}yardim`,   desc: "Bu yardım kartı" },
      ],
    },
  ];

  const W = 940;
  const CMD_H = 26;
  const CAT_HEAD = 36;
  const PAD = 12;
  const COLS = 2;
  const COL_W = (W - 56) / COLS;

  // Kategorileri iki sütuna böl (dengeli)
  const totalCmds = categories.reduce((s, c) => s + c.commands.length, 0);
  const half = Math.ceil(totalCmds / 2);
  let leftCmds = 0;
  let splitIdx = 0;
  for (let i = 0; i < categories.length; i++) {
    if (leftCmds + categories[i]!.commands.length > half && leftCmds > 0) { splitIdx = i; break; }
    leftCmds += categories[i]!.commands.length;
    splitIdx = i + 1;
  }
  const colCats = [categories.slice(0, splitIdx), categories.slice(splitIdx)];

  function colH(cats: Category[]) {
    return cats.reduce((s, c) => s + CAT_HEAD + c.commands.length * CMD_H + PAD * 2 + 10, 0);
  }

  const HEADER_H = 92;
  const FOOTER_H = 44;
  const bodyH = Math.max(colH(colCats[0]!), colH(colCats[1]!));
  const H = HEADER_H + bodyH + FOOTER_H + 20;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d") as any;

  // Arka plan
  const bg = ctx.createLinearGradient(0,0,W,H);
  bg.addColorStop(0,"#07070f"); bg.addColorStop(0.5,"#0d0d28"); bg.addColorStop(1,"#070712");
  roundRect(ctx,0,0,W,H,20); ctx.fillStyle=bg; ctx.fill();

  // Glow efektleri
  const g1 = ctx.createRadialGradient(W/2,0,0,W/2,0,280);
  g1.addColorStop(0,"rgba(88,101,242,0.22)"); g1.addColorStop(1,"rgba(0,0,0,0)");
  ctx.fillStyle=g1; ctx.fillRect(0,0,W,H);
  const g2 = ctx.createRadialGradient(0,H,0,0,H,200);
  g2.addColorStop(0,"rgba(235,69,158,0.12)"); g2.addColorStop(1,"rgba(0,0,0,0)");
  ctx.fillStyle=g2; ctx.fillRect(0,0,W,H);

  // Kenarlık
  const bord = ctx.createLinearGradient(0,0,W,H);
  bord.addColorStop(0,"#5865f2"); bord.addColorStop(0.5,"#eb459e"); bord.addColorStop(1,"#5865f2");
  roundRect(ctx,0,0,W,H,20); ctx.strokeStyle=bord; ctx.lineWidth=2.5; ctx.stroke();

  // Başlık
  const tg = ctx.createLinearGradient(0,0,W,0);
  tg.addColorStop(0,"#5865f2"); tg.addColorStop(0.5,"#ffffff"); tg.addColorStop(1,"#eb459e");
  ctx.fillStyle=tg; ctx.font="bold 34px sans-serif"; ctx.textAlign="center";
  ctx.fillText("📖  BOT KOMUT REHBERİ", W/2, 48);
  ctx.fillStyle="#72767d"; ctx.font="14px sans-serif";
  ctx.fillText(`Prefix: ${prefix}komut  •  /slash komut  •  Ekonomi tüm sunucularda global`, W/2, 76);
  ctx.textAlign="left";

  // Başlık çizgisi
  const lg = ctx.createLinearGradient(20,0,W-20,0);
  lg.addColorStop(0,"rgba(88,101,242,0)"); lg.addColorStop(0.3,"#5865f2"); lg.addColorStop(0.7,"#eb459e"); lg.addColorStop(1,"rgba(235,69,158,0)");
  ctx.strokeStyle=lg; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.moveTo(20,HEADER_H-8); ctx.lineTo(W-20,HEADER_H-8); ctx.stroke();

  function drawCategory(cat: Category, x: number, y: number): number {
    const catH = CAT_HEAD + cat.commands.length * CMD_H + PAD*2;
    roundRect(ctx,x,y,COL_W,catH,12); ctx.fillStyle="rgba(255,255,255,0.03)"; ctx.fill();
    roundRect(ctx,x,y,4,catH,2); ctx.fillStyle=cat.color; ctx.fill();
    roundRect(ctx,x,y,COL_W,CAT_HEAD,12); ctx.fillStyle=cat.color+"22"; ctx.fill();
    ctx.fillStyle=cat.color; ctx.font="bold 14px sans-serif";
    ctx.fillText(`${cat.icon}  ${cat.label}`, x+14, y+24);
    const cntW = ctx.measureText(`${cat.commands.length} komut`).width+16;
    roundRect(ctx,x+COL_W-cntW-10,y+8,cntW,20,8); ctx.fillStyle=cat.color+"33"; ctx.fill();
    ctx.fillStyle=cat.color; ctx.font="11px sans-serif"; ctx.textAlign="right";
    ctx.fillText(`${cat.commands.length} komut`, x+COL_W-18, y+22); ctx.textAlign="left";
    for (let i=0;i<cat.commands.length;i++) {
      const cmd=cat.commands[i]!;
      const ry=y+CAT_HEAD+i*CMD_H+PAD;
      if(i%2===0){roundRect(ctx,x+6,ry-3,COL_W-12,CMD_H,5); ctx.fillStyle="rgba(255,255,255,0.03)"; ctx.fill();}
      ctx.fillStyle="#ffffff"; ctx.font="bold 12px sans-serif"; ctx.fillText(cmd.name, x+16, ry+12);
      ctx.fillStyle="#72767d"; ctx.font="11px sans-serif"; ctx.textAlign="right";
      const d=cmd.desc.length>28?cmd.desc.slice(0,27)+"…":cmd.desc;
      ctx.fillText(d, x+COL_W-10, ry+12); ctx.textAlign="left";
    }
    return catH+10;
  }

  let ly=HEADER_H+8, ry=HEADER_H+8;
  for(const cat of colCats[0]!) ly+=drawCategory(cat, 20, ly);
  for(const cat of colCats[1]!) ry+=drawCategory(cat, 20+COL_W+16, ry);

  // Footer
  const fy=H-FOOTER_H;
  ctx.strokeStyle="rgba(255,255,255,0.06)"; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(20,fy); ctx.lineTo(W-20,fy); ctx.stroke();
  ctx.fillStyle="#72767d"; ctx.font="12px sans-serif"; ctx.textAlign="center";
  ctx.fillText("💡 Bakiye tüm sunucularda ortaktır  •  Ses kanalında dakikada XP  •  Seviye atladıkça kart teması değişir", W/2, fy+22);
  ctx.fillText(`Toplam ${categories.reduce((s,c)=>s+c.commands.length,0)} komut`, W/2, fy+38);
  ctx.textAlign="left";

  return canvas.toBuffer("image/png");
}
