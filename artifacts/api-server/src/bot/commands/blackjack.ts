import {
  ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder,
  ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType, User,
} from "discord.js";
import { getBalance, addCoins, takeCoins } from "../economy";

// ── Kart sistemi ──────────────────────────────────────────────────────────────
type Suit = "♠" | "♥" | "♦" | "♣";
type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";
interface Card { rank: Rank; suit: Suit; }

const SUITS: Suit[] = ["♠", "♥", "♦", "♣"];
const RANKS: Rank[] = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];

function newDeck(): Card[] {
  const d: Card[] = [];
  for (const s of SUITS) for (const r of RANKS) d.push({ rank: r, suit: s });
  return d;
}
function shuffle(deck: Card[]): Card[] {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j]!, d[i]!];
  }
  return d;
}
function draw(deck: Card[]): Card { return deck.pop()!; }
function cardValue(r: Rank): number {
  if (["J","Q","K"].includes(r)) return 10;
  if (r === "A") return 11;
  return parseInt(r);
}
function handValue(hand: Card[]): number {
  let total = hand.reduce((s, c) => s + cardValue(c.rank), 0);
  let aces  = hand.filter((c) => c.rank === "A").length;
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}
function cardStr(c: Card): string { return `\`${c.rank}${c.suit}\``; }
function handStr(hand: Card[], hideAfter?: number): string {
  return hand
    .map((c, i) => (hideAfter !== undefined && i >= hideAfter ? "`🂠`" : cardStr(c)))
    .join(" ");
}
function statusLine(v: number): string {
  if (v > 21) return "💥 Battı!";
  if (v === 21) return "⭐ 21!";
  return `${v}`;
}

// ── Oyun durumu ───────────────────────────────────────────────────────────────
interface BJSoloGame {
  mode: "solo";
  deck: Card[];
  playerHand: Card[];
  dealerHand: Card[];
  bet: number;
  guildId: string;
  userId: string;
  doubled: boolean;
}
interface BJ1v1Game {
  mode: "1v1";
  deck: Card[];
  hand1: Card[];   // challenger
  hand2: Card[];   // opponent
  bet: number;
  guildId: string;
  user1Id: string;
  user2Id: string;
  turn: 1 | 2;     // kimin sırası
}
type BJGame = BJSoloGame | BJ1v1Game;

const activeGames = new Map<string, BJGame>();

// ── Butonlar ──────────────────────────────────────────────────────────────────
function makeButtons(canDouble = false): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("bj_hit").setLabel("👆 Kart Çek").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("bj_stand").setLabel("🛑 Dur").setStyle(ButtonStyle.Secondary),
    ...(canDouble ? [new ButtonBuilder().setCustomId("bj_double").setLabel("⚡ Çift (x2)").setStyle(ButtonStyle.Danger)] : []),
  );
}
function disabledButtons(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("bj_hit_d").setLabel("👆 Kart Çek").setStyle(ButtonStyle.Primary).setDisabled(true),
    new ButtonBuilder().setCustomId("bj_stand_d").setLabel("🛑 Dur").setStyle(ButtonStyle.Secondary).setDisabled(true),
  );
}

// ── Solo embed ────────────────────────────────────────────────────────────────
function soloEmbed(g: BJSoloGame, dealerRevealed = false, resultMsg?: string, color?: number): EmbedBuilder {
  const pv  = handValue(g.playerHand);
  const dv  = handValue(g.dealerHand);
  const vis = dealerRevealed ? dv : handValue([g.dealerHand[0]!]);
  const e = new EmbedBuilder()
    .setColor(color ?? 0x2b2d31)
    .setTitle("🃏 Blackjack")
    .addFields(
      { name: `🎩 Krupiye  ${dealerRevealed ? `[${statusLine(dv)}]` : `[${vis}+?]`}`, value: handStr(g.dealerHand, dealerRevealed ? undefined : 1) },
      { name: `👤 Sen  [${statusLine(pv)}]`, value: handStr(g.playerHand) },
      { name: "Bahis", value: `${g.bet.toLocaleString("tr-TR")} ⬤V`, inline: true },
    );
  if (resultMsg) e.setDescription(resultMsg);
  return e;
}

