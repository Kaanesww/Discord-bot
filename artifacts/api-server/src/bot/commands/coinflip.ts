import {
  ChatInputCommandInteraction, SlashCommandBuilder,
  ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType, User,
} from "discord.js";
import { getBalance, addCoins, takeCoins } from "../economy";

function sleep(ms: number) { return new Promise<void>((r) => setTimeout(r, ms)); }

// ── ANSI renk kodları ─────────────────────────────────────────────────────────
const E = "\u001B";
const R  = `${E}[0m`;          // reset
const WB = `${E}[1;37m`;       // bold white  → coin kenarı
const BF = `${E}[30;40m`;      // siyah metin + siyah arka plan → iç dolgu
const WO = `${E}[1;37;40m`;    // bold white + siyah arka plan → V işareti

// ── Coin ASCII çizimi ─────────────────────────────────────────────────────────
function coinFace(mark: string): string {
  return (
    `${WB}╭━━━━━━━━━━━╮${R}\n` +
    `${WB}┃${BF}███████████${WB}┃${R}\n` +
    `${WB}┃${BF}████${WO} ${mark} ${BF}████${WB}┃${R}\n` +
    `${WB}┃${BF}███████████${WB}┃${R}\n` +
    `${WB}╰━━━━━━━━━━━╯${R}`
  );
}

function coinEdge(w: number): string {
  const bar  = "━".repeat(w);
  const fill = "█".repeat(w);
  return (
    `${WB}╭${bar}╮${R}\n` +
    `${WB}┃${BF}${fill}${WB}┃${R}\n` +
    `${WB}┃${BF}${fill}${WB}┃${R}\n` +
    `${WB}┃${BF}${fill}${WB}┃${R}\n` +
    `${WB}╰${bar}╯${R}`
  );
}

const PAD = 6; // toplam satır sayısını sabit tut

function frame(topPad: number, coin: string): string {
  const above = "\n".repeat(topPad);
  const below = "\n".repeat(Math.max(0, PAD - topPad));
  return above + coin + below;
}

// Düşme animasyonu: 0 = tepede, PAD = altta; aynı zamanda döner
const ANIM_FRAMES: string[] = [
  frame(0, coinFace("?")),
  frame(1, coinEdge(9)),
  frame(2, coinEdge(5)),
  frame(2, coinEdge(1)),
  frame(3, coinEdge(3)),
  frame(4, coinEdge(7)),
  frame(5, coinEdge(9)),
];

