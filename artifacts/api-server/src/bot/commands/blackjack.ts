import {
  ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder,
  ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType,
} from "discord.js";
import { getBalance, addCoins, takeCoins } from "../economy";

// ── Kart sistemi ──────────────────────────────────────────────────────────────
type Suit = "♠" | "♥" | "♦" | "♣";
type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";
interface Card { rank: Rank; suit: Suit; }

const SUITS: Suit[] = ["♠", "♥", "♦", "♣"];
const RANKS: Rank[] = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];

function newDeck(): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) for (const r of RANKS) deck.push({ rank: r, suit: s });
  return deck;
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

function cardValue(rank: Rank): number {
  if (["J","Q","K"].includes(rank)) return 10;
  if (rank === "A") return 11; // Ace başlangıçta 11, gerekirse azaltılır
  return parseInt(rank);
}

function handValue(hand: Card[]): number {
  let total = hand.reduce((s, c) => s + cardValue(c.rank), 0);
  let aces = hand.filter((c) => c.rank === "A").length;
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

function cardStr(c: Card): string {
  const red = c.suit === "♥" || c.suit === "♦";
  return `\`${c.rank}${c.suit}\``;
}

function handStr(hand: Card[], hideSecond = false): string {
  return hand
    .map((c, i) => (hideSecond && i === 1 ? "`🂠`" : cardStr(c)))
    .join(" ");
}

function statusLine(val: number): string {
  if (val > 21) return "💥 Battı!";
  if (val === 21) return "⭐ 21!";
  return `${val}`;
}

// ── Oyun durumu ───────────────────────────────────────────────────────────────
interface BJGame {
  deck: Card[];
  playerHand: Card[];
  dealerHand: Card[];
  bet: number;
  guildId: string;
  userId: string;
  doubled: boolean;
}

const activeGames = new Map<string, BJGame>();

function makeButtons(canDouble: boolean): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("bj_hit").setLabel("👆 Kart Çek").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("bj_stand").setLabel("🛑 Dur").setStyle(ButtonStyle.Secondary),
    ...(canDouble ? [new ButtonBuilder().setCustomId("bj_double").setLabel("⚡ Çift (x2)").setStyle(ButtonStyle.Danger)] : []),
  );
}

function disabledButtons(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("bj_hit").setLabel("👆 Kart Çek").setStyle(ButtonStyle.Primary).setDisabled(true),
    new ButtonBuilder().setCustomId("bj_stand").setLabel("🛑 Dur").setStyle(ButtonStyle.Secondary).setDisabled(true),
  );
}

function gameEmbed(game: BJGame, dealerRevealed = false, resultMsg?: string, color?: number): EmbedBuilder {
  const pv = handValue(game.playerHand);
  const dv = handValue(game.dealerHand);
  const visibleDv = dealerRevealed ? dv : handValue([game.dealerHand[0]!]);
  const embed = new EmbedBuilder()
    .setColor(color ?? 0x2b2d31)
    .setTitle("🃏 Blackjack")
    .addFields(
      {
        name: `🎩 Krupiye  ${dealerRevealed ? `[${statusLine(dv)}]` : `[${visibleDv}+?]`}`,
        value: handStr(game.dealerHand, !dealerRevealed),
      },
      {
        name: `👤 Sen  [${statusLine(pv)}]`,
        value: handStr(game.playerHand),
      },
      { name: "Bahis", value: `${game.bet.toLocaleString("tr-TR")} ⬤V`, inline: true },
    );
  if (resultMsg) embed.setDescription(resultMsg);
  return embed;
}

async function finishGame(
  interaction: ChatInputCommandInteraction,
  game: BJGame,
  reason: "bust" | "stand" | "bj",
): Promise<void> {
  const key = `${interaction.user.id}:${game.guildId}`;
  activeGames.delete(key);

  const pv = handValue(game.playerHand);
  const dv = handValue(game.dealerHand);

  let resultMsg: string;
  let color: number;
  let balDiff: number;

  if (reason === "bust") {
    resultMsg = "💥 **Battın!** 21'i geçtin.";
    color = 0xed4245;
    balDiff = -game.bet;
    await takeCoins(game.userId, game.guildId, game.bet);
  } else if (reason === "bj" && pv === 21) {
    resultMsg = "🌟 **BLACKJACK!** 1.5x kazandın!";
    color = 0xffd700;
    balDiff = Math.round(game.bet * 1.5);
    await addCoins(game.userId, game.guildId, balDiff);
  } else {
    // Dealer oynuyor
    while (handValue(game.dealerHand) < 17) {
      const card = draw(game.deck);
      game.dealerHand.push(card);
    }
    const finalDv = handValue(game.dealerHand);

    if (finalDv > 21) {
      resultMsg = "🎉 **Krupiye battı!** Sen kazandın!";
      color = 0x57f287;
      balDiff = game.bet;
      await addCoins(game.userId, game.guildId, game.bet);
    } else if (pv > finalDv) {
      resultMsg = "🎉 **Kazandın!** El senin!";
      color = 0x57f287;
      balDiff = game.bet;
      await addCoins(game.userId, game.guildId, game.bet);
    } else if (pv === finalDv) {
      resultMsg = "🤝 **Beraberlik!** Bahis iade edildi.";
      color = 0xfaa61a;
      balDiff = 0;
    } else {
      resultMsg = "💸 **Kaybettin!** Krupiye daha yakın.";
      color = 0xed4245;
      balDiff = -game.bet;
      await takeCoins(game.userId, game.guildId, game.bet);
    }
  }

  const newBal = await getBalance(game.userId, game.guildId);
  const finalEmbed = gameEmbed(game, true, resultMsg, color);
  finalEmbed.addFields({ name: balDiff >= 0 ? "💰 Kazanç" : "💸 Kayıp", value: `${balDiff >= 0 ? "+" : ""}${balDiff.toLocaleString("tr-TR")} ⬤V`, inline: true });
  finalEmbed.addFields({ name: "Yeni Bakiye", value: `**${newBal.coins.toLocaleString("tr-TR")} ⬤V**`, inline: true });
  finalEmbed.setTimestamp();

  await interaction.editReply({ embeds: [finalEmbed], components: [disabledButtons()] });
}

