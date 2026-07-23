/**
 * VBRIaimotor — Gelişmiş Intent Tespiti
 * Ağırlıklı keyword + regex tabanlı. Dış API yok.
 */

export type Intent =
  | "GREETING"
  | "FAREWELL"
  | "THANKS"
  | "COMPLIMENT"
  | "INSULT"
  | "SELF_QUESTION"
  | "CAPABILITY"
  | "LEARN_FACT"
  | "RECALL_FACT"
  | "FORGET_FACT"
  | "HISTORY_CLEAR"
  | "HISTORY_SIZE"
  | "COMMAND_RUN"
  | "COMMAND_HELP"
  | "COMMAND_LIST"
  | "CODE_APPROVE"
  | "CODE_REJECT"
  | "CODE_REVISE"
  | "MATH"
  | "JOKE"
  | "SERVER_QUESTION"
  | "UNKNOWN";

interface IntentRule {
  patterns: (RegExp | string)[];
  weight: number;
}

const INTENT_RULES: Record<Intent, IntentRule[]> = {
  GREETING: [
    { patterns: [/^(selam|merhaba|hey|yo|naber|nasılsın|ne var|sa|salam)/i, "selam", "merhaba", "hey", "hola"], weight: 3 },
    { patterns: ["naber", "napıyorsun", "ne yapıyorsun", "iyi misin"], weight: 2 },
  ],
  FAREWELL: [
    { patterns: [/^(görüşürüz|bye|bb|hoşça kal|güle güle|iyi geceler|iyi günler|cya)/i, "görüşürüz", "bay bay"], weight: 3 },
    { patterns: ["gidiyorum", "çıkıyorum", "kapanıyorum"], weight: 2 },
  ],
  THANKS: [
    { patterns: [/teşekkür|sağ ol|eyw|eyvallah|thx|thanks|ty\b/i], weight: 4 },
  ],
  COMPLIMENT: [
    { patterns: [/harika|müthiş|süper|mükemmel|çok iyisin|iyi bot|güzel bot|seviyorum|seni sev/i], weight: 3 },
    { patterns: ["aferin", "bravo", "tebrikler sana"], weight: 2 },
  ],
  INSULT: [
    { patterns: [/salak|aptal|mal|gerize|sürtük|oç|göt|amk|bok|pis bot|işe yaramaz/i], weight: 4 },
  ],
  SELF_QUESTION: [
    { patterns: [/kimsin|ne?sin|adın ne|ismin ne|sen kimsin|hangi botsu?n/i], weight: 5 },
    { patterns: ["vbriaimotor", "vbri ai", "yapay zeka mısın"], weight: 4 },
  ],
  CAPABILITY: [
    { patterns: [/ne yapabilirsin|neler yapabilirsin|özelliğin|yeteneklerin|kapasiten|ne yapıyorsun/i], weight: 4 },
    { patterns: ["ne biliyorsun", "nasıl çalışırsın", "ne işe yararsın"], weight: 3 },
  ],
  LEARN_FACT: [
    { patterns: [/bunu hatırla|şunu hatırla|not al|kaydet bunu|öğren ki|biliyor musun ki/i], weight: 5 },
    { patterns: [/ismim|adım|adı[mn] |sevdiğim|favorim|doğum günüm|yaşım|mesleğim/i], weight: 4 },
    { patterns: [/(hatırla|unutma|aklına al)[:\s]/i], weight: 4 },
  ],
  RECALL_FACT: [
    { patterns: [/ne hatırlıyorsun|hakkımda ne|beni hatırlıyor musun|ne biliyorsun hakkımda/i], weight: 5 },
    { patterns: [/(daha önce|geçen sefer|söylemiştim|anlattım sana)/i], weight: 3 },
  ],
  FORGET_FACT: [
    { patterns: [/unut beni|sıfırla hafızan|bilgilerimi sil|hakkımdakileri unut/i], weight: 5 },
  ],
  HISTORY_CLEAR: [
    { patterns: [/geçmişi (temizle|sıfırla|sil)|sohbeti unut|konuşmayı sil/i], weight: 5 },
    { patterns: ["aitemizle", "sıfırla konuşma"], weight: 4 },
  ],
  HISTORY_SIZE: [
    { patterns: [/kaç mesaj|geçmiş (boyutu|kadar)|ne kadar hatırlıyorsun/i], weight: 5 },
  ],
  COMMAND_RUN: [
    { patterns: [/^(ban|kick|warn|uyar|temizle|kilitle|aç|timeout|sustur|nuke)\s/i], weight: 8 },
    { patterns: [/(kullanıcıyı |kişiyi |onu |bunu )(ban|ban at|at|kick|uyar|sustur|timeout)/i], weight: 6 },
    { patterns: [/mesaj(ları)? (sil|temizle)|kanal(ı)? kilitle|kanal(ı)? aç/i], weight: 5 },
  ],
  COMMAND_HELP: [
    { patterns: [/ne yapar|nasıl kullanılır|komut açıkla|ne için/i], weight: 4 },
    { patterns: [/(ban|kick|warn|temizle|prefix|level|ekonomi|rulet|blackjack).*(ne yapar|nedir|nasıl)/i], weight: 5 },
  ],
  COMMAND_LIST: [
    { patterns: [/^(komutlar|yardım|help|komut listesi|ne yapabilirsin)[\s!?]*$/i], weight: 6 },
    { patterns: [/tüm komutlar|komut listesi|hangi komutlar/i], weight: 4 },
  ],
  CODE_APPROVE: [
    { patterns: [/^(onayla|tamam|evet|kabul|yaz dosyaya|kaydet|güzel|harika|mükemmel)[\s!.]*$/i], weight: 8 },
    { patterns: ["onaylıyorum", "yap bunu", "kullan bunu", "evet bunu istiyorum"], weight: 6 },
  ],
  CODE_REJECT: [
    { patterns: [/^(iptal|hayır|yok|istemiyorum|sil|vazgeç|olmadı)[\s!.]*$/i], weight: 8 },
    { patterns: ["beğenmedim", "farklı yap", "bu olmadı"], weight: 5 },
  ],
  CODE_REVISE: [
    { patterns: [/(düzenle|değiştir|revize|güncelle|düzelt)[\s:]/i], weight: 7 },
    { patterns: [/şöyle (olsun|yap|değiştir)|bunu (değiştir|düzelt)/i], weight: 5 },
  ],
  MATH: [
    { patterns: [/\d+\s*[\+\-\*\/\^]\s*\d+/], weight: 6 },
    { patterns: [/(kaç|hesapla|sonuç|kaçtır|kaç eder)\s*[\d\+\-\*\/]/i, /\d+.*(kaç|eder|eşit)/i], weight: 4 },
    { patterns: ["karekök", "kaçın karesi", "faktöriyel"], weight: 3 },
  ],
  JOKE: [
    { patterns: [/fıkra|espri|şaka|güldür|komik bir şey|güldür beni/i], weight: 5 },
  ],
  SERVER_QUESTION: [
    { patterns: [/sunucu (hakkında|bilgi|nedir|nasıl)/i, "bu sunucu", "kaç üye"], weight: 4 },
  ],
  UNKNOWN: [
    { patterns: [], weight: 0 },
  ],
};

