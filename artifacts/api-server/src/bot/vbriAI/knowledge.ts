/**
 * VBRI AI — Komut Bilgi Tabanı
 * Botun tüm komutlarının açıklamaları, kullanımları ve örnekleri.
 */

export interface CommandInfo {
  names: string[];        // ana isim + alias'lar
  category: string;
  description: string;
  usage: string;
  example: string;
  permission?: string;
  note?: string;
}

export const COMMANDS: CommandInfo[] = [
  // ── SEVİYE / PROFİL ────────────────────────────────────────────────────────
  {
    names: ["level", "seviye", "rank", "profil", "profile", "lvl"],
    category: "Seviye",
    description: "Kendi veya başka birinin seviye kartını gösterir. XP, seviye ve sıralamayı güzel bir kart olarak sunar.",
    usage: "v!level [@kullanıcı]",
    example: "v!level veya v!level @ahmet",
    note: "Mesaj göndererek ve ses kanalında durarak XP kazanabilirsin.",
  },
  {
    names: ["leaderboard", "lb", "top", "lider", "sıralama"],
    category: "Seviye",
    description: "Sunucunun seviye lider tablosunu gösterir. En çok XP kazananlar listelenir.",
    usage: "v!lb",
    example: "v!lb",
  },
  {
    names: ["levelrol", "levelrole"],
    category: "Seviye",
    description: "Belirli bir seviyeye ulaşınca otomatik verilecek rolü ayarlar.",
    usage: "v!levelrol <seviye> @rol",
    example: "v!levelrol 10 @Veteran",
    permission: "Sunucu sahibi",
  },
  {
    names: ["levelsistemi", "leveltoggle", "levelaç", "levelkapat"],
    category: "Seviye",
    description: "Sunucuda seviye sistemini açar veya kapatır.",
    usage: "v!levelsistemi aç/kapat",
    example: "v!levelsistemi kapat",
    permission: "Sunucu sahibi",
  },
  // ── EKONOMİ ────────────────────────────────────────────────────────────────
  {
    names: ["bakiye", "balance", "para", "cüzdan"],
    category: "Ekonomi",
    description: "Vivincy coin bakiyeni gösterir. Daily streak ve luck bilgisi de görünür.",
    usage: "v!bakiye [@kullanıcı]",
    example: "v!bakiye veya v!bakiye @ahmet",
  },
  {
    names: ["gunlukodul", "daily", "günlükodül"],
    category: "Ekonomi",
    description: "Günlük ödülünü alırsın. Her gün alırsan streak bonusu kazanırsın!",
    usage: "v!daily",
    example: "v!daily",
    note: "Her 24 saatte bir kullanılabilir. Streak kırmadan devam et!",
  },
  {
    names: ["transfer", "gönder", "ver"],
    category: "Ekonomi",
    description: "Başka bir kullanıcıya Vivincy coin gönderir.",
    usage: "v!transfer @kullanıcı <miktar>",
    example: "v!transfer @ahmet 500",
  },
  {
    names: ["kumar", "slot"],
    category: "Ekonomi",
    description: "Slot makinesi oyunu. Belirttiğin miktarı bahse girersin.",
    usage: "v!kumar <miktar>",
    example: "v!kumar 100",
    note: "Kaybedebilirsin! Dikkatli ol.",
  },
  {
    names: ["rulet", "roulette"],
    category: "Ekonomi",
    description: "Rulet oyunu. Kırmızı/siyah veya belirli sayı üzerine bahis yapabilirsin.",
    usage: "v!rulet <kırmızı|siyah|sayı> <miktar>",
    example: "v!rulet kırmızı 200",
  },
  {
    names: ["coinflip", "cf", "yazı-tura"],
    category: "Ekonomi",
    description: "Yazı-tura oyunu. Tahminini yap, kazanırsan bahsini iki katına çıkarırsın.",
    usage: "v!coinflip <yazı|tura> <miktar>",
    example: "v!cf yazı 150",
  },
  {
    names: ["blackjack", "bj", "21"],
    category: "Ekonomi",
    description: "Blackjack kart oyunu. 21'e en yakın olan kazanır.",
    usage: "v!blackjack <miktar>",
    example: "v!bj 300",
    note: "Kartlarına göre 'çek' veya 'dur' seçeneği çıkar.",
  },
  {
    names: ["duel", "düello"],
    category: "Ekonomi",
    description: "Başka bir kullanıcıyla düello! Para bahse girilir, kazanan alır.",
    usage: "v!duel @kullanıcı <miktar>",
    example: "v!duel @mehmet 500",
  },
  {
    names: ["pray", "dua"],
    category: "Ekonomi",
    description: "Şans dilersin — bazen küçük bir coin ödülü düşer!",
    usage: "v!pray",
    example: "v!pray",
  },
  {
    names: ["ekono", "ekonomi", "econlevel", "elevel"],
    category: "Ekonomi",
    description: "Ekonomi seviyeni ve sıralamayı gösterir. Harcama/kazanma ile XP elde edilir.",
    usage: "v!ekono [@kullanıcı]",
    example: "v!ekono",
  },
  {
    names: ["ekonlider", "elb", "econlb"],
    category: "Ekonomi",
    description: "Ekonomi lider tablosunu gösterir. En zenginler listelenir.",
    usage: "v!ekonlider",
    example: "v!elb",
  },
  // ── MODERASYon ─────────────────────────────────────────────────────────────
  {
    names: ["ban", "yasakla"],
    category: "Moderasyon",
    description: "Bir kullanıcıyı sunucudan kalıcı olarak yasaklar.",
    usage: "v!ban @kullanıcı [sebep]",
    example: "v!ban @spammer Sürekli spam yapıyor",
    permission: "Ban yetkisi veya ilgili mod rolü",
    note: "Yetkili rolündeysen onay kanalına gider. Üst Yetkili direkt yürütür.",
  },
  {
    names: ["unban", "yasakkaldır", "yasak-kaldır"],
    category: "Moderasyon",
    description: "Yasaklı bir kullanıcının yasağını kaldırır.",
    usage: "v!unban <kullanıcı-id> [sebep]",
    example: "v!unban 123456789 Haksız ban",
    permission: "Ban yetkisi",
  },
  {
    names: ["kick", "at", "çıkar"],
    category: "Moderasyon",
    description: "Bir kullanıcıyı sunucudan atar (tekrar katılabilir).",
    usage: "v!kick @kullanıcı [sebep]",
    example: "v!kick @user Kurallara uymadı",
    permission: "Kick yetkisi veya ilgili mod rolü",
  },
  {
    names: ["warn", "uyar", "uyarı"],
    category: "Moderasyon",
    description: "Bir kullanıcıya görsel uyarı kartı gönderir. Kanala kart + DM'e de gider.",
    usage: "v!warn @kullanıcı [sebep]",
    example: "v!warn @noob Kuralsız davranış",
    permission: "Warn yetkisi",
    note: "Kullanıcı DM'ine de görsel kart gider. Uyarı sicilde kalır.",
  },
  {
    names: ["uyarikaldir", "uyarı-kaldır"],
    category: "Moderasyon",
    description: "Bir uyarıyı sicilden kaldırır.",
    usage: "v!uyarikaldir <uyarı-id>",
    example: "v!uyarikaldir 42",
    permission: "Warn yetkisi",
  },
  {
    names: ["timeout", "sustur", "sus"],
    category: "Moderasyon",
    description: "Kullanıcıyı belirtilen süre mesaj gönderemez hale getirir.",
    usage: "v!timeout @kullanıcı <süre> [sebep]",
    example: "v!timeout @user 10m spam",
    permission: "Timeout yetkisi",
    note: "Süre formatları: 30sn, 10m, 1sa, 2g. Maks: 28 gün.",
  },
  {
    names: ["untimeout", "unsustur", "sus-kaldır"],
    category: "Moderasyon",
    description: "Kullanıcının timeout'unu erkenden kaldırır.",
    usage: "v!untimeout @kullanıcı",
    example: "v!untimeout @user",
    permission: "Timeout yetkisi",
  },
  {
    names: ["kilitle", "kanal-kilitle"],
    category: "Moderasyon",
    description: "Mevcut kanalı kilitler, kimse mesaj gönderemez.",
    usage: "v!kilitle",
    example: "v!kilitle",
    permission: "Mute yetkisi",
  },
  {
    names: ["ac", "aç", "kanal-aç"],
    category: "Moderasyon",
    description: "Kilitli kanalı açar.",
    usage: "v!aç",
    example: "v!aç",
    permission: "Mute yetkisi",
  },
  {
    names: ["temizle", "clear", "sil"],
    category: "Moderasyon",
    description: "Kanaldan belirtilen sayıda mesajı siler (maks 100).",
    usage: "v!temizle <sayı>",
    example: "v!temizle 50",
    permission: "Temizle yetkisi",
  },
  {
    names: ["nuke", "nükleer"],
    category: "Moderasyon",
    description: "Kanalı tamamen siler ve aynı ayarlarla yeniden oluşturur. Tüm mesajlar gider.",
    usage: "v!nuke",
    example: "v!nuke",
    permission: "Sunucu sahibi veya Administrator",
    note: "GERİ ALINAMAZ! Kanal komple temizlenir.",
  },
  {
    names: ["sicil", "sicilkayıt"],
    category: "Moderasyon",
    description: "Bir kullanıcının moderasyon geçmişini gösterir. Ban, kick, warn, timeout kayıtları.",
    usage: "v!sicil [@kullanıcı]",
    example: "v!sicil @user",
  },
  // ── MOD KURULUM ────────────────────────────────────────────────────────────
  {
    names: ["modsetup", "modayar", "moderasyon"],
    category: "Mod Kurulum",
    description: "Moderasyon sistemini yapılandırır. Rol izinleri, log kanalı, kademeli yetki sistemi ayarlanır.",
    usage: "v!modsetup <alt-komut>",
    example: "v!modsetup aç | v!modsetup log #kanal | v!modsetup rol ban @Mod",
    permission: "Sunucu sahibi",
    note: "Alt komutlar: aç, kapat, durum, log, rol, rolkaldir, yetkili, üstyetkili, onaykanal",
  },
  // ── MÜZİK ──────────────────────────────────────────────────────────────────
  {
    names: ["çal", "cal", "play", "müzik"],
    category: "Müzik",
    description: "YouTube, SoundCloud veya doğrudan URL'den müzik çalar. Ses kanalında olman gerekir.",
    usage: "v!çal <şarkı adı veya URL>",
    example: "v!çal Duman - Seni Kendime Sakladım",
    note: "Ses kanalında olmalısın. Bot aynı kanala gelir.",
  },
  {
    names: ["dur", "pause"],
    category: "Müzik",
    description: "Müziği duraklatır.",
    usage: "v!dur",
    example: "v!dur",
  },
  {
    names: ["atla", "skip", "geç"],
    category: "Müzik",
    description: "Şu anki şarkıyı atlar, kuyruktaki sonraki şarkıya geçer.",
    usage: "v!atla",
    example: "v!atla",
  },
  {
    names: ["kuyruk", "queue", "liste"],
    category: "Müzik",
    description: "Müzik kuyruğunu gösterir.",
    usage: "v!kuyruk",
    example: "v!kuyruk",
  },
  {
    names: ["durdur", "stop", "leave", "ayrıl"],
    category: "Müzik",
    description: "Müziği durdurur ve botu ses kanalından çıkarır.",
    usage: "v!durdur",
    example: "v!durdur",
  },
  {
    names: ["şarkı", "sarki", "np", "nowplaying", "şuançalıyor"],
    category: "Müzik",
    description: "Şu an çalan şarkının adını ve bilgilerini gösterir.",
    usage: "v!np",
    example: "v!np",
  },
  // ── OYUNLAR ────────────────────────────────────────────────────────────────
  {
    names: ["rps", "tkm", "taş-kağıt-makas"],
    category: "Oyunlar",
    description: "Taş-kağıt-makas oyunu. Botla veya başka kullanıcıyla oynayabilirsin.",
    usage: "v!rps [taş|kağıt|makas] [@kullanıcı]",
    example: "v!rps taş",
  },
  {
    names: ["mine", "minesweeper", "mayin", "mayın"],
    category: "Oyunlar",
    description: "Mayın tarlası oyunu. Mayınlara basmadan tüm boş kareleri aç.",
    usage: "v!mine [kolay|normal|zor]",
    example: "v!mine normal",
  },
  {
    names: ["patla", "bomba"],
    category: "Oyunlar",
    description: "Patlama sürpriz komutu. Ne çıkacağı belli olmaz!",
    usage: "v!patla",
    example: "v!patla",
  },
  {
    names: ["zar", "dice", "zar-at"],
    category: "Oyunlar",
    description: "Zar atar. 1-6 arası random sayı üretir. İstersen birden fazla zar at.",
    usage: "v!zar [adet]",
    example: "v!zar 2",
  },
  {
    names: ["8top", "top8", "sihirli-top"],
    category: "Oyunlar",
    description: "Sihirli 8 top gibi soruyu yanıtlar. Evet/Hayır/Belki tarzı cevaplar.",
    usage: "v!8top <soru>",
    example: "v!8top Bugün şansım var mı?",
  },
  // ── YÖNETİM ────────────────────────────────────────────────────────────────
  {
    names: ["setprefix", "prefix", "önekdeğiştir"],
    category: "Yönetim",
    description: "Botun bu sunucudaki prefix'ini değiştirir.",
    usage: "v!setprefix <yeni-prefix>",
    example: "v!setprefix !",
    permission: "Sunucu sahibi",
  },
  {
    names: ["guard", "koruma", "güvenlik"],
    category: "Yönetim",
    description: "Sunucu koruma sistemini yapılandırır. Spam, link, emoji, bot koruması ayarlanır.",
    usage: "v!guard <ayar> <değer>",
    example: "v!guard spam açık | v!guard linkAction delete",
    permission: "Sunucu sahibi",
  },
  {
    names: ["stat", "istatistik", "stats"],
    category: "Yönetim",
    description: "Üye sayısı gibi istatistiklerin otomatik güncellenen kanal isimlerine yansıtılmasını sağlar.",
    usage: "v!stat <set|kaldir> <tür> <kanal>",
    example: "v!stat set members #üyeler",
    permission: "Sunucu sahibi",
  },
  {
    names: ["sunucukur", "sunucu-kur"],
    category: "Yönetim",
    description: "Sunucuya otomatik kanal/rol yapısı kurar.",
    usage: "v!sunucukur",
    example: "v!sunucukur",
    permission: "Sunucu sahibi",
  },
  {
    names: ["userinfo", "kullanicibilgi", "uinfo", "kimbu"],
    category: "Yönetim",
    description: "Bir kullanıcının Discord bilgilerini gösterir. Hesap tarihi, roller, durum vb.",
    usage: "v!userinfo [@kullanıcı]",
    example: "v!userinfo @user",
  },
  {
    names: ["ping", "gecikme"],
    category: "Yönetim",
    description: "Botun gecikme süresini ve API ping'ini gösterir.",
    usage: "v!ping",
    example: "v!ping",
  },
  {
    names: ["yardim", "yardım", "help", "komutlar"],
    category: "Yönetim",
    description: "Tüm komutların listesini ve kategorilerini gösterir.",
    usage: "v!yardim [kategori]",
    example: "v!yardim veya v!yardim müzik",
  },
  {
    names: ["bakım", "bakim", "bakimmod"],
    category: "Yönetim",
    description: "Komutları geçici olarak bakıma alır veya bakımdan çıkarır.",
    usage: "v!bakım <komut> [sebep] | v!bakım kaldır <komut>",
    example: "v!bakım müzik Güncelleme var",
    permission: "Bot sahibi",
  },
];

