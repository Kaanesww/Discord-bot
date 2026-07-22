---
name: Bot komut mimarisi
description: index.ts yapısı, prefix handler pattern, yeni komut / özellik ekleme adımları
---

## Komut ekleme pattern'ı

1. `artifacts/api-server/src/bot/index.ts` içine `pfxXxx` async fonksiyon yaz
2. `prefixHandlers` objesine ekle (satır ~1737)
3. `vbriAI/knowledge.ts` COMMANDS dizisine bilgi ekle (yardım menüsü için)
4. AI ile çağrılabilmesi için `aiCommands.ts` BOT_TOOL_DECLARATIONS + switch case

## MessageCreate akışı (index.ts)
```
Bot mention? → handleAiMessage (aiChat.ts → vbriAI/engine.ts)
  ↓ hayır
Kod kanalı? → handleCodeMessage (codeEngine.ts) [bot sahibi only]
  ↓ hayır
Prefix? → prefixHandlers[cmd]()
  ↓ hayır
Guard kontrol → spam/link/emoji
XP işle
```

## DB değişikliği adımları
1. `lib/db/src/schema/YeniTablo.ts` yaz
2. `lib/db/src/schema/index.ts`'e `export * from "./YeniTablo"` ekle
3. `pnpm --filter @workspace/db run push`

## Build + restart
```bash
pnpm --filter @workspace/api-server run build
# Sonra "API Server" workflow'unu restart et
```

## Yetki kontrol fonksiyonları
- `isOwner(userId)` → ownerUtils.ts — bot sahibi (her şey yapabilir)
- `canUseMod(member, guildId, cmd)` → moderationSettings.ts — DB'deki rol izinleri
- Sunucu sahibi: `message.guild.ownerId === message.author.id`

## Görsel kart pattern'ı
```typescript
import { generateXxxCard } from "./xxxCard";
// @napi-rs/canvas kullanılıyor
const buf = await generateXxxCard({ ...opts });
await message.reply({ files: [new AttachmentBuilder(buf, { name: "xxx.png" })] });
```

## Why single index.ts
Kullanıcı tercihi — komutları ayrı dosyalara bölme. Büyük olsa da tek dosyada kalıyor.
Yeni feature'lar ayrı .ts dosyası olarak yazılıp index.ts'e import ediliyor.
