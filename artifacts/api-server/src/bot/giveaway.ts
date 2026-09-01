/**
 * Çekiliş sistemi
 * - Giveaway'leri veritabanında saklar
 * - Canvas görselini her 30 saniyede otomatik günceller
 * - Süre dolunca kazananı çeker ve sonucu gösterir
 */

import { AttachmentBuilder, Client, TextChannel, ChannelType } from "discord.js";
import { db } from "@workspace/db";
import { giveawaysTable, type Giveaway } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { generateGiveawayCard } from "./giveawayCard";

// Aktif çekilişler için zamanlayıcı haritası: giveawayId → intervalId
const activeTimers = new Map<number, ReturnType<typeof setInterval>>();
const activeEndTimers = new Map<number, ReturnType<typeof setTimeout>>();

function parseParticipants(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string" && /^\d{15,22}$/.test(value))
      : [];
  } catch {
    return [];
  }
}

// ── DB yardımcıları ──────────────────────────────────────────────────────────

export async function createGiveaway(opts: {
  guildId: string;
  channelId: string;
  hostId: string;
  prize: string;
  endsAt: Date;
}): Promise<Giveaway> {
  const rows = await db
    .insert(giveawaysTable)
    .values({ ...opts, participants: "[]", active: true })
    .returning();
  return rows[0]!;
}

export async function getGiveaway(id: number, guildId: string): Promise<Giveaway | null> {
  const rows = await db
    .select()
    .from(giveawaysTable)
    .where(and(eq(giveawaysTable.id, id), eq(giveawaysTable.guildId, guildId)));
  return rows[0] ?? null;
}

export async function getActiveGiveaways(guildId: string): Promise<Giveaway[]> {
  return db
    .select()
    .from(giveawaysTable)
    .where(and(eq(giveawaysTable.guildId, guildId), eq(giveawaysTable.active, true)));
}

export async function getChannelGiveaway(channelId: string): Promise<Giveaway | null> {
  const rows = await db
    .select()
    .from(giveawaysTable)
    .where(and(eq(giveawaysTable.channelId, channelId), eq(giveawaysTable.active, true)))
    .limit(1);
  return rows[0] ?? null;
}

export async function addParticipant(giveawayId: number, userId: string): Promise<{ joined: boolean; count: number }> {
  const rows = await db.select().from(giveawaysTable).where(eq(giveawaysTable.id, giveawayId)).limit(1);
  const gw = rows[0];
  if (!gw || !gw.active) return { joined: false, count: 0 };

  const participants = parseParticipants(gw.participants);
  if (participants.includes(userId)) return { joined: false, count: participants.length };

  participants.push(userId);
  await db.update(giveawaysTable).set({ participants: JSON.stringify(participants) }).where(eq(giveawaysTable.id, giveawayId));
  return { joined: true, count: participants.length };
}

export async function setMessageId(giveawayId: number, messageId: string): Promise<void> {
  await db.update(giveawaysTable).set({ messageId }).where(eq(giveawaysTable.id, giveawayId));
}

