import {
  ChatInputCommandInteraction, SlashCommandBuilder,
  ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType, User,
} from "discord.js";
import { getBalance, addCoins, takeCoins } from "../economy";

function sleep(ms: number) { return new Promise<void>((r) => setTimeout(r, ms)); }

// ── ANSI ─────────────────────────────────────────────────────────────────────
const E  = "\u001B";
const R  = `${E}[0m`;
const WB = `${E}[1;37m`;          // bold white  → kenarlık
const BK = `${E}[30;40m`;         // siyah/siyah → coin iç
const WO = `${E}[1;37;40m`;       // bold white + siyah bg → işaret

// ── Coin görünümleri (5 satır, sabit yükseklik = sütun senkronizasyonu) ──────
function coinFace(mark: string): string[] {
  return [
    `${WB}╭━━━━━━━━━━━╮${R}`,
    `${WB}┃${BK}███████████${WB}┃${R}`,
    `${WB}┃${BK}████${WO} ${mark.padEnd(1)} ${BK}████${WB}┃${R}`,
    `${WB}┃${BK}███████████${WB}┃${R}`,
    `${WB}╰━━━━━━━━━━━╯${R}`,
  ];
}

function coinEdge(w: number): string[] {
  const bar  = "━".repeat(w);
  const fill = "█".repeat(w);
  return [
    `${WB}╭${bar}╮${R}`,
    `${WB}┃${BK}${fill}${WB}┃${R}`,
    `${WB}┃${BK}${fill}${WB}┃${R}`,
    `${WB}┃${BK}${fill}${WB}┃${R}`,
    `${WB}╰${bar}╯${R}`,
  ];
}

// ── Canvas oluşturma ──────────────────────────────────────────────────────────
const CANVAS_H = 12; // ansi bloğunun toplam satır yüksekliği
const COIN_H   = 5;  // coin her zaman 5 satır

/**
 * coinLines: 5 elemanlı dizi
 * topOffset: 0 = tepe, 7 = dip (coin tam alta yapışık)
 */
function buildCanvas(coinLines: string[], topOffset: number): string {
  const rows: string[] = Array.from({ length: CANVAS_H }, () => "");
  for (let i = 0; i < COIN_H; i++) {
    const row = topOffset + i;
    if (row >= 0 && row < CANVAS_H) rows[row] = coinLines[i]!;
  }
  return rows.join("\n");
}

// ── OWO tarzı düşen animasyon (yerçekimi — hızlanan adımlar) ─────────────────
//   topOffset: 0 → 7,  coin spin: face ↔ edge alternatif
const FRAMES: { lines: string[]; top: number; delay: number }[] = [
  { lines: coinFace("?"),   top: 0, delay: 350 }, // tepede, yüz
  { lines: coinEdge(9),     top: 0, delay: 320 }, // döner, hâlâ tepede
  { lines: coinEdge(5),     top: 1, delay: 290 }, // ince, biraz aşağı
  { lines: coinEdge(1),     top: 2, delay: 270 }, // en ince kenar
  { lines: coinEdge(5),     top: 3, delay: 250 }, // açılıyor
  { lines: coinFace("?"),   top: 4, delay: 220 }, // yüz, ortada
  { lines: coinEdge(7),     top: 5, delay: 190 }, // hızlanıyor
  { lines: coinEdge(3),     top: 6, delay: 160 }, // çok hızlı
  { lines: coinEdge(9),     top: 7, delay: 130 }, // neredeyse yerde
];

