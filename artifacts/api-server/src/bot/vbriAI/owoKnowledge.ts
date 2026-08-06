/**
 * OwO Bot — Kapsamlı Takım & Oyun Bilgi Tabanı
 * ─────────────────────────────────────────────────────────────────────────────
 * OwO botunun tüm önemli mekaniklerini, hayvan tierlarını, en iyi takım
 * kombinasyonlarını ve strateji ipuçlarını içerir.
 */

// ── Hayvan Tier Listesi ───────────────────────────────────────────────────────

export const OWO_TIERS = {
  mythical: {
    label: "🌟 Mythical (En Yüksek Tier)",
    animals: [
      { name: "Gleipnir", note: "En iyi savaş hayvanlarından biri. Yüksek ATK ve güçlü skill." },
      { name: "Nyan Cat", note: "İkonik mythical. Yüksek stats." },
      { name: "Owo", note: "Botun sembolü. Çok güçlü." },
      { name: "Rawr", note: "Yüksek HP + ATK dengesi." },
      { name: "Lootbox", note: "Özel mythical, iyi stats." },
      { name: "Cat God", note: "Çok nadir, güçlü." },
    ],
  },
  fabled: {
    label: "💜 Fabled",
    animals: [
      { name: "Chimera", note: "Yüksek ATK, takım linchpin'i olabilir." },
      { name: "Phoenix", note: "Heal skill'i sayesinde sürdürülebilirlik sağlar." },
      { name: "Kirin", note: "Dengeli stats, güvenilir seçenek." },
      { name: "Leviathan", note: "Yüksek HP, tank rolü için ideal." },
    ],
  },
  legendary: {
    label: "🟡 Legendary",
    animals: [
      { name: "Dragon", note: "Güçlü ATK, erken-mid game için çok iyi." },
      { name: "Unicorn", note: "Magic türü, iyi skill." },
      { name: "Gryphon", note: "Pierce + yüksek ATK kombinasyonu." },
      { name: "Cerberus", note: "Çoklu saldırı skill'i var." },
      { name: "Manticore", note: "Yüksek hasar." },
    ],
  },
  epic: {
    label: "🔵 Epic",
    animals: [
      { name: "Wolf", note: "Hızlı saldırı, gruba sinerji." },
      { name: "Tiger", note: "Yüksek ATK, güvenilir." },
      { name: "Lion", note: "Dengeli, mid-game solid seçenek." },
      { name: "Bear", note: "Yüksek HP, dayanıklı." },
    ],
  },
};

// ── En İyi Takım Kompozisyonları ─────────────────────────────────────────────

export const OWO_TEAMS = [
  {
    name: "☆ Endgame Rüya Takım (Tam Mythical)",
    tier: "mythical",
    composition: ["Gleipnir", "Owo", "Nyan Cat"],
    strategy:
      "Tüm hayvanlar mümkün olan en yüksek rankta (F+) olmalı. Gleipnir ön sırada ATK görevi üstlenir, Owo orta sırada genel hasar verir, Nyan Cat arka destek/hasar. Tüm slotlara en iyi gem'leri tak.",
    pros: "Rakip olan herkesi ezer. Savaş listesinde üst sıralara çıkarsın.",
    cons: "Ulaşması çok zor — onlarca hunt ve zoo gerektirir.",
  },
  {
    name: "⚡ Endgame Hibrit (Mythical + Fabled)",
    tier: "mixed",
    composition: ["Gleipnir", "Phoenix", "Chimera"],
    strategy:
      "Phoenix'in heal skill'i takımı uzun savaşlarda ayakta tutar. Gleipnir + Chimera ana hasar kaynaklarıdır. Bu kompo özellikle boss savaşlarında çok etkilidir.",
    pros: "Sürdürülebilirlik. Phoenix heal sayesinde uzun battlelarda avantaj.",
    cons: "Gleipnir yoksa Owo veya Rawr ile değiştir.",
  },
  {
    name: "🛡️ Tank + DPS (Mid-Late Game)",
    tier: "mixed",
    composition: ["Leviathan", "Dragon", "Gryphon"],
    strategy:
      "Leviathan tank olarak öne çıkar, Dragon ve Gryphon hasar verir. Leviathan'ı en çok upgrate et. Dragon'u rank A'ya çıkarman yeterli.",
    pros: "Bulunması görece daha kolay hayvanlar. İyi bir denge.",
    cons: "Tam mythical takımlara karşı zorlanabilir.",
  },
  {
    name: "⚔️ Full Saldırı (Erken-Mid Game)",
    tier: "epic-legendary",
    composition: ["Dragon", "Tiger", "Wolf"],
    strategy:
      "Üç hasar odaklı hayvan. Yavaş başla, hepsini rank B-A'ya çıkar. Silah olarak hepsine pierce veya slash tak.",
    pros: "Hızlı levelleme için ideal. Savaşlarda agresif.",
    cons: "Heal yok, uzun savaşlarda kaybedebilirsin.",
  },
];

// ── Hayvan Stat Sistemi ──────────────────────────────────────────────────────

