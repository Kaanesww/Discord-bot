/**
 * VBRI Akıllı Komut Eşleştirme
 * ─────────────────────────────────────────────────────────────────────────────
 * Yanlış yazılan veya doğal dille yazılan komutları tanıyıp doğru komuta yönlendirir.
 * 1. Katman: Levenshtein benzerlik skoru (hızlı, API yok)
 * 2. Katman: Gemini ile niyet tespiti (doğal dil, yavaş)
 */

import { GoogleGenAI } from "@google/genai";
import { logger } from "../lib/logger";

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenAI({ apiKey: apiKey! });
const MODEL = "gemini-3.1-flash-lite";

// ── Komut açıklamaları (niyet tespiti için) ───────────────────────────────────
const COMMAND_DESCRIPTIONS: Record<string, string> = {
  ekono:      "kullanıcının para/bakiye/coin durumunu göster",
  daily:      "günlük ödül al, günlük bonus",
  pray:       "ibadet et, dua et, coin kazan",
  coinflip:   "yazı tura, coin flip, şans oyunu",
  rulet:      "rulet oyna, çark",
  bj:         "blackjack oyna, 21 oyunu",
  duel:       "düello, 1v1 para bahsi",
  bet:        "bahis yap, para dizi",
  ekonlider:  "ekonomi lider tablosu, en zenginler, sıralama",
  profil:     "seviye profili, xp durumu, rank kartı göster",
  lider:      "seviye lider tablosu, xp sıralaması",
  seviye:     "mevcut level, kaçıncı seviyedeyim",
  rps:        "taş kağıt makas oyna",
  mine:       "mayın tarlası oyna, minesweeper",
  zar:        "zar at, dice",
  "8top":     "sihirli 8 top, karar ver",
  patla:      "balon patlatma oyunu",
  guard:      "sunucu koruma ayarları, guard sistemi",
  kick:       "kullanıcıyı at, sunucudan çıkar",
  ban:        "kullanıcıyı banla, yasakla",
  mute:       "kullanıcıyı sustur, timeout",
  warn:       "kullanıcıyı uyar, ihtarda bulun",
  sicil:      "kullanıcının uyarı geçmişi, ihlaller",
  temizle:    "mesajları sil, kanal temizle",
  yardim:     "yardım menüsü, komut listesi",
  ping:       "bot gecikmesi, ping kaç",
  bakım:      "bakım modu yönetimi",
  aitemizle:  "ai sohbet geçmişini sıfırla",
};

const ALL_COMMANDS = Object.keys(COMMAND_DESCRIPTIONS);

// ── Gemini rate limit ─────────────────────────────────────────────────────────
let reqThisMinute = 0;
let minuteResetAt = Date.now() + 60_000;
function canCallGemini(): boolean {
  const now = Date.now();
  if (now > minuteResetAt) { reqThisMinute = 0; minuteResetAt = now + 60_000; }
  if (reqThisMinute >= 20) return false; // AI chat için de yer bırak
  reqThisMinute++;
  return true;
}

// ── Levenshtein mesafesi ──────────────────────────────────────────────────────
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i]![j] = a[i-1] === b[j-1]
        ? dp[i-1]![j-1]!
        : 1 + Math.min(dp[i-1]![j]!, dp[i]![j-1]!, dp[i-1]![j-1]!);
  return dp[m]![n]!;
}

function fuzzyScore(input: string, cmd: string): number {
  if (cmd === input) return 1;
  if (cmd.startsWith(input) || input.startsWith(cmd)) return 0.9;
  const dist = levenshtein(input, cmd);
  const maxLen = Math.max(input.length, cmd.length);
  return 1 - dist / maxLen;
}

// ── 1. Katman: Hızlı fuzzy eşleşme ──────────────────────────────────────────
export function findFuzzyCommand(input: string): { cmd: string; score: number } | null {
  if (input.length < 2 || input.length > 20) return null;

  let best: { cmd: string; score: number } | null = null;
  for (const cmd of ALL_COMMANDS) {
    const score = fuzzyScore(input, cmd);
    if (!best || score > best.score) best = { cmd, score };
  }

  // Eşik: %65 benzerlik yeterli (kısa komutlarda daha katı)
  const threshold = input.length <= 3 ? 0.75 : 0.65;
  return best && best.score >= threshold ? best : null;
}

// ── 2. Katman: Gemini niyet tespiti ──────────────────────────────────────────
const intentCache = new Map<string, string | null>();

export async function findIntentCommand(input: string): Promise<string | null> {
  if (input.length > 80) return null;

  const cacheKey = input.toLowerCase().trim();
  if (intentCache.has(cacheKey)) return intentCache.get(cacheKey)!;
  if (!canCallGemini()) return null;

  const cmdList = ALL_COMMANDS.map(c => `${c}: ${COMMAND_DESCRIPTIONS[c]}`).join("\n");

  const prompt = `Aşağıda bir Discord bot komut listesi var. Kullanıcı "${input}" yazdı.
Bu mesajın hangi komuta atıfta bulunduğunu tahmin et.
Sadece komut adını yaz (örn: "ekono"). Hiçbir komuta uymuyorsa "YOK" yaz.

Komutlar:
${cmdList}

Cevap (sadece komut adı veya YOK):`;

  try {
    const response = await genAI.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { maxOutputTokens: 20, temperature: 0 },
    });
    const result = response.text?.trim().toLowerCase().replace(/[^a-z0-9ğüşıöç!]/g, "") ?? "";
    const found = ALL_COMMANDS.find(c => c === result) ?? null;
    intentCache.set(cacheKey, found);
    // Cache 1 saat sonra silinsin (bellek tasarrufu)
    setTimeout(() => intentCache.delete(cacheKey), 3_600_000);
    return found;
  } catch (err) {
    logger.debug({ err }, "fuzzyCmd: Gemini niyet tespiti başarısız");
    return null;
  }
}

// ── Ana fonksiyon ─────────────────────────────────────────────────────────────
/**
 * Girdi metni ile eşleşen bir komut bul.
 * - Fuzzy eşleşme başarılıysa hemen döner (hızlı yol)
 * - Başarısızsa Gemini'ye sorar (yavaş yol)
 * - Hiçbir şey bulunamazsa null döner
 */
export async function resolveCommand(
  input: string
): Promise<{ cmd: string; method: "fuzzy" | "ai" | "exact" } | null> {
  const clean = input.toLowerCase().trim();
  if (!clean) return null;

  // Tam eşleşme
  if (ALL_COMMANDS.includes(clean)) return { cmd: clean, method: "exact" };

  // Fuzzy katman
  const fuzzy = findFuzzyCommand(clean);
  if (fuzzy && fuzzy.score >= 0.8) return { cmd: fuzzy.cmd, method: "fuzzy" };

  // AI katman
  const ai = await findIntentCommand(clean);
  if (ai) return { cmd: ai, method: "ai" };

  // Fuzzy 2. şans — düşük eşik (0.65)
  if (fuzzy) return { cmd: fuzzy.cmd, method: "fuzzy" };

  return null;
}
