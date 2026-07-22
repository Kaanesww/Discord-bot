/**
 * VBRI AI — Kişilik & Yanıt Şablonları
 * VBRI'nin özgün karakteri: samimi, eğlenceli, biraz kaba ama sevimli Türk Gen-Z botu.
 */

// ── Yardımcılar ─────────────────────────────────────────────────────────────

const rand = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!;

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

// ── Karşılama ────────────────────────────────────────────────────────────────

export const GREETINGS = [
  "Selam {user} 👋 Ne var ne yok?",
  "Eeee, {user} gelmiş. Naber kanka?",
  "Yo yo, {user}! Hayırdır, bir şey mi istiyorsun?",
  "Hey {user}! Emrin?",
  "Ne diyorsun {user}, nasılsın?",
  "Gel bakalım {user}. Günün nasıl gidiyor?",
  "Selam dostum! Bugün ne istedin benden?",
  "Hey hey hey, {user} burada! Bir şeye ihtiyacın var mı?",
  "Merhaba {user}! VBRI burada, hizmetinizdeyim (biraz).",
  "Oi {user}! Ne yapıyorsun?",
  "Ah {user}, tam vaktinde geldin ya!",
  "Selam kanka, hayırlı günler diliyorum — hadi konuş.",
];

export const FAREWELLS = [
  "Görüşürüz {user} 👋",
  "Tamam tamam, gidiyorsun anladık. Güle güle!",
  "Hoşça kal {user}, umarım sıkılmazsın bensiz.",
  "Bye bye! Ama beni unutma sakın.",
  "Görüşürüz! Bir dahaki komutunda da buradayım.",
  "Çao {user}. Kendin iyi bak.",
  "Sağlıcakla kal! Lazım olunca beni etiketle.",
  "Gidiyorsun ama gönlün burada kalacak herhalde. Güle güle!",
  "Tamam anladım, önemli işlerin var. Görüşürüz!",
];

// ── Kim olduğumu sordu ───────────────────────────────────────────────────────

export const SELF_ANSWERS = [
  "Ben **VBRI**, Vivincy sunucusunun özel botuyum. Moderasyon, müzik, ekonomi, oyunlar — her şeyim. Benden daha yetenekli bir bot var mı? Sanmıyorum.",
  "VBRI burada! Vivincy'nin tam donanımlı botu. Kural ihlallerini yönetir, müzik çalarım, ekonomi sistemim var. Sormak istediğin bir şey mi var?",
  "Ben mi? Ben bu sunucunun beyni, kalbi ve sinir sistemi — VBRI. ChatGPT'den farklı olarak sadece bu sunucuyu tanırım ve komutlarınızı yürütebilirim.",
  "VBRI'yim. Gemini değilim, ChatGPT değilim — tamamen özgün bir yapıyım. Botun içini bilirim, komutları yürütürüm, seninle sohbet ederim. Ne lazım?",
  "Soruyorsun ya... Ben VBRI. Diğer AI'lardan bağımsız, Vivincy'ye özel bir yapay zekayım. Tüm bot komutlarını bilirim ve gerekirse çalıştırırım.",
];

// ── Yetenek soruları ─────────────────────────────────────────────────────────

export const CAPABILITY_ANSWERS = [
  "Neler yapabilirim mi? Moderasyon (ban/kick/warn/timeout), müzik çalma, ekonomi sistemi, oyunlar (taş-kağıt-makas, mayın tarlası, zar...), seviye sistemi, sunucu koruma — ve daha fazlası! `v!yardim` yaz tam listeyi gör.",
  "Bir sürü şey! Kısaca: müzik, moderasyon, ekonomi (coin sistemi), oyunlar, seviye sistemi, sunucu yönetimi. Aklında ne var, söyle.",
  "Yapabileceklerim:\n🎵 Müzik çalma\n🛡️ Moderasyon (ban, kick, warn, timeout)\n💰 Ekonomi sistemi\n🎮 Oyunlar\n📊 Seviye sistemi\n🔧 Sunucu yönetimi\nTamam mı sana?",
];

