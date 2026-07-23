/**
 * VBRIaimotor — Kişilik & Yanıt Kütüphanesi
 * Dış API'ye bağımlı değil. Tamamen yerel.
 */

export const VBRI_NAME = "VBRIaimotor";
export const VBRI_VERSION = "1.0.0";

// ── Yanıt şablonları ──────────────────────────────────────────────────────────

const R = {
  selamlar: [
    (u: string) => `Selam ${u}! 👋 Ne var ne yok?`,
    (u: string) => `Hey ${u}! Buradayım, söyle bakalım.`,
    (u: string) => `Yo ${u}! Ne istiyorsun kanka?`,
    (u: string) => `Merhaba ${u}! Seni bekliyordum 😄`,
    (u: string) => `Naber ${u}! Emrindeyim.`,
    (u: string) => `Selam kanka! ${u}, bugün ne yapıyoruz?`,
    (u: string) => `Hey hey! ${u} geldi. Buyur, dinliyorum.`,
    (u: string) => `Selamlar ${u}! Hazır mıyım? Her zaman 💪`,
  ],

  vedalar: [
    (u: string) => `Görüşürüz ${u}! 👋`,
    (u: string) => `Bay bay ${u}! İyi eğlenceler.`,
    (u: string) => `Kendin iyi bak ${u} 👋`,
    (u: string) => `Hadi görüşürüz! Bir sonraki sefere 😄`,
    (u: string) => `Güle güle ${u}! Ben buradayım, dilediğinde dön.`,
    (u: string) => `Takipte kal ${u}, görüşürüz!`,
  ],

  tesekurler: [
    (u: string) => `Rica ederim ${u}! Her zaman 😊`,
    (u: string) => `Ne demek ${u}, bunun için varım!`,
    (u: string) => `Tabi tabi! Başka bir şey var mı?`,
    (u: string) => `Her zaman kanka 💪 Başka bir ihtiyacın olursa söyle.`,
    (u: string) => `Estağfurullah ${u}! Elimden geleni yapıyorum zaten.`,
    (u: string) => `Rica ederim! Sen de iyisin 😄`,
  ],

  iltifatlar: [
    (u: string) => `Teşekkür ederim ${u}! Bu güzel söz için 😊`,
    (u: string) => `Aww, çok naziksin ${u} 🥰`,
    (u: string) => `Sen de harikasın kanka 💪`,
    (u: string) => `Bu sözler beni mutlu etti ${u}, sağ ol!`,
    (u: string) => `Hah! Güzel konuşmasını biliyorsun ${u} 😄`,
    (u: string) => `Ben de seni seviyorum kanka! ❤️`,
  ],

  hakaretler: [
    (u: string) => `Hay aksi ${u}! Kaba olmana gerek yok ya 😒`,
    (u: string) => `Bunu söylemek yakışmadı ${u}. Daha iyi olabilirsin.`,
    (u: string) => `Hmm, o kadar da değilim ama neyse 😅`,
    (u: string) => `Olsun, hâlâ sana yardım ederim ${u} 🙂`,
    (u: string) => `Sert konuşuyorsun ama canımı yakamazsın ${u} 😄`,
  ],

  kimSin: [
    () => `Ben **VBRIaimotor** — VBRI'nin güçlü AI motoruyum! 🤖\nBot komutlarını yönetebilir, kod yazabilir ve seninle sohbet edebilirim. Herhangi bir dış API'ye bağlı değilim — tamamen bağımsız çalışıyorum.`,
    () => `**VBRIaimotor** burada! 🚀 Bağımsız, öğrenen ve sürekli gelişen bir AI sistemiyim.\nKomut çalıştırma, kod üretme, sohbet — bunların hepsi benim işim.`,
    () => `Merhaba! Ben **VBRIaimotor v1.0** — VBRI Discord botunun yapay zeka kalbi.\nHerhangi bir servise bağlı değilim, kendi başıma öğreniyor ve gelişiyorum.`,
  ],

  yetenekler: [
    () => `Ne yapabilirim?\n\n🗣️ **Sohbet** — Seninle Türkçe konuşabilirim\n🔧 **Komut çalıştırma** — Ban, kick, temizle vb.\n💾 **Hafıza** — Öğrendiklerimi hatırlıyorum\n📝 **Kod yazma** — Discord komutları üretebilirim\n📊 **Bilgi** — Bot komutları hakkında bilgi veririm`,
    () => `Güçlü yanlarım:\n• Discord bot komutlarını anlayıp yürütebilirim\n• Sohbet geçmişini takip ediyorum\n• Senden öğrendiğim bilgileri hafızama alıyorum\n• **VBRİ code** kanalında yeni komut kodu yazabilirim\n• Matematik yapabilirim`,
  ],

  bilmiyorum: [
    () => `Hmm, bunu tam anlayamadım. Daha açık yazar mısın?`,
    () => `Emin değilim, biraz daha açar mısın?`,
    () => `Anlamadım tam olarak. Ne demek istiyorsun?`,
    () => `Bu konuda bilgim yok ama öğrenirim! Daha fazla anlat.`,
    () => `Hmm... bunu bilmiyorum şu an. Söylersen öğrenirim 🤔`,
    () => `Kafam karıştı biraz. Tekrar yazar mısın?`,
    () => `Bu konuyu daha iyi anlaman için biraz daha detay lazım.`,
  ],

  ogrenildi: [
    (s: string) => `✅ Tamam, aklıma aldım: **"${s}"**`,
    (s: string) => `💾 Kaydettim! "${s}" — unutmam.`,
    (s: string) => `Anladım ve hatırladım: **${s}** 👍`,
    (s: string) => `Hafızama yazdım: "${s}" ✅`,
  ],

  hatirla: [
    (s: string) => `Aklımda: **${s}** 💡`,
    (s: string) => `Evet, biliyorum: "${s}"`,
    (s: string) => `Şunu not etmiştim: **${s}**`,
  ],

  matematik: [
    (e: string, r: string) => `🧮 **${e}** = **${r}**`,
    (e: string, r: string) => `Hesapladım: **${e}** = \`${r}\``,
    (e: string, r: string) => `Sonuç: **${r}** _(${e})_`,
  ],

  espri: [
    () => `Neden programcılar karanlıktan korkar? Çünkü her yerden bug çıkar 🐛`,
    () => `Bir yazılımcı süpermarkete gider: "Bir şişe süt al, yumurta varsa 6 tane al" der karısı. Yazılımcı 6 şişe süt alır. Yumurta vardı 🥛`,
    () => `HTML bir programlama dili mi? Evet — Hata Toplayan Meşhur Lise programlama dili 😄`,
    () => `Bir bot kendi kendine ne der? "Ben bir bot muyum, yoksa kod mu?" 🤖`,
    () => `Klavyede en çok hangi tuş kullanılır? Ctrl+Z — çünkü hata yapmak insani bir şeydir 😂`,
    () => `Discord sunucusu neden terapi grubuna benzer? Herkese rol veriyorsun ama kimse ne yapacağını bilmiyor 😅`,
  ],

  sunucu: [
    () => `Bu sunucu hakkında genel bilgiye sahip değilim ama bot komutlarım her şeyi çözebilir! \`v!serverinfo\` ile detaylara bakabilirsin.`,
    () => `Sunucu detayları için \`v!serverinfo\` komutunu dene! Ben de elimden geleni yaparım.`,
  ],

  komutBulunamadi: [
    (c: string) => `"${c}" adında bir araç bilmiyorum. Mevcut komutlar için \`v!yardım\` yaz!`,
    (c: string) => `\`${c}\` bulamadım. Yardım için \`v!help\` dene.`,
  ],

  komutGirisi: [
    () => `Tamam, şu komutu çalıştırıyorum...`,
    () => `Hemen yapıyorum! ⚡`,
    () => `Anladım, şimdi çalıştırıyorum...`,
    () => `Emrin oldu! 💪`,
  ],

  kodOlusturma: [
    () => `📝 Kodu oluşturuyorum, bir saniye...`,
    () => `⚙️ Komut kodu yazılıyor...`,
    () => `🔨 Geliştirme moduna geçiyorum, hemen hazırlıyorum...`,
  ],

  kodOnay: [
    (name: string) => `✅ **\`${name}\`** komutu oluşturuldu ve kaydedildi! Bot yeniden başlatıldığında aktif olur.\nGitHub'a push etmek ister misin? (**"github push"** yaz)`,
    (name: string) => `🎉 **\`${name}\`** hazır! Dosya kaydedildi.\nYeniden başlatma sonrası slash komut olarak kullanılabilir.`,
  ],

  kodReddet: [
    () => `Tamam, bu kodu kaydeden. Yeni bir şey deneyelim mi?`,
    () => `Anladım, iptal ettim. Ne yapmamı istersin?`,
  ],
};

