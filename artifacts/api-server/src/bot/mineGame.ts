/**
 * Mayın Tarlası (Mine) Oyunu
 * ─────────────────────────────────────────────────────────────────────────────
 * Oyuncu bomba sayısını seçer (1-22 arasında, 5x5=25 kare).
 * Discord button interaction ile kareler açılır.
 * İlk tıklamada bombalar yerleştirilir (ilk tık her zaman güvenlidir).
 * Tüm güvenli kareleri aç → kazan; bombaya bas → kaybet.
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Message,
  type ButtonInteraction,
} from "discord.js";
import { addCoins, takeCoins, getBalance, addEconXp, econRankTitle } from "./economy";

// ── Sabitler ──────────────────────────────────────────────────────────────────
const GRID_SIZE = 5;    // 5×5
const TOTAL_TILES = GRID_SIZE * GRID_SIZE; // 25
const MAX_BOMBS = 22;
const MIN_BOMBS = 1;

// Güvenli kare emojileri: komşu bomba sayısına göre
const NUMBER_EMOJIS = ["🟩", "1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣"];
const HIDDEN_EMOJI = "🟦";
const BOMB_EMOJI   = "💣";
const FLAG_EMOJI   = "🚩"; // oyun bitince bomba yeri gösterilir

// ── Oyun durumu ───────────────────────────────────────────────────────────────

export interface MineState {
  userId:    string;
  guildId:   string;
  channelId: string;
  messageId: string;
  board:     number[];    // -1=bomba, 0-8=komşu bomba sayısı
  revealed:  boolean[];
  bombs:     number;
  started:   boolean;    // bombalar ilk tıkla yerleştirildi mi
  bet:       number;
  safeLeft:  number;     // açılacak güvenli kare sayısı
  over:      boolean;
}

// Oyun durumlarını global map'te tut
export const mineGames = new Map<string, MineState>();

// ── Yardımcılar ───────────────────────────────────────────────────────────────

function coordsToIdx(row: number, col: number): number {
  return row * GRID_SIZE + col;
}

function idxToCoords(idx: number): [number, number] {
  return [Math.floor(idx / GRID_SIZE), idx % GRID_SIZE];
}

function getNeighbors(idx: number): number[] {
  const [r, c] = idxToCoords(idx);
  const neighbors: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE) {
        neighbors.push(coordsToIdx(nr, nc));
      }
    }
  }
  return neighbors;
}

/** Bombaları ilk tıklanan kare ve komşuları hariç rastgele yerleştir */
function placeBombs(bombCount: number, safeIdx: number): number[] {
  const board = new Array<number>(TOTAL_TILES).fill(0);
  const forbidden = new Set([safeIdx, ...getNeighbors(safeIdx)]);
  const candidates = Array.from({ length: TOTAL_TILES }, (_, i) => i).filter(i => !forbidden.has(i));

  // Karıştır ve bomba say kadar seç
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j]!, candidates[i]!];
  }

  const bombSet = new Set(candidates.slice(0, bombCount));
  for (let i = 0; i < TOTAL_TILES; i++) {
    board[i] = bombSet.has(i) ? -1 : 0;
  }

  // Komşu bomba sayılarını hesapla
  for (let i = 0; i < TOTAL_TILES; i++) {
    if (board[i] === -1) continue;
    board[i] = getNeighbors(i).filter(n => board[n] === -1).length;
  }

  return board;
}

/** BFS ile 0 komşulu güvenli kareleri zincirleme aç */
function floodReveal(board: number[], revealed: boolean[], startIdx: number): void {
  const queue = [startIdx];
  while (queue.length) {
    const idx = queue.shift()!;
    if (revealed[idx]) continue;
    revealed[idx] = true;
    if (board[idx] === 0) {
      for (const n of getNeighbors(idx)) {
        if (!revealed[n] && board[n] !== -1) queue.push(n);
      }
    }
  }
}