async function finishSolo(
  interaction: ChatInputCommandInteraction,
  g: BJSoloGame,
  reason: "bust" | "stand" | "bj",
): Promise<void> {
  const key = `${g.userId}:${g.guildId}`;
  activeGames.delete(key);
  const pv = handValue(g.playerHand);

  let resultMsg: string; let color: number; let balDiff: number;

  if (reason === "bust") {
    resultMsg = "💥 **Battın!** 21'i geçtin.";
    color = 0xed4245; balDiff = -g.bet;
    await takeCoins(g.userId, g.guildId, g.bet);
  } else if (reason === "bj" && pv === 21) {
    resultMsg = "🌟 **BLACKJACK!** 1.5x kazandın!";
    color = 0xffd700; balDiff = Math.round(g.bet * 1.5);
    await addCoins(g.userId, g.guildId, balDiff);
  } else {
    while (handValue(g.dealerHand) < 17) g.dealerHand.push(draw(g.deck));
    const dv = handValue(g.dealerHand);
    if (dv > 21)      { resultMsg = "🎉 **Krupiye battı!** Kazandın!"; color = 0x57f287; balDiff = g.bet;  await addCoins(g.userId, g.guildId, g.bet); }
    else if (pv > dv) { resultMsg = "🎉 **Kazandın!**";               color = 0x57f287; balDiff = g.bet;  await addCoins(g.userId, g.guildId, g.bet); }
    else if (pv === dv){ resultMsg = "🤝 **Beraberlik!** Bahis iade."; color = 0xfaa61a; balDiff = 0; }
    else              { resultMsg = "💸 **Kaybettin!**";              color = 0xed4245; balDiff = -g.bet; await takeCoins(g.userId, g.guildId, g.bet); }
  }

  const newBal = await getBalance(g.userId, g.guildId);
  const e = soloEmbed(g, true, resultMsg, color);
  e.addFields(
    { name: balDiff >= 0 ? "💰 Kazanç" : "💸 Kayıp", value: `${balDiff >= 0 ? "+" : ""}${balDiff.toLocaleString("tr-TR")} ⬤V`, inline: true },
    { name: "Yeni Bakiye", value: `**${newBal.coins.toLocaleString("tr-TR")} ⬤V**`, inline: true },
  ).setTimestamp();
  await interaction.editReply({ embeds: [e], components: [disabledButtons()] });
}

// ── 1v1 yardımcı ─────────────────────────────────────────────────────────────
function make1v1Embed(g: BJ1v1Game, user1: User, user2: User, done = false, resultMsg?: string, color?: number): EmbedBuilder {
  const v1 = handValue(g.hand1);
  const v2 = handValue(g.hand2);
  const e = new EmbedBuilder()
    .setColor(color ?? 0x2b2d31)
    .setTitle("🃏 Blackjack 1v1")
    .addFields(
      {
        name: `👤 ${user1.displayName}  [${done || g.turn === 2 ? statusLine(v1) : "?"}]`,
        value: done || g.turn === 2 ? handStr(g.hand1) : handStr(g.hand1, g.hand1.length),
      },
      {
        name: `👤 ${user2.displayName}  [${done ? statusLine(v2) : g.turn === 2 ? "?" : "bekliyor..."}]`,
        value: done ? handStr(g.hand2) : handStr(g.hand2, g.hand2.length),
      },
      { name: "Bahis (kişi başı)", value: `${g.bet.toLocaleString("tr-TR")} ⬤V`, inline: true },
      { name: "Sıra", value: done ? "Bitti" : g.turn === 1 ? user1.displayName : user2.displayName, inline: true },
    );
  if (resultMsg) e.setDescription(resultMsg);
  return e;
}

