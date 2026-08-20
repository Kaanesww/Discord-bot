/**
 * VBRIaimotor — Araç Tanımları (Gemini Function Calling)
 * Mevcut aiCommands.ts üzerinden yetki kontrollü işlemleri yürütür.
 */

/** Gemini function declaration formatında araç listesi */
export const VBRI_TOOL_DECLARATIONS = [
  {
    name: "temizle",
    description: "Mevcut metin kanalından belirtilen sayıda mesajı siler. Kullanıcının 'temizle' yetkisi olmalı.",
    parameters: {
      type: "object",
      properties: {
        count: { type: "number", description: "Silinecek mesaj sayısı (1-100 arası)." },
      },
      required: ["count"],
    },
  },
  {
    name: "ban",
    description: "Bir kullanıcıyı sunucudan yasaklar. 'ban' yetkisi gerekir.",
    parameters: {
      type: "object",
      properties: {
        userId: { type: "string", description: "Banlanacak kullanıcının Discord ID'si." },
        reason: { type: "string", description: "Ban sebebi." },
      },
      required: ["userId"],
    },
  },
  {
    name: "kick",
    description: "Bir kullanıcıyı sunucudan atar. 'kick' yetkisi gerekir.",
    parameters: {
      type: "object",
      properties: {
        userId: { type: "string", description: "Atılacak kullanıcının Discord ID'si." },
        reason: { type: "string", description: "Atma sebebi." },
      },
      required: ["userId"],
    },
  },
  {
    name: "warn",
    description: "Bir kullanıcıyı uyarır ve kayıt oluşturur. 'warn' yetkisi gerekir.",
    parameters: {
      type: "object",
      properties: {
        userId: { type: "string", description: "Uyarılacak kullanıcının Discord ID'si." },
        reason: { type: "string", description: "Uyarı sebebi." },
      },
      required: ["userId"],
    },
  },
  {
    name: "timeout",
    description: "Bir kullanıcıyı susturur. 'timeout' yetkisi gerekir.",
    parameters: {
      type: "object",
      properties: {
        userId:   { type: "string", description: "Susturulacak kullanıcının ID'si." },
        duration: { type: "string", description: "Süre: 10m, 1sa, 2g gibi." },
        reason:   { type: "string", description: "Sebep." },
      },
      required: ["userId", "duration"],
    },
  },
  {
    name: "kilitle",
    description: "Mevcut kanalı kilitler. 'mute' yetkisi gerekir.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "ac",
    description: "Kilitli kanalı açar. 'mute' yetkisi gerekir.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "nuke",
    description: "Kanalı tamamen siler ve yeniden oluşturur. Yalnızca sunucu sahibi/Admin.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "setprefix",
    description: "Botun prefix'ini değiştirir. Yalnızca sunucu sahibi.",
    parameters: {
      type: "object",
      properties: {
        prefix: { type: "string", description: "Yeni prefix (ör: !, ?, v!)" },
      },
      required: ["prefix"],
    },
  },
  {
    name: "modsetup_ac",
    description: "Moderasyon sistemini aktif eder. Yalnızca sunucu sahibi.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "modsetup_kapat",
    description: "Moderasyon sistemini kapatır. Yalnızca sunucu sahibi.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "modsetup_log",
    description: "Moderasyon log kanalını ayarlar. Yalnızca sunucu sahibi.",
    parameters: {
      type: "object",
      properties: {
        channelId: { type: "string", description: "Log kanalının ID'si." },
      },
      required: ["channelId"],
    },
  },
  {
    name: "modsetup_rol_ekle",
    description: "Bir role moderasyon komutu yetkisi verir. Yalnızca sunucu sahibi.",
    parameters: {
      type: "object",
      properties: {
        cmd:    { type: "string", description: "Komut adı: ban, kick, warn, timeout, mute, temizle" },
        roleId: { type: "string", description: "Rol ID'si." },
      },
      required: ["cmd", "roleId"],
    },
  },
  {
    name: "modsetup_rol_kaldir",
    description: "Bir rolün moderasyon yetkisini kaldırır. Yalnızca sunucu sahibi.",
    parameters: {
      type: "object",
      properties: {
        cmd:    { type: "string", description: "Komut adı." },
        roleId: { type: "string", description: "Rol ID'si." },
      },
      required: ["cmd", "roleId"],
    },
  },
  {
    name: "modsetup_durum",
    description: "Moderasyon sistemi durumunu gösterir.",
    parameters: { type: "object", properties: {}, required: [] },
  },
];
