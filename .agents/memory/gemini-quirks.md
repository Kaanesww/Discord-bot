---
name: Gemini API quirks
description: AQ.* key format, doğru auth yöntemi, kota davranışı, model seçimi
---

## Key formatı
Yeni Google AI Studio anahtarları `AQ.*` ile başlar (eski `AIza` formatı artık verilmiyor).
Uzunluk ~53 karakter.

## Doğru kullanım — FETCH (SDK değil)
```typescript
const res = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": process.env.GEMINI_API_KEY, // AQ.* key buraya
    },
    body: JSON.stringify(body),
  }
);
```

**Why:** GoogleGenAI SDK v2 ile AQ.* key'in `apiKey` parametresine verilmesi 401 döndürdü.
Doğrudan fetch + x-goog-api-key header 429 döndürdü (auth geçti, kota doldu).
Bu yüzden SDK kaldırıldı, fetch kullanılıyor.

## Hata kodları
- 401 UNAUTHENTICATED → key tamamen yanlış format veya Bearer deneniyor (Bearer çalışmaz)
- 403 PERMISSION_DENIED → key Cloud Console'dan alınmış, API izni yok; AI Studio'dan alınmalı
- 429 RESOURCE_EXHAUSTED → key geçerli ama ücretsiz kota doldu; bekle veya billing aç

## Model sırası (kota yönetimi)
```
gemini-2.0-flash-lite → gemini-1.5-flash-8b → gemini-1.5-flash
```
429 alınca sıradaki modele geç ve bekle.

## How to apply
aiChat.ts ve codeEngine.ts her ikisi de bu fetch pattern'ı kullanıyor.
Yeni Gemini kodu yazarken SDK import etme, fetch kullan.