export const OWO_STATS = `
**OwO Hayvan Stat Sistemi:**

• **HP** — Hayvanın can puanı. Yüksek HP = daha dayanıklı
• **ATK** — Saldırı gücü. Ana hasar kaynağı
• **WPN** — Silah türü bonusu

**Rank Sistemi (Düşükten Yükseğe):**
Z → E → D → C → B → A → S → SS → SSS → F → F+ (MAX)

Hayvanını ne kadar üst ranka çıkarırsan stats o kadar artar. Endgame için **F+** hedefe ulaş.
`;

// ── Silah (Weapon) Türleri ───────────────────────────────────────────────────

export const OWO_WEAPONS = `
**OwO Silah Türleri:**

⚔️ **Slash** — Genel hasar. En dengeli tür.
🏹 **Pierce** — Düşük savunmalı rakiplere çok etkili.
🔨 **Blunt** — Ağır, AoE tarzı hasar.
✨ **Magic** — Yüksek hasar, bazı hayvanlarla sinerji.
🌿 **Elem (Elemental)** — Özel efektler.
➖ **None** — Silah yok, düşük WPN bonusu.

**Öneri:** Hayvanının skill türüne uygun silah seç. Dragon için Slash veya Pierce idealdir.
`;

// ── Skill Sistemi ────────────────────────────────────────────────────────────

export const OWO_SKILLS = `
**OwO Skill Sistemi:**

Her hayvanın kendine özgü skill'i vardır. Skill'ler savaşta otomatik tetiklenir.

🔴 **Saldırı Skills'leri** — Ekstra hasar verir (örn. Dragon Breath, Claw Strike)
💚 **Heal Skills'leri** — Takım HP'si iyileştirir (örn. Phoenix Heal)
🔵 **Buff Skills'leri** — ATK veya savunma artırır
⚡ **Multi-hit Skills'leri** — Birden fazla vuruş yapar

**İpucu:** Takımında en az 1 heal skill'li hayvan bulundurmak uzun savaşlarda çok işe yarar (Phoenix bunun için idealdir).
`;

// ── Hunting Stratejisi ───────────────────────────────────────────────────────

export const OWO_HUNTING = `
**OwO Hunt Stratejisi:**

🎯 **Temel Komutlar:**
• \`owo hunt\` — Rastgele hayvan avla
• \`owo battle\` — Savaş — XP ve coin kazan
• \`owo zoo\` — Zoodaki hayvanlarını gör
• \`owo profile\` — Profil, gem ve stats
• \`owo upgrade\` — Hayvan rankını artır

📈 **Verimli Farming:**
1. \`owo hunt\` ile sürekli hayvan topla
2. Düşük tier hayvanları \`owo sacrifice\` ile kurban ver
3. Kazandığın cowonol ile gem satın al
4. Gem'leri en güçlü hayvanlarına tak
5. Hayvanları rank up yap — önce en güçlüyü F+'a çıkar

💡 **İpuçları:**
• Checklist ile hayvan avlamak daha verimli (\`owo checklist\`)
• Daily reward'ları kaçırma (\`owo daily\`)
• Zoo'ndaki hayvanları rank up yapmak stats artırır
• Battle ile XP kazan, level atla
`;

// ── Gem Sistemi ──────────────────────────────────────────────────────────────

export const OWO_GEMS = `
**OwO Gem Sistemi:**

Gem'ler hayvanlarına slot başına takılır ve stats artırır.

💎 **Gem Türleri (Kaliteye göre):**
• **Faint** — En zayıf
• **Common** — Başlangıç
• **Uncommon** — İdare eder
• **Rare** — Ciddi stat artışı
• **Epic** — Güçlü
• **Legendary** — Endgame
• **Mythical** — En iyi, çok nadir

**Öneri:** Tüm gem slotlarını doldur. En güçlü hayvanlarına en yüksek rarity gem'leri tak. Legendary/Mythical gem'leri asla düşük tier hayvanlara takma.
`;

// ── Sık Sorulan Sorular (FAQ) ────────────────────────────────────────────────