// ── Komut tanımı ─────────────────────────────────────────────────────────────
export const data = new SlashCommandBuilder()
  .setName("blackjack")
  .setDescription("🃏 Krupiyeye karşı blackjack oyna! (animasyonlu)")
  .addIntegerOption((o) => o.setName("miktar").setDescription("Bahis miktarı (min 10)").setMinValue(10).setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) { await interaction.reply({ content: "❌ Sadece sunucularda çalışır.", ephemeral: true }); return; }
  const key = `${interaction.user.id}:${interaction.guildId}`;

  if (activeGames.has(key)) {
    await interaction.reply({ content: "❌ Zaten aktif bir oyunun var! Önce onu bitir.", ephemeral: true }); return;
  }

  const bet = interaction.options.getInteger("miktar", true);
  await interaction.deferReply();

  const bal = await getBalance(interaction.user.id, interaction.guildId);
  if (bal.coins < bet) {
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xed4245).setTitle("❌ Yetersiz Bakiye").setDescription(`Bakiyen: **${bal.coins.toLocaleString("tr-TR")}** ⬤V`)] });
    return;
  }

  // Başlangıç
  const deck = shuffle(newDeck());
  const playerHand: Card[] = [draw(deck), draw(deck)];
  const dealerHand: Card[] = [draw(deck), draw(deck)];
  const game: BJGame = { deck, playerHand, dealerHand, bet, guildId: interaction.guildId, userId: interaction.user.id, doubled: false };
  activeGames.set(key, game);

  // Hemen blackjack?
  if (handValue(playerHand) === 21) {
    await interaction.editReply({ embeds: [gameEmbed(game, false)], components: [] });
    await finishGame(interaction, game, "bj");
    return;
  }

  const canDouble = bal.coins >= bet * 2;
  await interaction.editReply({ embeds: [gameEmbed(game)], components: [makeButtons(canDouble)] });

  const msg = await interaction.fetchReply();
  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) => i.user.id === interaction.user.id,
    time: 120_000,
  });

  collector.on("collect", async (btn) => {
    await btn.deferUpdate();
    const g = activeGames.get(key);
    if (!g) return;

    if (btn.customId === "bj_hit" || btn.customId === "bj_double") {
      if (btn.customId === "bj_double") {
        g.bet *= 2; g.doubled = true;
      }
      g.playerHand.push(draw(g.deck));
      const pv = handValue(g.playerHand);

      if (pv > 21) {
        collector.stop("bust");
        return;
      }
      if (pv === 21 || g.doubled) {
        // Otomatik dur
        collector.stop("stand");
        return;
      }
      const curBal = await getBalance(interaction.user.id, interaction.guildId);
      const stillCanDouble = !g.doubled && curBal.coins >= g.bet * 2;
      await interaction.editReply({ embeds: [gameEmbed(g)], components: [makeButtons(stillCanDouble)] });
    }

    if (btn.customId === "bj_stand") {
      collector.stop("stand");
    }
  });

  collector.on("end", async (_c, reason) => {
    const g = activeGames.get(key);
    if (!g) return;
    if (reason === "time") {
      activeGames.delete(key);
      await takeCoins(g.userId, g.guildId, g.bet);
      const b = await getBalance(g.userId, g.guildId);
      await interaction.editReply({
        embeds: [gameEmbed(g, true, "⏰ **Süre doldu!** Bahis alındı.", 0x72767d)
          .addFields({ name: "Yeni Bakiye", value: `**${b.coins.toLocaleString("tr-TR")} ⬤V**` })],
        components: [disabledButtons()],
      });
      return;
    }
    await finishGame(interaction, g, reason as "bust" | "stand");
  });
}
