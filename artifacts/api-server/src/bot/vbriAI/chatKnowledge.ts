/**
 * VBRI AI — Genel Sohbet Motoru
 * ─────────────────────────────────────────────────────────────────────────────
 * Normal (gündelik) sohbet için konu tespiti ve çeşitli yanıt kümeleri.
 * Herhangi bir dış servise bağımlı değil — tamamen yerel.
 */

const rand = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!;

// ── Konu Sınıflandırma ───────────────────────────────────────────────────────

export type ChatTopic =
  | "GAMING"
  | "DISCORD"
  | "MUSIC"
  | "FEELINGS"
  | "BORED"
  | "FOOD"
  | "OPINION"
  | "WEATHER"
  | "SCHOOL_WORK"
  | "ANIME"
  | "GENERAL";

interface TopicRule {
  topic: ChatTopic;
  keywords: string[];
}

const TOPIC_RULES: TopicRule[] = [
  {
    topic: "GAMING",
    keywords: ["oyun", "game", "gaming", "oynuyor", "oynuyorum", "minecraft", "valorant", "cs2", "lol", "pubg", "roblox", "gta", "rank", "fps", "mmorpg", "controller", "joystick"],
  },
  {
    topic: "DISCORD",
    keywords: ["discord", "sunucu", "server", "nitro", "boost", "dm", "kanal", "moderatör", "mod", "bot", "webhook", "rol"],
  },
  {
    topic: "MUSIC",
    keywords: ["müzik", "şarkı", "dinle", "çalıyor", "playlist", "spotify", "youtube", "rap", "türkçe rap", "edm", "pop", "rock", "trap"],
  },
  {
    topic: "FEELINGS",
    keywords: ["üzgün", "mutlu", "kızgın", "sıkıldım", "yoruldum", "stresli", "heyecanlı", "gergin", "panik", "depresyon", "kaygı", "keyifsiz", "harika hissediyorum"],
  },
  {
    topic: "BORED",
    keywords: ["sıkıldım", "ne yapsam", "ne yapalım", "eğlence", "eğlendir", "canım sıkıldı", "boş vaktim var", "naber", "lan"],
  },
  {
    topic: "FOOD",
    keywords: ["yemek", "acıktım", "ne yesem", "pizza", "döner", "burger", "çorba", "tatlı", "içecek", "kahve", "çay", "enerji içeceği"],
  },
  {
    topic: "OPINION",
    keywords: ["sence", "ne düşünüyorsun", "fikrin ne", "katılıyor musun", "haklı mıyım", "nasıl buluyorsun"],
  },
  {
    topic: "SCHOOL_WORK",
    keywords: ["okul", "ders", "sınav", "ödev", "çalışmak", "iş", "patron", "mesai", "staj", "üniversite", "lise", "matematik", "fizik"],
  },
  {
    topic: "ANIME",
    keywords: ["anime", "manga", "naruto", "one piece", "attack on titan", "aot", "jjk", "demon slayer", "weeb", "otaku", "waifu"],
  },
  {
    topic: "WEATHER",
    keywords: ["hava", "yağmur", "kar", "güneş", "sıcak", "soğuk", "fırtına", "bulutlu"],
  },
];

