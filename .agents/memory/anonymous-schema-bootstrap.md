---
name: Anonim sistem şeması
description: Discord anonim sohbet tablolarının bu çalışma alanındaki veritabanı hazırlama davranışı
---

Anonim sohbet özelliği başlamadan önce tabloları ve yeni kolonları idempotent SQL ile hazırlamalıdır.

**Why:** Bu çalışma alanındaki PostgreSQL veritabanında Drizzle şeması her zaman otomatik push edilmemiş olabiliyor; yalnızca ORM şemasına güvenmek bot açılışında relation-not-found hatasına yol açtı.

**How to apply:** Anonim hesap, özel kanal veya mesaj eşleştirmesi şemasını değiştirirken başlangıç hazırlığını da aynı migration-safe yaklaşımla güncelle.