export const data = new SlashCommandBuilder()
  .setName("coinflip")
  .setDescription("🪙 Para at — yazı mı tura mı?")
  .addIntegerOption((o) =>
    o.setName("miktar").setDescription("Bahis miktarı (min 10)").setMinValue(10).setRequired(true),
  )
  .addUserOption((o) =>
    o.setName("rakip").setDescription("1v1 rakip (boş = bota karşı)").setRequired(false),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ content: "❌ Sadece sunucularda çalışır.", ephemeral: true });
    return;
  }

  const bet      = interaction.options.getInteger("miktar", true);
  const opponent = interaction.options.getUser("rakip") as User | null;

  // ══════════════════════════════════════════════════════════════
  //  BOT VS KULLANICI
  // ══════════════════════════════════════════════════════════════
  if (!opponent || opponent.id === interaction.user.id || opponent.bot) {
    await interaction.deferReply();

    const bal = await getBalance(interaction.user.id);
    if (bal.coins < bet) {
      await interaction.editReply(`❌ **Yetersiz bakiye!** Bakiyen: **${bal.coins.toLocaleString("tr-TR")} ⬤V**`);
      return;
    }

    // Taraf seçimi
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("cf_yazi").setLabel("📜 Yazı").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("cf_tura").setLabel("🔘 Tura").setStyle(ButtonStyle.Primary),
    );
    await interaction.editReply({
      content: `🪙 **CoinFlip** — Bahis: **${bet.toLocaleString("tr-TR")} ⬤V**\n**Yazı mı, tura mı?** *(30 sn)*`,
      components: [row],
    });

    const msg = await interaction.fetchReply();
    let chosenSide: "yazi" | "tura" | null = null;
    try {
      const btn = await msg.awaitMessageComponent({
        componentType: ComponentType.Button,
        filter: (i) => i.user.id === interaction.user.id,
        time: 30_000,
      });
      chosenSide = btn.customId === "cf_yazi" ? "yazi" : "tura";
      await btn.deferUpdate();
    } catch {
      await interaction.editReply({ content: "⏰ **Süre doldu.** Coinflip iptal.", components: [] });
      return;
    }

    await interaction.editReply({ content: "🪙 Para havaya fırlatıldı!", components: [] });

    // ── OWO tarzı düşen animasyon ──────────────────────────────
    for (const frame of FRAMES) {
      await interaction.editReply({
        content: `**🪙 Para düşüyor...**\n\`\`\`ansi\n${buildCanvas(frame.lines, frame.top)}\n\`\`\``,
      });
      await sleep(frame.delay);
    }

    const result: "yazi" | "tura" = Math.random() < 0.5 ? "yazi" : "tura";
    const won = result === chosenSide;
    const mark = result === "yazi" ? "₺" : "V";
    const finalCanvas = buildCanvas(coinFace(mark), 7); // dibe yapışık

    let newBal: number;
    if (won) newBal = await addCoins(interaction.user.id, bet);
    else     newBal = await takeCoins(interaction.user.id, bet);

    const resultLabel = result === "yazi" ? "📜 Yazı" : "🔘 Tura";
    const choiceLabel = chosenSide === "yazi" ? "📜 Yazı" : "🔘 Tura";

    await interaction.editReply({
      content:
        `**${won ? "🎉 KAZANDIN!" : "💸 KAYBETTİN!"}**\n` +
        `\`\`\`ansi\n${finalCanvas}\n\`\`\`\n` +
        `> Para **${resultLabel}** düştü! Senin seçimin: **${choiceLabel}**\n\n` +
        `💰 Bahis: **${bet.toLocaleString("tr-TR")} ⬤V**  ${won ? "📈 **+" : "📉 **-"}${bet.toLocaleString("tr-TR")} ⬤V**\n` +
        `🏦 Yeni bakiye: **${newBal.toLocaleString("tr-TR")} ⬤V**`,
    });
    return;
  }

  // ══════════════════════════════════════════════════════════════
  //  1v1 MOD
  // ══════════════════════════════════════════════════════════════
  const bal1 = await getBalance(interaction.user.id);
  if (bal1.coins < bet) {
    await interaction.reply({
      content: `❌ Yetersiz bakiye! Bakiyen: **${bal1.coins.toLocaleString("tr-TR")} ⬤V**`,
      ephemeral: true,
    });
    return;
  }

  const acceptRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("cf1v1_accept").setLabel("✅ Kabul Et").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("cf1v1_decline").setLabel("❌ Reddet").setStyle(ButtonStyle.Danger),
  );
  await interaction.reply({
    content:
      `${opponent} — **${interaction.user.displayName}** sana coinflip daveti gönderdi!\n` +
      `💰 Bahis: **${bet.toLocaleString("tr-TR")} ⬤V** *(60 sn)*`,
    components: [acceptRow],
  });

  const msg = await interaction.fetchReply();
  try {
    const btn = await msg.awaitMessageComponent({
      componentType: ComponentType.Button,
      filter: (i) => i.user.id === opponent.id,
      time: 60_000,
    });
    if (btn.customId === "cf1v1_decline") {
      await btn.update({ content: `❌ **${opponent.displayName}** daveti reddetti.`, components: [] });
      return;
    }
    await btn.deferUpdate();
  } catch {
    await interaction.editReply({ content: "⏰ Süre doldu. Oyun iptal.", components: [] });
    return;
  }

  const bal2 = await getBalance(opponent.id);
  if (bal2.coins < bet) {
    await interaction.editReply({
      content: `❌ **${opponent.displayName}** bakiyesi yetersiz! (${bal2.coins.toLocaleString("tr-TR")} ⬤V)`,
      components: [],
    });
    return;
  }

  await interaction.editReply({ content: "🪙 Para havaya fırlatıldı!", components: [] });

  for (const frame of FRAMES) {
    await interaction.editReply({
      content: `**🪙 Para düşüyor...**\n\`\`\`ansi\n${buildCanvas(frame.lines, frame.top)}\n\`\`\``,
    });
    await sleep(frame.delay);
  }

  const winner = Math.random() < 0.5 ? interaction.user : opponent;
  const loser  = winner.id === interaction.user.id ? opponent : interaction.user;

  await addCoins(winner.id, bet);
  await takeCoins(loser.id,  bet);
  const winBal = await getBalance(winner.id);
  const losBal = await getBalance(loser.id);

  const finalCanvas = buildCanvas(coinFace("V"), 7);

  await interaction.editReply({
    content:
      `**🪙 1v1 CoinFlip Sonucu!**\n` +
      `\`\`\`ansi\n${finalCanvas}\n\`\`\`\n` +
      `🏆 **${winner.displayName}** kazandı!\n\n` +
      `> 🥇 **${winner.displayName}** → +${bet.toLocaleString("tr-TR")} ⬤V → **${winBal.coins.toLocaleString("tr-TR")} ⬤V**\n` +
      `> 💸 **${loser.displayName}** → -${bet.toLocaleString("tr-TR")} ⬤V → **${losBal.coins.toLocaleString("tr-TR")} ⬤V**`,
  });
}