export const OWO_FAQ: Array<{ q: string; a: string }> = [
  {
    q: "en iyi hayvan hangisi",
    a: "Genel olarak **Gleipnir** en güçlü savaş hayvanı sayılır. Onun dışında **Owo**, **Nyan Cat** ve **Rawr** de mythical tier'da çok güçlüdür. Erişimin varsa **Phoenix** (fabled) heal skill'i sayesinde taktik önemi çok yüksektir.",
  },
  {
    q: "başlangıç için en iyi takım",
    a: "Başlangıçta sahip olduğun en yüksek rarity hayvanları kullan. **Dragon + Tiger + Wolf** (epic/legendary karışımı) sağlam bir başlangıç takımıdır. Önce bunları rank B-A'ya çıkar, sonra mythical peşine düş.",
  },
  {
    q: "takıma kaç hayvan girer",
    a: "OwO savaş takımı **3 hayvan** üzerine kurulu. Sıralama önemlidir: birinci hayvan öne çıkar ve genellikle en fazla saldırıyı o alır.",
  },
  {
    q: "rank nasıl artırılır",
    a: "`owo upgrade [hayvan adı]` komutuyla hayvanını rankla. Gerekli malzemeleri biriktirir ve cowonol harcarsın. Her rank step'i stats'ı önemli ölçüde artırır. F+ hedefe ulaş.",
  },
  {
    q: "en hızlı nasıl güçlenirim",
    a: "1) Sürekli hunt yap 2) Düşük tier hayvanları sacrifice et 3) Cowonol ile gem al 4) Güçlü hayvanlara gem tak 5) Rank up yap. Daily reward'ları ve checklist görevlerini kaçırma.",
  },
  {
    q: "hangi silah en iyi",
    a: "Hayvana göre değişir ama genel olarak **Slash** en dengeli tercihtir. Yüksek ATK'lı hayvanlara **Pierce** iyi gelir. Magic türü hayvanlara **Magic** silah tak.",
  },
  {
    q: "battle nasıl kazanılır",
    a: "1) Rakibinden yüksek rarity/rank hayvanlar seç 2) Takımında heal skill'li bir hayvan bulundur (Phoenix gibi) 3) Tüm gem slotlarını doldur 4) Silah ekle. Stats farkı yüksekse battle matematiği seni kazandırır.",
  },
  {
    q: "zoo ne işe yarar",
    a: "`owo zoo` ile sahip olduğun hayvanları listelersin. Zoo'ndaki hayvanları rank up yapman, hem savaşta kullanman hem de sererler (passive) için önemlidir.",
  },
];

// ── Arama fonksiyonu ─────────────────────────────────────────────────────────

export function findOwoAnswer(query: string): string | null {
  const lower = query.toLowerCase();

  // FAQ eşleşmesi
  for (const item of OWO_FAQ) {
    const keys = item.q.split(" ");
    const matchCount = keys.filter((k) => lower.includes(k)).length;
    if (matchCount >= Math.ceil(keys.length * 0.5)) {
      return item.a;
    }
  }

  // Konuya göre yönlendirme
  if (/weapon|silah|wpm|wpn/.test(lower)) return OWO_WEAPONS;
  if (/skill|yetenek|heal/.test(lower)) return OWO_SKILLS;
  if (/gem|taş|slot/.test(lower)) return OWO_GEMS;
  if (/hunt|av|farming|farm/.test(lower)) return OWO_HUNTING;
  if (/rank|upgrade|level|yükselt/.test(lower)) return OWO_STATS;

  return null;
}

// ── Takım önerisi üretici ────────────────────────────────────────────────────

export function buildTeamRecommendation(query: string): string {
  const lower = query.toLowerCase();

  // Tier bazlı öneri
  const isEarly  = /yeni başl|başlangıç|erken|early|ilk/.test(lower);
  const isMid    = /orta|mid|epic|legendary/.test(lower);
  const isEnd    = /endgame|en iyi|güçlü|mythical|fabled|max/.test(lower);
  const isBoss   = /boss|zor|uzun savaş|survive|heal/.test(lower);

  let selected = OWO_TEAMS;
  if (isEarly)      selected = OWO_TEAMS.filter((t) => t.tier === "epic-legendary");
  else if (isMid)   selected = OWO_TEAMS.filter((t) => t.tier === "mixed" || t.tier === "epic-legendary");
  else if (isEnd)   selected = OWO_TEAMS.filter((t) => t.tier === "mythical" || t.tier === "mixed");
  else if (isBoss)  selected = OWO_TEAMS.filter((t) => t.composition.includes("Phoenix") || t.composition.includes("Gleipnir"));

  if (selected.length === 0) selected = OWO_TEAMS;

  const lines: string[] = ["**🦊 OwO Bot — Takım Önerim:**\n"];

  for (const team of selected.slice(0, 2)) {
    lines.push(`**${team.name}**`);
    lines.push(`> Hayvanlar: ${team.composition.map((a) => `\`${a}\``).join(" · ")}`);
    lines.push(`> Strateji: ${team.strategy}`);
    lines.push(`> ✅ Avantaj: ${team.pros}`);
    lines.push(`> ⚠️ Dezavantaj: ${team.cons}`);
    lines.push("");
  }

  lines.push("💡 Daha fazla detay için şunu sor: *\"OwO gem sistemi\"*, *\"OwO rank nasıl artırılır\"*, *\"OwO silah türleri\"*");

  return lines.join("\n");
}

// ── Tier listesi özeti ───────────────────────────────────────────────────────

export function buildTierList(): string {
  const lines = ["**🏆 OwO Bot Hayvan Tier Listesi:**\n"];
  for (const [, tier] of Object.entries(OWO_TIERS)) {
    lines.push(`${tier.label}`);
    for (const a of tier.animals) {
      lines.push(`• **${a.name}** — ${a.note}`);
    }
    lines.push("");
  }
  lines.push("*Not: Tier'lar genel güce göre sıralanmıştır. Rank ve gem'ler sonucu büyük ölçüde etkiler.*");
  return lines.join("\n");
}