// ── Komut arama ────────────────────────────────────────────────────────────────

/** Basit benzerlik skoru — ortak karakter oranı */
function similarity(a: string, b: string): number {
  a = a.toLowerCase(); b = b.toLowerCase();
  if (a === b) return 1;
  if (b.includes(a) || a.includes(b)) return 0.8;
  let common = 0;
  for (const ch of a) if (b.includes(ch)) common++;
  return common / Math.max(a.length, b.length);
}

/** Sorgu ile en iyi eşleşen komutu döndürür */
export function findCommand(query: string): CommandInfo | null {
  const q = query.toLowerCase().trim();
  let best: CommandInfo | null = null;
  let bestScore = 0.4; // eşik

  for (const cmd of COMMANDS) {
    for (const name of cmd.names) {
      const s = similarity(q, name);
      if (s > bestScore) {
        bestScore = s;
        best = cmd;
      }
    }
    // Açıklama içinde arama
    if (cmd.description.toLowerCase().includes(q) && bestScore < 0.6) {
      bestScore = 0.6;
      best = cmd;
    }
  }
  return best;
}

/** Kategoriye göre komutları filtrele */
export function getCommandsByCategory(category: string): CommandInfo[] {
  const q = category.toLowerCase();
  return COMMANDS.filter((c) => c.category.toLowerCase().includes(q));
}

/** Tüm kategorileri listele */
export function getAllCategories(): string[] {
  return [...new Set(COMMANDS.map((c) => c.category))];
}

/** Komut bilgisini güzel metin olarak formatla */
export function formatCommand(cmd: CommandInfo): string {
  const lines = [
    `**${cmd.names[0]}** — ${cmd.description}`,
    `📌 **Kullanım:** \`${cmd.usage}\``,
    `💡 **Örnek:** \`${cmd.example}\``,
  ];
  if (cmd.permission) lines.push(`🔒 **Yetki:** ${cmd.permission}`);
  if (cmd.note)       lines.push(`📝 **Not:** ${cmd.note}`);
  if (cmd.names.length > 1) lines.push(`🔤 **Alternatifler:** ${cmd.names.slice(1).map((n) => `\`${n}\``).join(", ")}`);
  return lines.join("\n");
}
