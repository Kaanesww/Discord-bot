---
name: Yetki sınırları
description: Discord botunun otomatik rol ve davet izinleri için güvenlik sınırları
---

# Yetki sınırları

Bot, sunucuya katılırken kendisi için Administrator yetkili rol oluşturmamalı veya atamamalı. Davet bağlantısı yalnızca komutların ihtiyaç duyduğu izinleri istemeli.

**Why:** Otomatik Administrator yetkisi, botun güvenlik sınırını gereksiz biçimde genişletir ve sunucu sahibinin açık izin kararını yok sayar.

**How to apply:** Yeni özellik izin gerektiriyorsa ilgili Discord iznini hem komut içindeki bot-izin kontrolüne hem de sınırlı davet izinleri listesine ekle; Administrator kullanma.