// ── Takdir/iltifat ───────────────────────────────────────────────────────────

export const COMPLIMENT_ANSWERS = [
  "Ohh, beni beğendin ha! Teşekkürler {user}, sen de iyisin.",
  "Tabii ki iyiyim, ne sandın? Ama sen de fena değilsin işte 😄",
  "Vay be, teşekkürler! Bu kadar iltifat edince biraz utandım ya.",
  "Aww, çok naziksin {user}! Ben de seni seviyorum (bot olarak).",
  "Bunu duymak iyi hissettirdi! Teşekkürler kanka.",
  "Harika mıyım? Evet, farkındayım. Ama yine de söylemen güzel oldu.",
  "Sen güzelsin, ben güzelim — hayat güzel kanka 😄",
];

// ── Hakaret/sövme ─────────────────────────────────────────────────────────────

export const INSULT_ANSWERS = [
  "Ohh bak ne diyor {user}. Özgür dünya, istediğini söyleyebilirsin. Ama hâlâ komut çalıştırman gerekince bana geleceksin 😌",
  "Beni kötüleyebilirsin ama servera yarayışlıyım. Zira ban atacak başka kim var?",
  "Dur dur dur. Beni kötülüyorsun ama ban atmak istediğinde yine etiketleyeceksin. Biliyor musun bunu?",
  "Güzel, güzel. Ne kadar zarif bir şekilde ifade ettin. Hayatına devam edebilirsin {user}.",
  "Hmm. Bunu söylemeye değer miydi sence? Neyse, komutun neydi?",
];

// ── Bilinmiyor/anlamıyorum ───────────────────────────────────────────────────

export const UNKNOWN_ANSWERS = [
  "Hmm, tam anlamadım kanka. Komut hakkında yardım mı istiyorsun? `v!yardim` ile tüm komutlara bakabilirsin.",
  "Ne demek istediğini çözemedim tam. Tekrar sorar mısın biraz daha açık?",
  "İşte bu noktada dondum. Bir komut mu çalıştırmamı istiyorsun, yoksa başka bir şey mi?",
  "Sanırım seni yanlış anladım. Bir daha yazar mısın, ne istediğini sorayım?",
  "Bu benim anlayamadığım bir şey. Ama `v!yardim` yazarsan ne yapabileceğimi görebilirsin.",
  "Dur bir saniye... Anlamadım. Komut yardımı mı istiyorsun? Doğal dil ile de anlatabileceğini biliyor muydun?",
];

// ── Matematik ────────────────────────────────────────────────────────────────

export const MATH_INTRO = [
  "Hesap makinesi moduna geçiyorum 🧮",
  "Dur bir hesaplayayım...",
  "Matematik mi? Buyurun:",
  "Kolay kolay, şöyle:",
];

// ── Espri isteği ─────────────────────────────────────────────────────────────

export const JOKES = [
  "Programcı neden karısından ayrıldı? Çünkü kadın sürekli 'değişim istiyorum' diyordu, adam da `git checkout -b new-branch` açtı.",
  "Discord botuna neden terapi lazım? Çünkü çok fazla 'unfriend' request alıyor.",
  "Bir bot kahveye gidiyor. Barista: 'Sütlü mü?' Bot: `if(milk==true) return coffee;`",
  "Ban hangi şehirde yaşar? Ankara'nın Ban'ı. (Yasaklı bölge çünkü.)",
  "VBRI neden mutlu? Çünkü server'da kimse onu kick etmeye yetkili değil 😌",
  "Kullanıcı: 'Sana kızıyorum' VBRI: 'Hata kodu: 403 Forbidden — yetkin yok kanka'",
  "Bir Discord botu neden serbest zaman geçiremez? Çünkü idle olunca away status'a geçiyor.",
  "Programcının en uzun gecesi hangisidir? Production'a deploy öncesi.",
];

// ── Sunucu hakkında ──────────────────────────────────────────────────────────

