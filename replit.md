# VBRI Discord Bot — Tam Proje Hafızası

> **Her yeni Replit agent bu dosyayı ilk iş olarak okumalıdır.**
> Proje geçmişi, mimari, tüm özellikler ve kullanıcı tercihleri burada.

---

## Projeye Genel Bakış

VBRI, "Vivincy" adlı Türk Discord sunucusu için yazılmış tam özellikli bir Discord botudur.
Türkçe komutlar, ekonomi sistemi, moderasyon, seviye/XP, müzik, guard, AI sohbet ve AI kod motoru içerir.
Ayrıca bir web dashboard'u vardır (bot-dashboard artifact).

**Bot tag:** `VBRI'S#6779`
**Default prefix:** `v!` (sunucu başına DB'de saklanır)
**Dil:** Türkçe (komutlar + yanıtlar)

---

## Teknoloji Stack'i

| Katman | Teknoloji |
|---|---|
| Runtime | Node.js 20, TypeScript 5.9 |
| Paket yönetimi | pnpm workspaces |
| Bot/API | Discord.js 14, Express 5 |
| Görsel kartlar | @napi-rs/canvas |
| Veritabanı | SQLite (LibSQL) + Drizzle ORM |
| Dashboard | React 19, Vite, Tailwind CSS 4, Shadcn UI |
| Validation | Zod, drizzle-zod |
| Build | esbuild |
| AI | Google Gemini API (fetch tabanlı, x-goog-api-key header) |

---

## Ortam Değişkenleri / Secretlar

| Key | Tür | Açıklama |
|---|---|---|
| `DISCORD_TOKEN` | Replit Secret | Bot token |
| `DISCORD_CLIENT_ID` | Replit Secret (shared env) | Uygulama ID |
| `GEMINI_API_KEY` | Replit Secret | Google AI Studio — AQ.* format (yeni format) |
| `SESSION_SECRET` | Replit Secret | Dashboard session |

**ÖNEMLİ — GEMINI_API_KEY:**
- Yeni Google AI Studio anahtarları `AQ.*` formatında gelir (`AIza` değil)
- `x-goog-api-key` header ile çalışır, Bearer token olarak DEĞİL
- Ücretsiz tier kotası hızla dolar; 429 alınırsa kota dolmuştur, hata kod hatası değildir
- SDK (`GoogleGenAI`) yerine doğrudan `fetch` kullanılıyor (confirmed working)
- Model sırası: `gemini-2.0-flash-lite` → `gemini-1.5-flash-8b` → `gemini-1.5-flash`

---

## Workflow'lar

| Workflow | Komut | Port |
|---|---|---|
| `API Server` | `PORT=8080 pnpm --filter @workspace/api-server run dev` | 8080 |
| `artifacts/bot-dashboard: web` | `pnpm --filter @workspace/bot-dashboard run dev` | 3000 |

**Not:** `artifacts/api-server: API Server` ve `Bot Dashboard` adlı eski artifact workflow'ları port çakışması nedeniyle başarısız olur — bu normaldir, bunları başlatmaya çalışma.

---

## Dosya Yapısı — Önemli Konumlar

```
artifacts/
  api-server/src/
    bot/
      index.ts              ← Ana bot dosyası (2100+ satır) — tüm prefix komutlar burada
      aiChat.ts             ← VBRİ AI giriş noktası (engine'e yönlendirir)
      aiCommands.ts         ← Gemini function-calling araçları + executeToolCall
      codeEngine.ts         ← VBRİ Kod Motoru (Gemini → Node.js üretimi + vm çalıştırma)
      warnCard.ts           ← Warn görsel kartı (@napi-rs/canvas)
      vbriAI/
        engine.ts           ← Yerel AI motoru (NLP tabanlı, Gemini gerektirmez)
        intent.ts           ← Intent tespiti (GREETING, COMMAND_RUN, vb.)
        knowledge.ts        ← Tüm komutların bilgi tabanı (yardım menüsü için)
        responses.ts        ← Kişilik yanıt şablonları
        math.ts             ← Güvenli matematik değerlendirici
        context.ts          ← Konuşma bağlamı (kanal bazlı geçmiş)
      moderationSettings.ts ← canUseMod, addRoleForCmd, vb.
      moderation.ts         ← logAction, getUserLogs (moderasyon log DB)
      ownerUtils.ts         ← isOwner (BOT_OWNER_ID), maintenance sistemi
      leveling.ts           ← XP, seviye, leaderboard
      economy.ts            ← Coin sistemi, casino oyunları
      music.ts              ← Müzik sistemi (SoundCloud)
      guard.ts              ← Spam/link/emoji koruma, bot join koruması
      stat.ts               ← Stat kanalları (üye sayısı vb.)
      approvalSystem.ts     ← Moderasyon onay sistemi (button-based)
  bot-dashboard/src/        ← React dashboard
lib/
  db/src/schema/
    guildSettings.ts        ← prefix, levelEnabled
    levels.ts               ← XP ve seviye verileri
    economy.ts              ← Coin bakiyeleri
    moderationSettings.ts   ← Mod rol konfigürasyonu (JSON arrays)
    moderationLogs.ts       ← Ban/kick/warn/timeout kayıtları
    guardSettings.ts        ← Guard modülü ayarları
    levelRoles.ts           ← Seviye bazlı otomatik roller
    statChannels.ts         ← İstatistik kanalları
    codeChannel.ts          ← VBRİ Kod Motoru kanal ID'si (singleton)
    index.ts                ← Tüm tabloları export eder
data/
  bot.db                    ← SQLite veritabanı dosyası
  plugins/                  ← Kod motoru tarafından üretilen plugin dosyaları
```

---

## Kullanıcı Tercihleri (ÇOK ÖNEMLİ)

1. **Prefix-based komutlar** — Slash command değil. Default prefix `v!`.
2. **Türkçe** — Tüm yanıtlar ve komut isimleri Türkçe. Bazı komutların İngilizce alias'ları var.
3. **Görsel kartlar** — Önemli komutlar (warn, sicil, level, yardım, vb.) `@napi-rs/canvas` ile PNG kart döner.
4. **Kod kalitesi** — Tek büyük `index.ts` dosyası tercih ediliyor (komutlar bölünmüyor), yeni özellikler ayrı dosya olarak ekleniyor sonra `index.ts`'e import ediliyor.
5. **Yetki sistemi** — Bot sahibi her şeyi yapabilir. Sunucu sahibi mod ayarlarını yapabilir. Mod komutları `canUseMod()` ile kontrol edilir (DB'deki rol izinleri).
6. **Onay sistemi** — Bazı ban gibi komutlar Discord button ile onay bekler.
7. **Hata mesajları** — Türkçe, kısa ve net. Emoji kullanılır (❌, ✅, ⚠️ vb.).

---

## Tamamlanan Özellikler

### Moderasyon
- `v!ban`, `v!kick`, `v!warn`, `v!timeout`, `v!sustur`, `v!untimeout`, `v!unban`
- `v!kilitle` / `v!ac` — kanal kilitleme
- `v!temizle` — bulk mesaj silme (1-100)
- `v!nuke` — kanalı sil + yeniden oluştur
- `v!sicil @kullanıcı` — moderasyon geçmişi (görsel kart)
- `v!uyarikaldir <id>` — uyarı kaldırma
- `v!modsetup` — mod sistemi kurulumu (rol izinleri, log kanalı)
- **Onay sistemi** — İlk kez ban atan moderatör için onay butonu
- **Warn görsel kart** — Hem kanala hem DM'e PNG kart gider (prefix VE AI komutu)

### Ekonomi
- `v!bakiye`, `v!daily`, `v!transfer`
- `v!kumar` (slot), `v!rulet`, `v!coinflip`, `v!blackjack`, `v!duel`
- `v!pray` — şans dua sistemi, luck mekanik
- `v!ekono` — ekonomi seviye kartı
- `v!ekonlider` — ekonomi lider tablosu
- Vivincy coin custom emoji (uygulama emojisi, startup'ta yüklenir)

### Seviye / XP
- `v!level [@kullanıcı]` — profil kartı (görsel)
- `v!leaderboard` — lider tablosu (görsel)
- `v!levelrol <seviye> @rol` — otomatik seviye rolü
- `v!levelsistemi aç/kapat`
- Ses kanalı XP (dakika başına XP)
- Level-up mesajı (görsel kart)

### Müzik
- `v!çal`, `v!dur`, `v!devam`, `v!atla`, `v!kuyruk`, `v!durdur`, `v!şarkı`
- SoundCloud tabanlı

### Guard (Sunucu Koruması)
- Spam, link, emoji filtresi
- Bot katılım koruması
- Rol/kanal değişim saldırısı tespiti
- `v!guard` ile yapılandırma

### Stat Kanalları
- `v!stat` — üye sayısı, online sayısı vb. otomatik güncellenen kanallar

### VBRİ AI Sistemi (Bot Mention)
- `@VBRİ <mesaj>` — bot etiketlenince yanıt verir
- **Yerel motor** (`vbriAI/engine.ts`): Gemini gerektirmez, NLP tabanlı
  - Intent tespiti: karşılama, veda, yardım, komut çalıştırma, matematik, espri vb.
  - Komut bilgi tabanı (tüm komutlar açıklamaları ile)
- **Gemini function-calling** (`aiCommands.ts`): Gemini varken doğal dil komutu çalıştırır
  - "@VBRİ kanalı temizle" → `temizle` tool çağrısı
  - "@VBRİ @kullanıcıya ban at" → `ban` tool çağrısı
  - Eksik parametre varsa AI soru sorar, cevap bekler, sonra çalıştırır
  - Tüm mod komutları yetki korumalı

### VBRİ Kod Motoru (YENİ — Yarım Kalmış)
- `v!kodkanal #kanal` — bot sahibi için özel kod yazma kanalı belirleme
- Belirlenen kanalda sadece bot sahibi yazabilir
- Doğal dil istek → Gemini → Node.js kodu üretimi
- Discord embed'de kodu gösterir + ✅/❌ reaksiyon ile onay sistemi
- `vm.runInContext` ile sandboxed çalıştırma
- Kalıcı kayıt: `data/plugins/` klasörüne yazılır
- Gemini kotası dolunca açıklayıcı hata mesajı
- **Durum:** Kod altyapısı tamam ama Gemini kotası dolduğu için henüz tam test edilemedi

### Diğer
- `v!yardim` — kategori bazlı görsel yardım menüsü (button ile)
- `v!bakım <komut>` — komut bakım modu (bot sahibi)
- `v!ping`, `v!userinfo`, `v!setprefix`
- `v!sunucukur` — sunucu kurulum şablonu
- Fuzzy command matching (yakın yazılanlar da çalışır)
- Bot durum rotasyonu (presence)

---

## Mevcut Sorunlar / Dikkat Edilecekler

### Gemini API Kotası
- Ücretsiz tier günlük kotası hızla dolabiliyor
- 429 hatası = kota doldu (anahtar geçersiz değil)
- Kota dolunca AI sohbet çalışmaz ama yerel VBRİ motor çalışmaya devam eder
- Çözüm: Google AI Studio'da billing açmak veya beklemek

### Kod Yazma Motoru (Eksik)
- Plugin sistemi `data/plugins/` klasörüne yazıyor ama bot restart'ta bu pluginleri otomatik yüklemüyor
- Gelecekte: startup'ta `data/plugins/*.js` dosyalarını eval etme sistemi eklenecek

### Duplicate Workflow'lar
- `Bot Dashboard` ve `artifacts/api-server: API Server` workflow'ları port çakışması nedeniyle fail oluyor
- Bu normaldir, **dokunma**
- Çalışan workflow'lar: `API Server` (port 8080) ve `artifacts/bot-dashboard: web` (port 3000)

---

## DB Şema Tabloları

| Tablo | Dosya | Amaç |
|---|---|---|
| `guild_settings` | guildSettings.ts | Prefix, level toggle |
| `levels` | levels.ts | XP ve seviye |
| `level_roles` | levelRoles.ts | Otomatik seviye rolleri |
| `economy` | economy.ts | Coin, luck, ekon XP |
| `moderation_logs` | moderationLogs.ts | Ban/kick/warn/timeout kayıtları |
| `moderation_settings` | moderationSettings.ts | Rol izinleri (JSON), log kanalı |
| `guard_settings` | guardSettings.ts | Guard konfigürasyonu |
| `stat_channels` | statChannels.ts | Stat kanal ID'leri |
| `code_channel` | codeChannel.ts | Kod motoru kanal ID'si (singleton) |

**DB komutu:** `pnpm --filter @workspace/db run push`

---

## Yeni Özellik Eklerken Checklist

1. Bot komutları → `artifacts/api-server/src/bot/index.ts` içine `pfx*` fonksiyon yaz, `prefixHandlers` tablosuna ekle
2. Yardım menüsüne ekle → `vbriAI/knowledge.ts` COMMANDS dizisine ekle
3. AI ile çalıştırılabilir komut → `aiCommands.ts` BOT_TOOL_DECLARATIONS + switch case
4. DB değişikliği → `lib/db/src/schema/` dosyası yaz, `index.ts`'e export ekle, `pnpm --filter @workspace/db run push` çalıştır
5. Build + restart → `pnpm --filter @workspace/api-server run build` + `API Server` workflow restart

---

## Kullanıcının Gelecek İstekleri / Fikirler (Takip)

- Plugin sisteminin startup'ta otomatik yüklenmesi (kod motoru için)
- Warn gibi diğer mod komutlarının da görsel kart versiyonları (ban, kick için embed)
- Economy sistemi genişletmesi (maden komutu gibi yeni oyunlar)