// ── Komut tanımı ─────────────────────────────────────────────────────────────
export const data = new SlashCommandBuilder()
  .setName("blackjack")
  .setDescription("🃏 Blackjack oyna — krupiyeye veya gerçek rakibe karşı!")
  .addIntegerOption((o) => o.setName("miktar").setDescription("Bahis (min 10)").setMinValue(10).setRequired(true))
  .addUserOption((o) => o.setName("rakip").setDescription("Gerçek rakip (boş = krupiye)").setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) { await interaction.reply({ content: "❌ Sadece sunucularda çalışır.", ephemeral: true }); return; }
  const bet      = interaction.options.getInteger("miktar", true);
  const opponent = interaction.options.getUser("rakip") as User | null;
  const key1     = `${interaction.user.id}:${interaction.guildId}`;

  if (activeGames.has(key1)) { await interaction.reply({ content: "❌ Zaten aktif bir oyunun var!", ephemeral: true }); return; }

  // ═══════════════════════════════════════════════════════════
  //  SOLO (krupiye karşı)
  // ═══════════════════════════════════════════════════════════
  if (!opponent || opponent.id === interaction.user.id || opponent.bot) {
    await interaction.deferReply();
    const bal = await getBalance(interaction.user.id, interaction.guildId);
    if (bal.coins < bet) {
      await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xed4245).setDescription(`❌ Yetersiz bakiye: **${bal.coins.toLocaleString("tr-TR")} ⬤V**`)] });
      return;
    }
    const deck = shuffle(newDeck());
    const playerHand: Card[] = [draw(deck), draw(deck)];
    const dealerHand: Card[] = [draw(deck), draw(deck)];
    const g: BJSoloGame = { mode: "solo", deck, playerHand, dealerHand, bet, guildId: interaction.guildId, userId: interaction.user.id, doubled: false };
    activeGames.set(key1, g);

    if (handValue(playerHand) === 21) {
      await interaction.editReply({ embeds: [soloEmbed(g)], components: [] });
      await finishSolo(interaction, g, "bj");
      return;
    }
    const canDouble = bal.coins >= bet * 2;
    await interaction.editReply({ embeds: [soloEmbed(g)], components: [makeButtons(canDouble)] });
    const msg = await interaction.fetchReply();
    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, filter: (i) => i.user.id === interaction.user.id, time: 120_000 });
    collector.on("collect", async (btn) => {
      await btn.deferUpdate();
      const gg = activeGames.get(key1) as BJSoloGame | undefined; if (!gg) return;
      if (btn.customId === "bj_double") { gg.bet *= 2; gg.doubled = true; }
      if (btn.customId === "bj_hit" || btn.customId === "bj_double") {
        gg.playerHand.push(draw(gg.deck));
        const pv = handValue(gg.playerHand);
        if (pv > 21 || pv === 21 || gg.doubled) { collector.stop(pv > 21 ? "bust" : "stand"); return; }
        const cb = await getBalance(interaction.user.id, interaction.guildId);
        await interaction.editReply({ embeds: [soloEmbed(gg)], components: [makeButtons(!gg.doubled && cb.coins >= gg.bet * 2)] });
      }
      if (btn.customId === "bj_stand") collector.stop("stand");
    });
    collector.on("end", async (_c, reason) => {
      const gg = activeGames.get(key1) as BJSoloGame | undefined; if (!gg) return;
      if (reason === "time") {
        activeGames.delete(key1);
        await takeCoins(gg.userId, gg.guildId, gg.bet);
        const b = await getBalance(gg.userId, gg.guildId);
        await interaction.editReply({ embeds: [soloEmbed(gg, true, "⏰ Süre doldu — bahis alındı.", 0x72767d).addFields({ name: "Bakiye", value: `**${b.coins.toLocaleString("tr-TR")} ⬤V**` })], components: [disabledButtons()] });
        return;
      }
      await finishSolo(interaction, gg, reason as "bust" | "stand");
    });
    return;
  }

  // ═══════════════════════════════════════════════════════════
  //  1v1 MOD
  // ═══════════════════════════════════════════════════════════
  if (activeGames.has(`${opponent.id}:${interaction.guildId}`)) {
    await interaction.reply({ content: "❌ Rakibin zaten aktif bir oyunu var!", ephemeral: true }); return;
  }
  const bal1 = await getBalance(interaction.user.id, interaction.guildId);
  if (bal1.coins < bet) { await interaction.reply({ content: `❌ Yetersiz bakiye: **${bal1.coins.toLocaleString("tr-TR")} ⬤V**`, ephemeral: true }); return; }

  const inviteRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("bj1v1_accept").setLabel("✅ Kabul Et").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("bj1v1_decline").setLabel("❌ Reddet").setStyle(ButtonStyle.Danger),
  );
  await interaction.reply({
    content: `${opponent} — **${interaction.user.displayName}** sana **${bet.toLocaleString("tr-TR")} ⬤V** bahisli Blackjack 1v1 daveti gönderdi!\nKabul ediyor musun? *(60 sn)*`,
    components: [inviteRow],
  });
  const invMsg = await interaction.fetchReply();

  try {
    const invBtn = await invMsg.awaitMessageComponent({ componentType: ComponentType.Button, filter: (i) => i.user.id === opponent.id, time: 60_000 });
    if (invBtn.customId === "bj1v1_decline") {
      await invBtn.update({ content: `❌ **${opponent.displayName}** daveti reddetti.`, components: [] }); return;
    }
    await invBtn.deferUpdate();
  } catch {
    await interaction.editReply({ content: "⏰ Süre doldu. Oyun iptal.", components: [] }); return;
  }

  const bal2 = await getBalance(opponent.id, interaction.guildId);
  if (bal2.coins < bet) {
    await interaction.editReply({ content: `❌ **${opponent.displayName}** bakiyesi yetersiz!`, components: [] }); return;
  }

  // Kart dağıt
  const deck = shuffle(newDeck());
  const hand1: Card[] = [draw(deck), draw(deck)];
  const hand2: Card[] = [draw(deck), draw(deck)];
  const g1v1: BJ1v1Game = {
    mode: "1v1", deck, hand1, hand2, bet,
    guildId: interaction.guildId,
    user1Id: interaction.user.id,
    user2Id: opponent.id,
    turn: 1,
  };
  const key2 = `${opponent.id}:${interaction.guildId}`;
  activeGames.set(key1, g1v1);
  activeGames.set(key2, g1v1);

  const user1 = interaction.user;
  const user2 = opponent;

  await interaction.editReply({
    content: `🃏 **Blackjack 1v1 başladı!** Sıra: **${user1.displayName}**\n*Rakibin elleri gizli.*`,
    embeds: [make1v1Embed(g1v1, user1, user2)],
    components: [makeButtons(false)],
  });

  const gameMsg = await interaction.fetchReply();

  // ── Oyun döngüsü ──────────────────────────────────────────
  async function playTurn(turnOwner: User, otherUser: User): Promise<"bust" | "stand"> {
    return new Promise((resolve) => {
      const filter = (i: { user: { id: string } }) => i.user.id === turnOwner.id;
      const coll = gameMsg.createMessageComponentCollector({ componentType: ComponentType.Button, filter, time: 90_000 });

      coll.on("collect", async (btn) => {
        await btn.deferUpdate();
        const gg = activeGames.get(key1) as BJ1v1Game | undefined; if (!gg) return;
        const myHand = gg.turn === 1 ? gg.hand1 : gg.hand2;

        if (btn.customId === "bj_hit") {
          myHand.push(draw(gg.deck));
          const v = handValue(myHand);
          if (v > 21) { coll.stop("bust"); return; }
          if (v === 21) { coll.stop("stand"); return; }
          await interaction.editReply({
            content: `🃏 Sıra: **${turnOwner.displayName}**`,
            embeds: [make1v1Embed(gg, user1, user2)],
            components: [makeButtons(false)],
          });
        }
        if (btn.customId === "bj_stand") coll.stop("stand");
      });

      coll.on("end", (_c, r) => resolve(r === "bust" ? "bust" : "stand"));
    });
  }

  // Oyuncu 1
  const res1 = await playTurn(user1, user2);
  g1v1.turn = 2;

  const v1after = handValue(g1v1.hand1);
  if (res1 === "bust") {
    // Oyuncu 1 battı, oyuncu 2 kazandı
    await addCoins(user2.id, interaction.guildId, bet);
    await takeCoins(user1.id, interaction.guildId, bet);
    const b1 = await getBalance(user1.id, interaction.guildId);
    const b2 = await getBalance(user2.id, interaction.guildId);
    activeGames.delete(key1); activeGames.delete(key2);
    await interaction.editReply({
      content:
        `🏆 **${user2.displayName}** kazandı! **${user1.displayName}** battı (${v1after}).\n` +
        `> 🥇 ${user2.displayName}: **+${bet.toLocaleString("tr-TR")} ⬤V** → ${b2.coins.toLocaleString("tr-TR")} ⬤V\n` +
        `> 💸 ${user1.displayName}: **-${bet.toLocaleString("tr-TR")} ⬤V** → ${b1.coins.toLocaleString("tr-TR")} ⬤V`,
      embeds: [make1v1Embed(g1v1, user1, user2, true)],
      components: [disabledButtons()],
    });
    return;
  }

  // Oyuncu 2'nin sırası
  await interaction.editReply({
    content: `🃏 Sıra: **${user2.displayName}**`,
    embeds: [make1v1Embed(g1v1, user1, user2)],
    components: [makeButtons(false)],
  });

  const res2 = await playTurn(user2, user1);
  const v2after = handValue(g1v1.hand2);

  // Sonuç
  activeGames.delete(key1); activeGames.delete(key2);

  let resultMsg: string; let winnerId: string | null = null; let loserId: string | null = null;
  if (res2 === "bust") {
    resultMsg = `💥 **${user2.displayName}** battı! **${user1.displayName}** kazandı!`;
    winnerId = user1.id; loserId = user2.id;
  } else if (v1after > v2after) {
    resultMsg = `🏆 **${user1.displayName}** kazandı! (${v1after} > ${v2after})`;
    winnerId = user1.id; loserId = user2.id;
  } else if (v2after > v1after) {
    resultMsg = `🏆 **${user2.displayName}** kazandı! (${v2after} > ${v1after})`;
    winnerId = user2.id; loserId = user1.id;
  } else {
    resultMsg = `🤝 **Beraberlik!** İki oyuncu da ${v1after} yaptı — bahisler iade.`;
  }

  let b1coins = 0; let b2coins = 0;
  if (winnerId && loserId) {
    await addCoins(winnerId, interaction.guildId, bet);
    await takeCoins(loserId,  interaction.guildId, bet);
    b1coins = (await getBalance(user1.id, interaction.guildId)).coins;
    b2coins = (await getBalance(user2.id, interaction.guildId)).coins;
  } else {
    b1coins = (await getBalance(user1.id, interaction.guildId)).coins;
    b2coins = (await getBalance(user2.id, interaction.guildId)).coins;
  }

  await interaction.editReply({
    content:
      `${resultMsg}\n` +
      `> ${user1.displayName}: **${b1coins.toLocaleString("tr-TR")} ⬤V**\n` +
      `> ${user2.displayName}: **${b2coins.toLocaleString("tr-TR")} ⬤V**`,
    embeds: [make1v1Embed(g1v1, user1, user2, true, resultMsg, winnerId ? 0x57f287 : 0xfaa61a)],
    components: [disabledButtons()],
  });
}