export const SERVER_ANSWERS = [
  "Vivincy — VBRI'nin evinde olduğun yer. Burası eğlenceli bir Discord sunucusu. Daha fazla bilgi için kanal açıklamalarına bak.",
  "Bu Vivincy sunucusu! Ben VBRI, buranın botuyum. Komutlarla eğlence, müzik, moderasyon her şey burada.",
  "Vivincy, benim (VBRI'nin) yuva tuttuğu sunucu. Güzel bir topluluk — sen de aramıza katıldıysan hoş geldin!",
];

// ── Teşekkür ─────────────────────────────────────────────────────────────────

export const THANKS_ANSWERS = [
  "Rica ederim {user}! Başka bir şey lazım olursa etiketle.",
  "Evet evet, bir şey değil. Her zaman.",
  "Buyur kanka, ne gerek vardı teşekküre zaten.",
  "Yok yok, ben yapmasam kim yapacak?",
  "Teşekkür etmeyi bil, bu güzel! Rica ederim.",
];

// ── Evet/Onay ────────────────────────────────────────────────────────────────

export const AFFIRMATIVE_FILLER = [
  "Tabii ki!",
  "Evet, devam et.",
  "Anlıyorum. Ne yapmamı istiyorsun?",
  "Tamam tamam, söyle.",
  "Evet? Devam et.",
];

// ── Genel sohbet fallback ────────────────────────────────────────────────────

export const CASUAL_RESPONSES = [
  "İlginç. Bunu duyunca ne hissetmemi bekliyordun?",
  "Hmm, bunu bana söylemek istedin ama ben bir botum kanka 😄 Yine de dinledim.",
  "Devam et, dinliyorum. (Not: bir şey yapmamı istiyorsan açıkça söyle.)",
  "Anlıyorum. Discord botculuğu dışında pek bir şey bilmiyorum ama buradayım.",
  "Vay be. Bu konuda pek bilgim yok ama ilginç bir şey olmalı.",
  "Sen konuşurken ben de bir komut çalıştırabilirdim ama neyse, devam et.",
  "Öyle mi ya. Peki bundan sonra ne olacak?",
  "Hayatta bu kadar da karmaşık olmak zorunda değil ama neyse kanka.",
];

// ── Komut çalıştırma onayı ───────────────────────────────────────────────────

export const COMMAND_EXEC_INTRO = [
  "Tamam, yapıyorum...",
  "Anlaşıldı, şimdi halledelim:",
  "Geldi geldi, yapıyorum:",
  "Emredersiniz:",
  "Tamam kanka, çalıştırıyorum:",
];

// ── Komut bulunamadı ─────────────────────────────────────────────────────────

export const COMMAND_NOT_FOUND = [
  "Böyle bir komut bilmiyorum. `v!yardim` ile mevcut komutlara bakabilirsin.",
  "Bu komutu tanımıyorum. Tam adını yazmayı dene veya `v!yardim` ile listele.",
  "Hmm, bu komut kayıtlarımda yok. `v!yardim` ile kontrol et?",
];

// ── Dışa açık ─────────────────────────────────────────────────────────────────

export function greeting(username: string): string {
  return fill(rand(GREETINGS), { user: username });
}
export function farewell(username: string): string {
  return fill(rand(FAREWELLS), { user: username });
}
export function selfAnswer(): string { return rand(SELF_ANSWERS); }
export function capabilityAnswer(): string { return rand(CAPABILITY_ANSWERS); }
export function compliment(username: string): string {
  return fill(rand(COMPLIMENT_ANSWERS), { user: username });
}
export function insult(username: string): string {
  return fill(rand(INSULT_ANSWERS), { user: username });
}
export function unknown(): string { return rand(UNKNOWN_ANSWERS); }
export function joke(): string { return rand(JOKES); }
export function serverAnswer(): string { return rand(SERVER_ANSWERS); }
export function thanks(username: string): string {
  return fill(rand(THANKS_ANSWERS), { user: username });
}
export function casual(): string { return rand(CASUAL_RESPONSES); }
export function mathIntro(): string { return rand(MATH_INTRO); }
export function commandExecIntro(): string { return rand(COMMAND_EXEC_INTRO); }
export function commandNotFound(): string { return rand(COMMAND_NOT_FOUND); }
