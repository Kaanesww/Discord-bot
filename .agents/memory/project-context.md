---
name: Proje bağlamı
description: VBRI Discord bot projesi — mimari, tüm özellikler, kullanıcı tercihleri, mevcut sorunlar
---

## Proje
VBRI Discord botu — Türk sunucusu "Vivincy" için. Bot tag: VBRI'S#6779. Prefix: v! (DB'de per-guild).

## Kullanıcının çalışma şekli
- Birden fazla Replit hesabı kullanıyor → her session tamamen fresh başlıyor
- Yarım kalan işi hatırlatmak için replit.md'yi okuması yeterli (bu dosyayı gösterir)
- Tüm geçmiş istek ve mimari kararlar replit.md'de tutulur

## Kritik kararlar

**Gemini:** SDK yerine doğrudan fetch kullanılıyor. `x-goog-api-key: AQ.*` header çalışıyor.
429 = kota doldu (key geçersiz değil). Detaylar: gemini-quirks.md

**Bot komutları:** Tek büyük index.ts'de. Yeni özellikler ayrı dosya → index.ts'e import.

**AI sistemi iki katmanlı:**
1. Yerel motor (vbriAI/engine.ts) — Gemini gerektirmez, her zaman çalışır
2. Gemini function-calling (aiCommands.ts) — kota varken doğal dil komutu çalıştırır

**Warn komutu:** Hem prefix (pfxWarn) hem AI versiyonu (aiCommands.ts case "warn") görsel PNG kart üretir ve DM'e gönderir.

**Kod motoru (codeEngine.ts):** Bot sahibi `v!kodkanal #kanal` ile kanal belirler, o kanalda Gemini kod üretir, vm.runInContext ile sandbox çalıştırır. Henüz startup plugin yükleme yok.

## Tamamlanmamış işler
- `data/plugins/` altındaki dosyaları bot restart'ta otomatik yükleme
- Ban/kick için de görsel embed (şu an sadece warn'da var)