// ── Discord UI ────────────────────────────────────────────────────────────────

/** Oyun durumuna göre 5 satır × 5 buton oluştur */
export function buildMineComponents(state: MineState, gameOver = false): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  for (let r = 0; r < GRID_SIZE; r++) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (let c = 0; c < GRID_SIZE; c++) {
      const idx = coordsToIdx(r, c);
      const isRevealed = state.revealed[idx];
      const isBomb = state.board[idx] === -1;
      const val = state.board[idx]!;

      let label: string;
      let style: ButtonStyle;
      let disabled: boolean;

      if (!state.started && !isRevealed) {
        // Bombalar henüz yerleştirilmedi
        label = HIDDEN_EMOJI;
        style = ButtonStyle.Primary;
        disabled = false;
      } else if (isRevealed) {
        if (isBomb) {
          label = BOMB_EMOJI;
          style = ButtonStyle.Danger;
          disabled = true;
        } else {
          label = NUMBER_EMOJIS[val] ?? "✅";
          style = val === 0 ? ButtonStyle.Success : ButtonStyle.Secondary;
          disabled = true;
        }
      } else if (gameOver && isBomb) {
        // Oyun bitti, bomba yerlerini göster
        label = FLAG_EMOJI;
        style = ButtonStyle.Danger;
        disabled = true;
      } else {
        label = HIDDEN_EMOJI;
        style = ButtonStyle.Primary;
        disabled = gameOver;
      }

      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`mine_${state.userId}_${idx}`)
          .setLabel(label)
          .setStyle(style)
          .setDisabled(disabled)
      );
    }
    rows.push(row);
  }

  return rows;
}

/** Oyun durumuna göre mesaj içeriği oluştur */
export function buildMineContent(state: MineState, coin: string): string {
  const lines: string[] = [];
  lines.push(`💣 **Mayın Tarlası** — <@${state.userId}>`);
  lines.push(`Bomba sayısı: **${state.bombs}** | Güvenli kare: **${state.safeLeft}** kaldı`);
  if (state.bet > 0) {
    lines.push(`Bahis: **${coin} ${state.bet.toLocaleString("tr-TR")} vivincy**`);
  }
  lines.push(`\n🟦 = Gizli  •  🟩 = Boş  •  1️⃣-8️⃣ = Komşu bomba  •  💣 = Bomba!`);
  return lines.join("\n");
}

// ── Oyunu oluştur ─────────────────────────────────────────────────────────────

export async function startMineGame(
  m: Message,
  bombs: number,
  bet: number,
  coin: string,
): Promise<void> {
  bombs = Math.min(MAX_BOMBS, Math.max(MIN_BOMBS, bombs));

  // Bakiye kontrolü
  if (bet > 0) {
    const bal = await getBalance(m.author.id);
    if (bal.coins < bet) {
      await m.reply(`❌ Yetersiz bakiye! Mevcut: **${coin} ${bal.coins.toLocaleString("tr-TR")} vivincy**`);
      return;
    }
    await takeCoins(m.author.id, bet);
  }

  const state: MineState = {
    userId:    m.author.id,
    guildId:   m.guildId ?? "",
    channelId: m.channelId,
    messageId: "",
    board:     new Array(TOTAL_TILES).fill(0), // doldurulacak
    revealed:  new Array(TOTAL_TILES).fill(false),
    bombs,
    started:   false,
    bet,
    safeLeft:  TOTAL_TILES - bombs,
    over:      false,
  };

  const components = buildMineComponents(state);
  const content = buildMineContent(state, coin);

  const sent = await m.reply({ content, components });
  state.messageId = sent.id;

  // Kullanıcı başına tek oyun
  const oldGame = mineGames.get(m.author.id);
  if (oldGame) mineGames.delete(m.author.id);

  mineGames.set(m.author.id, state);

  // 5 dakika sonra oyunu temizle
  setTimeout(() => {
    const s = mineGames.get(m.author.id);
    if (s && s.messageId === sent.id) {
      mineGames.delete(m.author.id);
    }
  }, 5 * 60 * 1000);
}