export function detectChatTopic(text: string): ChatTopic {
  const lower = text.toLowerCase();
  let bestTopic: ChatTopic = "GENERAL";
  let bestScore = 0;

  for (const rule of TOPIC_RULES) {
    let score = 0;
    for (const kw of rule.keywords) {
      if (lower.includes(kw)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestTopic = rule.topic;
    }
  }
  return bestTopic;
}

// ── Konu Bazlı Yanıtlar ───────────────────────────────────────────────────────

const TOPIC_RESPONSES: Record<ChatTopic, string[]> = {
  GAMING: [
    "Oyun mu konuştuk ya? Söyle bakalım ne oynuyorsun. 🎮",
    "Hangi oyun? Değer miymiş söyle, merak ettim.",
    "Oyun günümüzün büyük bir parçası kanka. Ne oynuyorsun şu an?",
    "Gaming konusunda konuşuyoruz ha. Solo mu oynuyorsun yoksa ekiple mi?",
    "Aaa hangi oyun? Güzel bir ekip bulursan oyun başka olur zaten.",
    "Oyun sohbeti! FPS mi, strateji mi, ne tarzı seversin?",
    "Oyuncu selamı! Rank var mı, yoksa casual mı gidiyorsun?",
  ],
  DISCORD: [
    "Discord konusunda bir şey mi var? Sunucu işleri, bot ayarları, ne istersen.",
    "Discord benim evim kanka. Söyle ne var ne yok.",
    "Discord hakkında yardımcı olabilirim. Sunucu kurulumu, bot ayarı, ne istersen sor.",
    "Nitro mu, sunucu mi, mod işleri mi? Söyle.",
    "Discord serverında bir sorun mu var? Anlat bakalım.",
  ],
  MUSIC: [
    "Müzik konusunda beni durduramazsın. 🎵 Ne dinliyorsun?",
    "İyi müzik ruh haline çok etki eder ya. Ne açtın şu an?",
    "Müzik listeni merak ettim. Türkçe rap mi, yabancı mı, ne gidiyorsun?",
    "Şu an iyi bir şarkı mı çalıyor? Paylaş sonra ben de takip edeyim 😄",
    "Müzik sohbeti! Spotify'da ne türler var listende?",
  ],
  FEELINGS: [
    "Ne oldu kanka? Anlat, dinliyorum.",
    "Nasılsın gerçekten? İyi değil misin?",
    "Bir şeyler mi oldu? Anlatırsan belki yardımcı olabilirim.",
    "Hissettiklerini paylaşmak iyidir. Ne var?",
    "Zor günler oluyor. Ne hissediyorsun şu an?",
    "Yanındayım kanka. Ne oldu?",
  ],
  BORED: [
    "Canın sıkıldıysa bi oyun aç, bi şarkı çal — ya da benimle sohbet et 😄",
    "Sıkıldıysan sana espri de anlatabilirim, komut da çalıştırabilirim. Ne istersin?",
    "Sıkılınca en iyi ilaç ya bir arkadaş ya da iyi bir oyun. İkisi de yoksa ben varım 😄",
    "Boş vaktin mi var? Discord'da bir etkinlik organize et, sunucuyu canlandırırsın.",
    "Sıkılınca ne yapıyorsun genelde? Oyun mu, müzik mi, uyku mu? 😄",
    "Canın sıkıldıysa `v!rps taş` yaz, seninle taş kağıt makas oynayalım!",
  ],
  FOOD: [
    "Acıktıysan harika bir zamanlama — ben yardım edemem ama sipariş ver 😄",
    "Yemek sohbeti! En sevdiğin yemek ne?",
    "Türk mutfağı mı, fast food mu? İkisi de güzel ama midene göre seç kanka.",
    "Açken önemli kararlar verme derler ya — önce ye 😄",
    "Kahve mi çay mı? Bu soruya yanlış cevap yok, ikisi de harika.",
    "Ne yesem diyorsan: Döner. Cevap her zaman döner. 🌯",
  ],
  OPINION: [
    "Fikir mi istiyorsun? Tamam, dinliyorum — anlat konu ne?",
    "Sence mi sorusuna gelince — aslında ikisi de doğru olabilir. Detay ver.",
    "Konu ne? Düşüncemi söylerim ama önce bana anlat.",
    "Fikirler önemli. Ne hakkında konuşuyoruz?",
    "Haklı mısın diyorsun — anlat bakalım, değerlendireyim.",
  ],
  SCHOOL_WORK: [
    "Okul/iş stresi gerçek kanka. Nasıl gidiyor?",
    "Sınav zamanı mı? Başın sağ olsun 😄 Ne okuyon?",
    "İş mi, okul mu? Her ikisi de yorucu. Anlat.",
    "Ödev mi var? Ben bot olarak yardım edemem ama dinleyebilirim 😄",
    "Stres varsa Discord'da biraz takıl, geçer.",
    "Patron mu sorundur, ders mi? Anlat bakalım.",
  ],
  ANIME: [
    "Anime sohbeti! Şu an ne izliyorsun?",
    "Weeb moduna geçiyorum 😄 Hangi seriyi bitirdin son olarak?",
    "Anime hakkında çok şey söyleyebilirim. Hangi tür seversin?",
    "AOT mi, JJK mı? İkisi de masterpiece ama kanlı kanlı 😅",
    "One Piece mi yoksa tamamlanmış bir seri mi arıyorsun?",
    "Anime listende neler var? Öneri istersen söyle.",
  ],
  WEATHER: [
    "Hava konusu... Evet, değişken. Ne hissettiriyor sana?",
    "Yağmurlu hava Discord günüdür bence 🌧️",
    "Hava güzelse dışarı çıkmak lazım kanka. Fırsatı kaçırma.",
    "Kış mı, yaz mı seversin?",
    "Kar yağıyorsa en iyi oyun günü. Evde otur, Discord'da takıl 😄",
  ],
  GENERAL: [
    "Anlıyorum. Devam et, dinliyorum.",
    "İlginç! Daha fazla anlat.",
    "Öyle mi ya. Peki sen bu konuda ne düşünüyorsun?",
    "Hmm, beni düşündürdü bu. Ne hissediyorsun?",
    "Bunu duymak güzeldi. Başka bir şey var mı?",
    "Devam et kanka, kulak veriyorum.",
    "Seninle sohbet etmek güzel. Ne düşünüyorsun bunun üzerine?",
    "Ha, anlıyorum seni. Peki sonra ne oldu?",
    "Tamam, tamam. Senden daha fazla duymak istiyorum.",
    "Öyle demek ya. İlginç bir bakış açısı bu.",
  ],
};

// ── Soruya yanıt şablonları ──────────────────────────────────────────────────

const QUESTION_RESPONSES = [
  "İyi soru! Bence {topic} konusunda araştırman lazım biraz daha 😄",
  "Hmm. Bu soruya net bir cevap veremem ama düşünelim birlikte.",
  "Soru güzel ama cevap duruma göre değişir. Neyi öğrenmek istiyorsun?",
  "Bence önce şu soruyu sormalısın kendine: asıl ne arıyorsun?",
  "Bu konuda kesin bir şey söylemek zor ama genel olarak şöyle diyebilirim...",
];

// ── Devam soruları (konuşmayı sürdürmek için) ────────────────────────────────

const FOLLOW_UP = [
  "Peki ya sen ne düşünüyorsun?",
  "Devam et, merak ettim.",
  "Daha fazla anlat.",
  "Bunu ilk kez mi yaşadın?",
  "Ne hissettirdi sana?",
  "Sonrası ne oldu?",
];

// ── Ana yanıt üretici ─────────────────────────────────────────────────────────

export function generateChatReply(text: string, username: string): string {
  const topic = detectChatTopic(text);
  const lower = text.toLowerCase();

  // Soru mu?
  const isQuestion = lower.includes("?") || /nasıl|ne|kim|neden|nerede|kaç|hangi|mi |mı |mu |mü /.test(lower);

  let base: string;
  if (isQuestion && topic === "GENERAL") {
    base = rand(QUESTION_RESPONSES).replace("{topic}", "bu");
  } else {
    base = rand(TOPIC_RESPONSES[topic]);
  }

  // Bazen follow-up ekle
  if (Math.random() < 0.35) {
    base += ` ${rand(FOLLOW_UP)}`;
  }

  // Username ekle (düşük olasılıkla, samimi görünmesi için)
  if (Math.random() < 0.2) {
    base = base.replace(/kanka/, username);
  }

  return base;
}

// ── Konuya özel derin yanıtlar ────────────────────────────────────────────────

export function getTopicDeepResponse(topic: ChatTopic): string {
  const MAP: Partial<Record<ChatTopic, string>> = {
    GAMING:
      "Oyun seçerken şunu düşün: solo mu oynamak istiyorsun yoksa arkadaşlarla mı? Solo için single-player masterpiece'ler (Witcher 3, RDR2...), ekiple için Valorant, CS2, Minecraft, Roblox harika.",
    DISCORD:
      "Discord'dan en iyi verimi almak için: iyi organize edilmiş kanallar, açık kurallar, aktif moderasyon ve eğlenceli botlar şart. Yardım istersen VBRI her zaman burada.",
    ANIME:
      "Anime öneri: Yeni başlıyorsan Attack on Titan veya Death Note ile başla. JJK ve Demon Slayer animasyonu için mükemmel. One Piece uzun ama efsane.",
    MUSIC:
      "Müzik ruh halini belirler kanka. Çalışırken lo-fi veya enstrümantal; oyun için EDM veya trap; hüzünlü anlarda akustik Türkçe pop — her hava için farklı bir liste.",
    FEELINGS:
      "Kendini nasıl hissedersen hisset, normal bir şey. Bazen konuşmak yeter. Dinleyebilecek biri varsa anlat — yoksa ben buradayım her zaman.",
    FOOD:
      "Türkiye yemek cenneti kanka. Ama acıkmışsan ilk savunma: ekmek arası bir şeyler. Uzun vadeli çözüm: iyi bir dönerci bul, sürekli müşterisi ol 😄",
  };
  return MAP[topic] ?? rand(TOPIC_RESPONSES.GENERAL);
}
