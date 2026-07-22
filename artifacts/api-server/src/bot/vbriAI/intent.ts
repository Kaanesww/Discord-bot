/**
 * VBRI AI — Intent Tespiti
 * Kullanıcı mesajından niyet çıkarır.
 */

export type Intent =
  | "GREETING"
  | "FAREWELL"
  | "THANKS"
  | "SELF_QUESTION"
  | "CAPABILITY_QUESTION"
  | "COMMAND_HELP"
  | "COMMAND_RUN"
  | "COMPLIMENT"
  | "INSULT"
  | "MATH"
  | "JOKE_REQUEST"
  | "SERVER_QUESTION"
  | "CASUAL";

interface IntentRule {
  intent: Intent;
  keywords: string[];
  weight?: number;
}

const RULES: IntentRule[] = [
  // Karşılama
  {
    intent: "GREETING",
    keywords: ["selam", "merhaba", "hey", "hi", "hello", "naber", "napıyorsun", "nasılsın", "hayırdır", "slm", "mrb", "yo ", "oi "],
  },
  // Veda
  {
    intent: "FAREWELL",
    keywords: ["görüşürüz", "hoşça kal", "bye", "güle güle", "çao", "ciao", "bb", "g2g", "gidiyorum", "bb kanka"],
  },
  // Teşekkür
  {
    intent: "THANKS",
    keywords: ["teşekkür", "teşekkürler", "sağol", "sağ ol", "eyw", "ty", "thanks", "mersi", "tşk"],
  },
  // Kim olduğunu soruyor
  {
    intent: "SELF_QUESTION",
    keywords: ["sen kimsin", "kimsin", "adın ne", "ismin ne", "ne tür bot", "nasıl bir bot", "seni kim yaptı", "kim yazdı seni"],
    weight: 2,
  },
  // Ne yapabileceğini soruyor
  {
    intent: "CAPABILITY_QUESTION",
    keywords: ["ne yapabilirsin", "neler yaparsın", "ne yapıyorsun", "yeteneklerin", "komutların neler", "ne işe yararsın", "hangi komutlar"],
    weight: 2,
  },
  // Komut hakkında yardım
  {
    intent: "COMMAND_HELP",
    keywords: [
      "nasıl kullanılır", "ne işe yarıyor", "ne yapar", "ne demek", "nasıl çalışır",
      "komut nedir", "anlat", "hakkında bilgi", "yardım et", "açıkla",
    ],
    weight: 1.5,
  },
  // Komut çalıştırma isteği
  {
    intent: "COMMAND_RUN",
    keywords: [
      "ban at", "yasakla", "kick et", "at çıkar", "uyar ", "warn et", "sustur ", "timeout at",
      "mesajları sil", "temizle ", "kilitle ", "nuke yap", "müzik çal", "şarkı çal",
      "prefix değiştir", "sil mesajları", "kanalı kilitle", "kanalı aç",
    ],
    weight: 2,
  },
  // İltifat
  {
    intent: "COMPLIMENT",
    keywords: [
      "iyisin", "harikasın", "süpersin", "mükemmelsin", "çok iyisin", "seni seviyorum",
      "çok başarılısın", "güzelsin", "çok iyi", "amazing", "great job", "aferin",
    ],
  },
  // Hakaret
  {
    intent: "INSULT",
    keywords: [
      "kötüsün", "berbatsın", "salaksın", "aptal", "işe yaramazsın",
      "saçmasın", "boktan", "rezaletsin", "olmadın", "beceremiyorsun",
    ],
  },
  // Matematik
  {
    intent: "MATH",
    keywords: [
      "kaç eder", "hesapla", "toplam", "çarp", "böl", "çıkar",
      "karekök", "üssü", "% kaç", "yüzde", "hesabı ne",
    ],
  },
  // Espri isteği
  {
    intent: "JOKE_REQUEST",
    keywords: [
      "espri yap", "fıkra anlat", "şaka yap", "güldür", "komik bir şey söyle",
      "joke", "fıkra", "beni güldür", "bir espri yap",
    ],
    weight: 2,
  },
  // Sunucu sorusu
  {
    intent: "SERVER_QUESTION",
    keywords: ["bu sunucu", "vivincy nedir", "vivincy ne", "sunucu hakkında", "burası ne", "bu ne"],
  },
];

// Matematiksel ifade var mı kontrolü
const MATH_EXPR = /\d+\s*[\+\-\*\/\^%]\s*\d+/;