// ── Intent skoru hesapla ───────────────────────────────────────────────────────

function scoreIntent(text: string, rules: IntentRule[]): number {
  const lower = text.toLowerCase();
  let total = 0;
  for (const rule of rules) {
    for (const p of rule.patterns) {
      if (p instanceof RegExp ? p.test(lower) : lower.includes(p)) {
        total += rule.weight;
        break;
      }
    }
  }
  return total;
}

export function detectIntent(text: string): { intent: Intent; score: number } {
  let best: Intent = "UNKNOWN";
  let bestScore = 0;

  for (const [intent, rules] of Object.entries(INTENT_RULES) as [Intent, IntentRule[]][]) {
    if (intent === "UNKNOWN") continue;
    const s = scoreIntent(text, rules);
    if (s > bestScore) {
      bestScore = s;
      best = intent;
    }
  }

  return { intent: best, score: bestScore };
}

// ── Öğrenilebilir gerçek çıkar ────────────────────────────────────────────────

export function extractLearnableFact(text: string): string | null {
  const lower = text.toLowerCase();

  // "hatırla: X" veya "not al: X"
  const colonMatch = lower.match(/(?:hatırla|not al|kaydet|öğren)[:\s]+(.+)/);
  if (colonMatch?.[1]) return colonMatch[1].trim();

  // "ismim/adım X"
  const nameMatch = lower.match(/(?:ismim|adım)\s+(\S+)/);
  if (nameMatch?.[1]) return `Kullanıcının adı: ${nameMatch[1]}`;

  // "sevdiğim X"
  const likeMatch = lower.match(/sevdiğim\s+(\w+)\s+(\S+)/);
  if (likeMatch) return `Kullanıcının sevdiği ${likeMatch[1]}: ${likeMatch[2]}`;

  // "doğum günüm X"
  const bdMatch = lower.match(/doğum\s+(?:günüm|tarihi?m)\s+(.+)/);
  if (bdMatch?.[1]) return `Doğum günü: ${bdMatch[1].trim()}`;

  // "bunu hatırla: X" veya "X bunu hatırla"
  const rememberMatch = text.match(/(?:biliyor musun ki|bunu hatırla)[,:\s]+(.+)/i);
  if (rememberMatch?.[1]) return rememberMatch[1].trim();

  return null;
}