export const data = new SlashCommandBuilder()
  .setName("coinflip")
  .setDescription("🪙 Para at — yazı mı tura mı?")
  .addIntegerOption((o) =>
    o.setName("miktar").setDescription("Bahis miktarı (min 10)").setMinValue(10).setRequired(true),
  )
  .addUserOption((o) =>
    o.setName("rakip").setDescription("Rakip (boş = bota karşı)").setRequired(false),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ content: "❌ Sadece sunucularda çalışır.", ephemeral: true });
    return;
  }
  const bet      = interaction.options.getInteger("miktar", true);
  const opponent = interaction.options.getUser("rakip") as User | null;

  // ═══════════════════════════════════════════════════════════
  //  BOT vs KULLANICI
  // ═══════════════════════════════════════════════════════════
  if (!opponent || opponent.id === interaction.user.id || opponent.bot) {
    await interaction.deferReply();

    const bal = await getBalance(interaction.user.id, interaction.guildId);
    if (bal.coins < bet) {
      await interaction.editReply({
        content: `❌ **Yetersiz bakiye!**\nBakiyen: **${bal.coins.toLocaleString("tr-TR")} ⬤V**`,
      });
      return;
    }

    // Taraf seçimi
    const choiceRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("cf_yazi").setLabel("📜 Yazı").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("cf_tura").setLabel("🔘 Tura").setStyle(ButtonStyle.Primary),
    );

    await interaction.editReply({
      content:
        `🪙 **CoinFlip** — Bahis: **${bet.toLocaleString("tr-TR")} ⬤V**\n\n` +
        `**Yazı mı, tura mı seç!** *(30 saniye)*`,
      components: [choiceRow],
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
      await interaction.editReply({
        content: "⏰ **Süre doldu.** Coinflip iptal edildi.",
        components: [],
      });
      return;
    }

    await interaction.editReply({ content: "🪙 Para havaya atıldı...", components: [] });

    // ── Animasyon ────────────────────────────────────────────
    for (const f of ANIM_FRAMES) {
      await interaction.editReply({
        content: `**🪙 Para düşüyor...**\n\`\`\`ansi\n${f}\n\`\`\``,
      });
      await sleep(220);
    }

    const result: "yazi" | "tura" = Math.random() < 0.5 ? "yazi" : "tura";
    const won = result === chosenSide;

    let newBal: number;
    if (won) newBal = await addCoins(interaction.user.id, interaction.guildId, bet);
    else     newBal = await takeCoins(interaction.user.id, interaction.guildId, bet);

    const resultMark = result === "yazi" ? "₺" : "V";
    const resultLabel = result === "yazi" ? "📜 Yazı" : "🔘 Tura";
    const choiceLabel = chosenSide === "yazi" ? "📜 Yazı" : "🔘 Tura";
    const coinResult  = coinFace(resultMark);

    await interaction.editReply({
      content:
        `**${won ? "🎉 KAZANDIN!" : "💸 KAYBETTİN!"}**\n` +
        `\`\`\`ansi\n${frame(5, coinResult)}\n\`\`\`\n` +
        `> Para **${resultLabel}** düştü!\n` +
        `> Senin seçimin: **${choiceLabel}**\n\n` +
        `💰 Bahis: **${bet.toLocaleString("tr-TR")} ⬤V**  |  ` +
        `${won ? "📈 Kazanç" : "📉 Kayıp"}: **${won ? "+" : "-"}${bet.toLocaleString("tr-TR")} ⬤V**\n` +
        `🏦 Yeni bakiye: **${newBal.toLocaleString("tr-TR")} ⬤V**`,
    });
    return;
  }

  // ═══════════════════════════════════════════════════════════
  //  1v1 MOD
  // ═══════════════════════════════════════════════════════════
  const bal1 = await getBalance(interaction.user.id, interaction.guildId);
  if (bal1.coins < bet) {
    await interaction.reply({
      content: `❌ Yetersiz bakiye!\nBakiyen: **${bal1.coins.toLocaleString("tr-TR")} ⬤V**`,
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
      `💰 Bahis: **${bet.toLocaleString("tr-TR")} ⬤V**\n\n` +
      `Kabul ediyor musun? *(60 saniye)*`,
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

  const bal2 = await getBalance(opponent.id, interaction.guildId);
  if (bal2.coins < bet) {
    await interaction.editReply({
      content: `❌ **${opponent.displayName}** bakiyesi yetersiz! (${bal2.coins.toLocaleString("tr-TR")} ⬤V)`,
      components: [],
    });
    return;
  }

  await interaction.editReply({ content: "🪙 Para havaya atıldı...", components: [] });

  for (const f of ANIM_FRAMES) {
    await interaction.editReply({
      content: `**🪙 Para düşüyor...**\n\`\`\`ansi\n${f}\n\`\`\``,
    });
    await sleep(220);
  }

  const winner = Math.random() < 0.5 ? interaction.user : opponent;
  const loser  = winner.id === interaction.user.id ? opponent : interaction.user;

  await addCoins(winner.id, interaction.guildId, bet);
  await takeCoins(loser.id,  interaction.guildId, bet);

  const winBal = await getBalance(winner.id, interaction.guildId);
  const losBal = await getBalance(loser.id,  interaction.guildId);
  const coin   = coinFace("V");

  await interaction.editReply({
    content:
      `**🪙 1v1 CoinFlip Sonucu!**\n` +
      `\`\`\`ansi\n${frame(5, coin)}\n\`\`\`\n` +
      `🏆 **${winner.displayName}** kazandı!\n\n` +
      `> 🥇 **${winner.displayName}** → +${bet.toLocaleString("tr-TR")} ⬤V  |  Bakiye: **${winBal.coins.toLocaleString("tr-TR")} ⬤V**\n` +
      `> 💸 **${loser.displayName}** → -${bet.toLocaleString("tr-TR")} ⬤V  |  Bakiye: **${losBal.coins.toLocaleString("tr-TR")} ⬤V**`,
  });
}