export function detectIntent(text: string): { intent: Intent; score: number; matched: string } {
  const lower = text.toLowerCase();
  let bestIntent: Intent = "CASUAL";
  let bestScore = 0;
  let bestMatch = "";

  for (const rule of RULES) {
    let score = 0;
    let matched = "";
    const w = rule.weight ?? 1;
    for (const kw of rule.keywords) {
      if (lower.includes(kw)) {
        score += w;
        if (!matched) matched = kw;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestIntent = rule.intent;
      bestMatch = matched;
    }
  }

  // Matematiksel ifade var mı?
  if (MATH_EXPR.test(lower) && bestScore < 2) {
    return { intent: "MATH", score: 2, matched: "math_expr" };
  }

  return { intent: bestIntent, score: bestScore, matched: bestMatch };
}

// ── Komut tetikleyici tespiti ────────────────────────────────────────────────

export interface CommandTrigger {
  tool: string;
  params: Record<string, unknown>;
}

/** Metinden çalıştırılabilecek aracı ve parametreleri çıkarır */
export function extractCommandTrigger(text: string): CommandTrigger | null {
  const lower = text.toLowerCase();

  // Mention regex
  const userMention = text.match(/<@!?(\d+)>|@(\w+)/)?.[1] ?? text.match(/<@!?(\d+)>|@(\w+)/)?.[2];
  const channelMention = text.match(/<#(\d+)>/)?.[1];
  const digits = text.match(/\b(\d{15,20})\b/)?.[1];
  const targetId = userMention ?? digits;

  const reasonMatch = text.match(/(?:sebep|çünkü|reason)[:\s]+(.+)/i);
  const reason = reasonMatch?.[1]?.trim() ?? "Sebep belirtilmedi";

  // ban
  if (/ban\s*at|yasakla|\bbanla\b/.test(lower)) {
    if (!targetId) return null;
    return { tool: "ban", params: { userId: targetId, reason } };
  }
  // kick
  if (/kick\s*et|at\s*çıkar|\bkicklE\b/.test(lower)) {
    if (!targetId) return null;
    return { tool: "kick", params: { userId: targetId, reason } };
  }
  // warn
  if (/uyar\s|warn\s*et|\bwarnla\b/.test(lower)) {
    if (!targetId) return null;
    return { tool: "warn", params: { userId: targetId, reason } };
  }
  // timeout / sustur
  if (/sustur|timeout\s*at|zaman\s*aşımı/.test(lower)) {
    if (!targetId) return null;
    const durationMatch = text.match(/(\d+\s*(?:sn|m|sa|g|h|d))/i);
    const duration = durationMatch?.[1]?.replace(/\s/, "") ?? "10m";
    return { tool: "timeout", params: { userId: targetId, duration, reason } };
  }
  // temizle
  if (/mesajları\s*sil|temizle|kanalı\s*temizle|clear/.test(lower)) {
    const countMatch = text.match(/(\d+)\s*(?:mesaj|tane|adet)?/);
    const count = countMatch ? parseInt(countMatch[1]!) : 10;
    return { tool: "temizle", params: { count } };
  }
  // kilitle
  if (/kilitle|kanalı\s*kilitle|kapat\s*kanalı/.test(lower)) {
    return { tool: "kilitle", params: {} };
  }
  // aç
  if (/kilidi\s*aç|kanalı\s*aç|unlock/.test(lower)) {
    return { tool: "ac", params: {} };
  }
  // nuke
  if (/nuke\s*yap|nükleer|kanali\s*nuke/.test(lower)) {
    return { tool: "nuke", params: {} };
  }
  // prefix değiştir
  if (/prefix\s*(?:değiştir|yap|koy|ayarla)|setprefix/.test(lower)) {
    const prefixMatch = text.match(/(?:prefix)\s*(?:değiştir|yap|koy|ayarla)\s*([^\s]+)/i);
    const prefix = prefixMatch?.[1] ?? "!";
    return { tool: "setprefix", params: { prefix } };
  }
  // modsetup aç
  if (/moderasyon\s*(?:aç|aktif|başlat)|mod\s*sistemi?\s*aç/.test(lower)) {
    return { tool: "modsetup_ac", params: {} };
  }
  // log kanalı
  if (/log\s*kanalı?\s*(?:ayarla|koy|yap)|modlog/.test(lower)) {
    if (!channelMention) return null;
    return { tool: "modsetup_log", params: { channelId: channelMention } };
  }

  return null;
}
