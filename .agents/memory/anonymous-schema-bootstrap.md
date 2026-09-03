---
name: Anonim sistem şeması
description: Discord anonim sohbet tablolarının bu çalışma alanındaki veritabanı hazırlama davranışı
---

Anonim sohbet ve diğer isteğe bağlı bot modülleri başlamadan önce tabloları ve yeni kolonları idempotent SQL ile hazırlamalıdır.

**Why:** Bu çalışma alanındaki PostgreSQL veritabanında Drizzle şeması her zaman otomatik push edilmemiş olabiliyor; yalnızca ORM şemasına güvenmek bot açılışında relation-not-found hatasına yol açtı.

**How to apply:** Bir modülün açılış senkronizasyonu veya komutları tablo okuyorsa, ilgili PostgreSQL şemasını uygulama açılışında migration-safe biçimde hazırlayan adımı da güncelle.