// ── Komut çalıştırma isteği çıkar ────────────────────────────────────────────

const COMMAND_PATTERNS: Array<{
  pattern: RegExp;
  tool: string;
  extract: (m: RegExpMatchArray) => Record<string, unknown>;
}> = [
  {
    pattern: /(?:ban at|yasakla|ban)\s+<@!?(\d+)>(?:\s+(.+))?/i,
    tool: "ban",
    extract: (m) => ({ userId: m[1], reason: m[2] ?? "Sebep belirtilmedi" }),
  },
  {
    pattern: /(?:kick et|at|kick)\s+<@!?(\d+)>(?:\s+(.+))?/i,
    tool: "kick",
    extract: (m) => ({ userId: m[1], reason: m[2] ?? "Sebep belirtilmedi" }),
  },
  {
    pattern: /(?:uyar|warn)\s+<@!?(\d+)>(?:\s+(.+))?/i,
    tool: "warn",
    extract: (m) => ({ userId: m[1], reason: m[2] ?? "Sebep belirtilmedi" }),
  },
  {
    pattern: /(?:sustur|timeout)\s+<@!?(\d+)>\s+(\S+)(?:\s+(.+))?/i,
    tool: "timeout",
    extract: (m) => ({ userId: m[1], duration: m[2], reason: m[3] ?? "Sebep belirtilmedi" }),
  },
  {
    pattern: /(?:mesajları?\s+)?(temizle|sil)\s+(\d+)/i,
    tool: "temizle",
    extract: (m) => ({ count: parseInt(m[2]!) }),
  },
  {
    pattern: /(\d+)\s+mesaj\s+(?:temizle|sil)/i,
    tool: "temizle",
    extract: (m) => ({ count: parseInt(m[1]!) }),
  },
  {
    pattern: /kanalı?\s+kilitle/i,
    tool: "kilitle",
    extract: () => ({}),
  },
  {
    pattern: /kanalı?\s+aç|kilidi\s+aç/i,
    tool: "ac",
    extract: () => ({}),
  },
];

export function extractCommandTrigger(text: string): { tool: string; params: Record<string, unknown> } | null {
  for (const { pattern, tool, extract } of COMMAND_PATTERNS) {
    const m = text.match(pattern);
    if (m) return { tool, params: extract(m) };
  }
  return null;
}

// ── Matematik çözümü ─────────────────────────────────────────────────────────

export function evalMathExpr(text: string): { expr: string; result: number } | null {
  // Basit matematik ifadesi çıkar
  const match = text.match(/([\d\s\+\-\*\/\^\(\)\.]+)/);
  if (!match?.[1]) return null;
  const expr = match[1].trim();
  if (expr.length < 3) return null;
  try {
    // Güvenli eval — sadece sayı ve operatörler
    const safe = expr.replace(/\^/g, "**").replace(/[^\d\s\+\-\*\/\(\)\.\*]/g, "");
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${safe})`)() as number;
    if (typeof result !== "number" || !isFinite(result)) return null;
    return { expr, result };
  } catch {
    return null;
  }
}
