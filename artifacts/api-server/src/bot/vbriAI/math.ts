/**
 * VBRI AI — Güvenli Matematik Değerlendirici
 */

/** Sadece sayı, operatör ve parantez içeren ifadeyi güvenli biçimde değerlendirir */
export function evalMath(expr: string): number | null {
  // Temizle
  const cleaned = expr
    .replace(/[^0-9+\-*/^%().\s]/g, "")
    .replace(/\^/g, "**")
    .trim();

  if (!cleaned || !/\d/.test(cleaned)) return null;

  // Güvenlik: sadece izin verilen karakterler
  if (/[^0-9+\-*/%.() \t\n*]/.test(cleaned)) return null;

  try {
    // eslint-disable-next-line no-new-func
    const result = new Function(`"use strict"; return (${cleaned})`)() as unknown;
    if (typeof result !== "number" || !isFinite(result)) return null;
    return Math.round(result * 1e10) / 1e10;
  } catch {
    return null;
  }
}

/** Metinden matematiksel ifade çıkarır */
export function extractMathExpr(text: string): string | null {
  // "kaç eder" / "nedir" gibi ifadelerden önce matematiksel kısım
  const cleaned = text
    .replace(/kaç\s*eder/gi, "")
    .replace(/nedir/gi, "")
    .replace(/hesapla/gi, "")
    .replace(/toplam/gi, "+")
    .replace(/çarp/gi, "*")
    .replace(/böl/gi, "/")
    .replace(/eksi/gi, "-")
    .replace(/artı/gi, "+")
    .replace(/mod\s*/gi, "%")
    .replace(/kere/gi, "*")
    .trim();

  // Bir sayısal ifade bul
  const match = cleaned.match(/[\d\s\+\-\*\/\^%\(\)\.]+/);
  if (!match) return null;
  const expr = match[0]!.trim();
  if (!expr || !/\d/.test(expr) || !/[\+\-\*\/\^%]/.test(expr)) return null;
  return expr;
}

/** Sayıyı okunabilir formata çevirir */
export function formatNumber(n: number): string {
  if (Number.isInteger(n) || String(n).split(".")[1]?.length! <= 4) {
    return n.toLocaleString("tr-TR");
  }
  return n.toFixed(4);
}