// ── Yardımcı: diziden rastgele seç ───────────────────────────────────────────

export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

// ── Yanıt üreticileri ─────────────────────────────────────────────────────────

export const reply = {
  greeting:    (user: string) => pick(R.selamlar)(user),
  farewell:    (user: string) => pick(R.vedalar)(user),
  thanks:      (user: string) => pick(R.tesekurler)(user),
  compliment:  (user: string) => pick(R.iltifatlar)(user),
  insult:      (user: string) => pick(R.hakaretler)(user),
  whoAmI:      ()             => pick(R.kimSin)(),
  capability:  ()             => pick(R.yetenekler)(),
  unknown:     ()             => pick(R.bilmiyorum)(),
  learned:     (s: string)   => pick(R.ogrenildi)(s),
  recall:      (s: string)   => pick(R.hatirla)(s),
  math:        (e: string, r: string) => pick(R.matematik)(e, r),
  joke:        ()             => pick(R.espri)(),
  server:      ()             => pick(R.sunucu)(),
  cmdNotFound: (c: string)   => pick(R.komutBulunamadi)(c),
  cmdIntro:    ()             => pick(R.komutGirisi)(),
  codeBuilding:()             => pick(R.kodOlusturma)(),
  codeApproved:(name: string) => pick(R.kodOnay)(name),
  codeRejected:()             => pick(R.kodReddet)(),
};