export async function endGiveaway(giveawayId: number, client: Client): Promise<{ winnerId?: string; winnerName?: string }> {
  const rows = await db.select().from(giveawaysTable).where(eq(giveawaysTable.id, giveawayId)).limit(1);
  const gw = rows[0];
  if (!gw || !gw.active) return {};

  // Kazananı çek
  const participants = parseParticipants(gw.participants);
  let winnerId: string | undefined;
  let winnerName: string | undefined;

  if (participants.length > 0) {
    winnerId = participants[Math.floor(Math.random() * participants.length)];
    try {
      const u = await client.users.fetch(winnerId!);
      winnerName = u.displayName;
    } catch {
      winnerName = "Bilinmeyen";
    }
  }

  // DB güncelle
  await db.update(giveawaysTable).set({ active: false, winnerId: winnerId ?? null }).where(eq(giveawaysTable.id, giveawayId));

  // Zamanlayıcıları temizle
  stopGiveawayTimers(giveawayId);

  // Görseli güncelle
  if (gw.messageId) {
    try {
      const fetchedChannel = await client.channels.fetch(gw.channelId).catch(() => null);
      if (!fetchedChannel || fetchedChannel.type !== ChannelType.GuildText) return {};
      const channel = fetchedChannel as TextChannel;
      const message = await channel.messages.fetch(gw.messageId);
      const hostUser = await client.users.fetch(gw.hostId).catch(() => null);

      const buf = await generateGiveawayCard({
        prize: gw.prize,
        hostName: hostUser?.displayName ?? "Bilinmeyen",
        participantCount: participants.length,
        endsAt: gw.endsAt,
        winnerId,
        winnerName,
        active: false,
      });

      await message.edit({
        files: [new AttachmentBuilder(buf, { name: "cekilis.png" })],
      });

      // Kazanan duyurusu
      if (winnerId && winnerName) {
        await channel.send(
          `🎉 **ÇEKİLİŞ SONA ERDİ!**\n` +
          `🏆 **${gw.prize}** için kazanan: <@${winnerId}> (**${winnerName}**) tebrikler!\n` +
          `Katılımcı sayısı: **${participants.length}**`
        );
      } else {
        await channel.send(`😔 **Çekiliş sona erdi** ama hiç katılımcı yoktu. Kazanan yok.`);
      }
    } catch { /**/ }
  }

  return { winnerId, winnerName };
}

export async function cancelGiveaway(giveawayId: number): Promise<void> {
  await db.update(giveawaysTable).set({ active: false }).where(eq(giveawaysTable.id, giveawayId));
  stopGiveawayTimers(giveawayId);
}

function stopGiveawayTimers(giveawayId: number) {
  const interval = activeTimers.get(giveawayId);
  if (interval) { clearInterval(interval); activeTimers.delete(giveawayId); }
  const timeout = activeEndTimers.get(giveawayId);
  if (timeout) { clearTimeout(timeout); activeEndTimers.delete(giveawayId); }
}

// ── Görsel yenileme & otomatik bitiş ─────────────────────────────────────────

export function startGiveawayTimers(giveaway: Giveaway, client: Client, hostName: string): void {
  stopGiveawayTimers(giveaway.id);

  // Her 30 saniyede görseli güncelle
  const interval = setInterval(async () => {
    try {
      const current = await db.select().from(giveawaysTable).where(eq(giveawaysTable.id, giveaway.id)).limit(1);
      const gw = current[0];
      if (!gw || !gw.active || !gw.messageId) { clearInterval(interval); return; }

      const participants = parseParticipants(gw.participants);
      const buf = await generateGiveawayCard({
        prize: gw.prize,
        hostName,
        participantCount: participants.length,
        endsAt: gw.endsAt,
        active: true,
      });

      const channel = await client.channels.fetch(gw.channelId) as TextChannel;
      const message = await channel.messages.fetch(gw.messageId);
      await message.edit({ files: [new AttachmentBuilder(buf, { name: "cekilis.png" })] });
    } catch { /**/ }
  }, 30_000);

  activeTimers.set(giveaway.id, interval);

  // Bitiş zamanlayıcısı
  const remaining = giveaway.endsAt.getTime() - Date.now();
  if (remaining > 0) {
    const timeout = setTimeout(async () => {
      await endGiveaway(giveaway.id, client).catch(() => null);
    }, remaining);
    activeEndTimers.set(giveaway.id, timeout);
  } else {
    // Zaten bitmeli
    endGiveaway(giveaway.id, client).catch(() => null);
  }
}

// ── Bot başladığında aktif çekilişleri yeniden başlat ────────────────────────
export async function resumeActiveGiveaways(client: Client): Promise<void> {
  try {
    const all = await db.select().from(giveawaysTable).where(eq(giveawaysTable.active, true));
    for (const gw of all) {
      const hostUser = await client.users.fetch(gw.hostId).catch(() => null);
      const hostName = hostUser?.displayName ?? "Bilinmeyen";
      startGiveawayTimers(gw, client, hostName);
    }
  } catch { /**/ }
}
