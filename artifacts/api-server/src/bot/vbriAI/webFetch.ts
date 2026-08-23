/**
 * VBRI AI — Web Fetch Modülü
 * ─────────────────────────────────────────────────────────────────────────────
 * URL'den içerik çeker, HTML'i düz metne çevirir ve anlamlı bir özet döndürür.
 * Dış kütüphane gerekmez — Node.js native fetch kullanır.
 */

const FETCH_TIMEOUT_MS = 10_000;
const MAX_CONTENT_CHARS = 3_000; // Discord mesaj limitini aşmamak için
const MAX_SUMMARY_CHARS = 1_800;

// ── URL tespiti ───────────────────────────────────────────────────────────────

const URL_REGEX = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&/=]*)/gi;

export function extractUrl(text: string): string | null {
  const matches = text.match(URL_REGEX);
  return matches?.[0] ?? null;
}

export function containsUrl(text: string): boolean {
  return URL_REGEX.test(text);
}

// ── HTML → düz metin ──────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    // Script ve style bloklarını kaldır
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    // Satır kırmaları
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n")
    // Kalan tag'ler
    .replace(/<[^>]+>/g, " ")
    // HTML entities
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#\d+;/g, " ")
    .replace(/&[a-z]+;/g, " ")
    // Birden fazla boşluk/satır
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── Sayfa başlığını çıkar ─────────────────────────────────────────────────────

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match?.[1]?.trim() ?? "";
}

// ── Meta description çıkar ───────────────────────────────────────────────────

function extractDescription(html: string): string {
  const match =
    html.match(/<meta\s+name="description"\s+content="([^"]+)"/i) ??
    html.match(/<meta\s+content="([^"]+)"\s+name="description"/i) ??
    html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i);
  return match?.[1]?.trim() ?? "";
}

// ── Ana içerik bölümünü bul ───────────────────────────────────────────────────

function extractMainContent(html: string): string {
  // article > main > #content > .content sırasıyla dene
  const patterns = [
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<main[^>]*>([\s\S]*?)<\/main>/i,
    /<div[^>]*(?:id|class)="[^"]*(?:content|article|post|main)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
  ];

  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1] && m[1].length > 200) return m[1];
  }

  return html; // fallback: tümü
}

// ── Metni anlamlı özete kısalt ────────────────────────────────────────────────

function summarize(text: string, maxChars: number): string {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 20); // Çok kısa satırları çıkar

  let result = "";
  for (const line of lines) {
    if (result.length + line.length + 2 > maxChars) break;
    result += line + "\n";
  }

  return result.trim();
}

// ── Ana fetch fonksiyonu ──────────────────────────────────────────────────────

export interface FetchResult {
  ok: boolean;
  url: string;
  title: string;
  description: string;
  content: string;
  error?: string;
}

export async function fetchWebPage(rawUrl: string): Promise<FetchResult> {
  // URL normalleştir
  let url = rawUrl.trim();
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; VBRIBot/1.0; +https://discord.com)",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
      },
    });
    clearTimeout(timer);

    if (!res.ok) {
      return {
        ok: false,
        url,
        title: "",
        description: "",
        content: "",
        error: `HTTP ${res.status} ${res.statusText}`,
      };
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      return {
        ok: false,
        url,
        title: "",
        description: "",
        content: "",
        error: `Desteklenmeyen içerik türü: ${contentType}`,
      };
    }

    // İçerik boyutunu sınırla
    const raw = (await res.text()).slice(0, 200_000);

    const title        = extractTitle(raw);
    const description  = extractDescription(raw);
    const mainHtml     = extractMainContent(raw);
    const plainText    = stripHtml(mainHtml).slice(0, MAX_CONTENT_CHARS);
    const content      = summarize(plainText, MAX_SUMMARY_CHARS);

    return { ok: true, url, title, description, content };
  } catch (err: unknown) {
    const msg =
      err instanceof Error
        ? err.name === "AbortError"
          ? "Zaman aşımı (10 sn)"
          : err.message
        : String(err);
    return { ok: false, url, title: "", description: "", content: "", error: msg };
  }
}

// ── Discord mesajı formatla ───────────────────────────────────────────────────

export function formatFetchResult(result: FetchResult, learnedInfo?: string): string {
  if (!result.ok) {
    return `❌ **Web Fetch Hatası**\n🔗 URL: \`${result.url}\`\n📛 Hata: ${result.error}`;
  }

  const lines: string[] = [];

  lines.push(`🌐 **${result.title || result.url}**`);
  lines.push(`🔗 ${result.url}`);

  if (result.description) {
    lines.push(`\n📋 **Açıklama:** ${result.description.slice(0, 200)}`);
  }

  if (result.content) {
    lines.push(`\n📄 **İçerik:**\n\`\`\`\n${result.content.slice(0, 1200)}\n\`\`\``);
  }

  if (learnedInfo) {
    lines.push(`\n✅ **Bu bilgiyi hafızama kaydettim.**`);
  }

  return lines.join("\n");
}