// ── Tıklama işle ──────────────────────────────────────────────────────────────

export async function handleMineClick(
  interaction: ButtonInteraction,
  coin: string,
): Promise<void> {
  // customId: mine_<userId>_<idx>
  const parts = interaction.customId.split("_");
  const userId = parts[1];
  const idx = parseInt(parts[2] ?? "0");

  const state = mineGames.get(userId ?? "");
  if (!state || state.over) {
    await interaction.reply({ content: "❌ Bu oyun artık geçerli değil.", ephemeral: true });
    return;
  }

  // Sadece oyunu başlatan kişi tıklayabilir
  if (interaction.user.id !== state.userId) {
    await interaction.reply({ content: "❌ Bu senin oyunun değil!", ephemeral: true });
    return;
  }

  if (state.revealed[idx]) {
    await interaction.deferUpdate().catch(() => null);
    return;
  }

  // İlk tıklamada bombaları yerleştir
  if (!state.started) {
    state.board = placeBombs(state.bombs, idx);
    state.started = true;
  }

  const isBomb = state.board[idx] === -1;

  if (isBomb) {
    // Kaybetti
    state.revealed[idx] = true;
    state.over = true;
    mineGames.delete(state.userId);

    const components = buildMineComponents(state, true);
    let content = `💥 **PATLADI!** <@${state.userId}>\n`;
    content += `Bomba: 💣 | Bahis kaybedildi`;
    if (state.bet > 0) {
      content += `: **${coin} ${state.bet.toLocaleString("tr-TR")} vivincy**`;
    }
    content += `\n\nBüyük olmak ister misin? Tekrar dene: \`mine ${state.bombs} ${state.bet}\``;

    // Econ XP ekle (kaybetse bile az XP)
    await addEconXp(state.userId, 5).catch(() => null);

    await interaction.update({ content, components });
    return;
  }

  // Güvenli kare — flood reveal
  floodReveal(state.board, state.revealed, idx);

  // Açılan güvenli kare sayısını güncelle
  state.safeLeft = state.board.filter((v, i) => v !== -1 && !state.revealed[i]).length;

  if (state.safeLeft === 0) {
    // KAZANDI
    state.over = true;
    mineGames.delete(state.userId);

    const components = buildMineComponents(state, false);

    // Ödül hesapla: bahis × risk çarpanı
    const safeTotal = TOTAL_TILES - state.bombs;
    const riskMult = parseFloat((1 + state.bombs / safeTotal * 1.5).toFixed(2));
    const winAmount = state.bet > 0 ? Math.floor(state.bet * riskMult) : 0;

    if (winAmount > 0) {
      await addCoins(state.userId, winAmount).catch(() => null);
    }

    // XP ödülü: bomba sayısına göre
    const xpReward = 10 + state.bombs * 2;
    const xpR = await addEconXp(state.userId, xpReward).catch(() => null);

    let content = `🎉 **KAZANDIN!** <@${state.userId}>\n`;
    content += `${TOTAL_TILES - state.bombs} güvenli kareyi başarıyla açtın! (${state.bombs} bomba)\n`;
    if (winAmount > 0) {
      content += `**${coin} +${winAmount.toLocaleString("tr-TR")} vivincy** (${riskMult}× çarpan)\n`;
    }
    if (xpR?.leveled) {
      const highest = xpR.newLevels[xpR.newLevels.length - 1]!;
      content += `\n💹 Ekonomi seviye **${highest}** — ${econRankTitle(highest)}! (+${xpR.totalReward.toLocaleString("tr-TR")} vivincy)`;
    }

    await interaction.update({ content, components });
    return;
  }

  // Oyun devam ediyor
  const components = buildMineComponents(state);
  const content = buildMineContent(state, coin);
  await interaction.update({ content, components });
}
