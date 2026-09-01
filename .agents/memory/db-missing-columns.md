---
name: DB eksik şema düzeltme
description: drizzle-kit push TTY gerektirdiğinden yeni şema tabloları ve kolonları otomatik oluşturulmaz; executeSql ile manuel eklenmelidir
---

# DB Şema Eksikliği Sorunu

`drizzle-kit push` komutu TTY gerektirir (interactive prompt). Replit shell'inde çalıştırıldığında "Interactive prompts require a TTY terminal" hatası verir. Bu yüzden eksik bir tablo da uygulama açılışında relation hatası üretebilir.

**Why:** Drizzle, mevcut tablolarla şema arasındaki farkı çözmek için kullanıcıdan onay ister. CI/non-interactive ortamda bu çalışmaz.

**How to apply:** Yeni şema tablosu veya kolonu eklendiğinde, `executeSql` callback'i ile doğrudan CREATE TABLE / ALTER TABLE çalıştır:

```javascript
await executeSql({ sqlQuery: `ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS level_enabled BOOLEAN NOT NULL DEFAULT TRUE;` });
```

**Bilinen eksik kolonlar (düzeltildi):**
- `guild_settings.level_enabled` — ilk başta tabloda yoktu, 2026-08-06 eklendi
- `video_request_settings.invite_url` — 2026-08-06 eklendi

**Yeni tablo oluştururken:** `CREATE TABLE IF NOT EXISTS` kullan, `executeSql` üzerinden çalıştır. Kolon ve tablo tanımını ilgili Drizzle şemasıyla birebir eşleştir.
