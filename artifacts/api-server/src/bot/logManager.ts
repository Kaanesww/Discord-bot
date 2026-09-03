import {
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  type Guild,
  type Message,
} from "discord.js";
import { db } from "@workspace/db";
import { moderationLogsTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { actionLabel } from "./moderation";
import { getGuard, setGuard } from "./guard";

const LOG_CATEGORY_NAME = "VBRI LOGS";

const LOG_CHANNELS = [
  { key: "generalLogChannelId", name: "genel-islem-logu", label: "Genel İşlem" },
  { key: "banLogChannelId", name: "ban-logu", label: "Ban" },
  { key: "muteLogChannelId", name: "mute-logu", label: "Mute" },
  { key: "messageLogChannelId", name: "mesaj-logu", label: "Mesaj" },
  { key: "deletedMessageLogChannelId", name: "silinen-mesaj-logu", label: "Silinen Mesaj" },
  { key: "protectionLogChannelId", name: "koruma-logu", label: "Sunucu Koruma" },
  { key: "memberLogChannelId", name: "giris-cikis-logu", label: "Giriş / Çıkış" },
] as const;

type LogChannelKey = (typeof LOG_CHANNELS)[number]["key"];

function logPermissions(guild: Guild) {
  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
  ];
  const botId = guild.members.me?.id;
  if (botId) {
    overwrites.push({
      id: botId,
      deny: [],
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    } as typeof overwrites[number]);
  }
  return overwrites;
}

/** Log kategorisini ve eksik log kanallarını idempotent biçimde oluşturur. */
export async function ensureAutoLogChannels(guild: Guild): Promise<Record<LogChannelKey, string>> {
  let category = guild.channels.cache.find(
    (channel) => channel.type === ChannelType.GuildCategory && channel.name === LOG_CATEGORY_NAME,
  );
  if (!category) {
    category = await guild.channels.create({
      name: LOG_CATEGORY_NAME,
      type: ChannelType.GuildCategory,
      permissionOverwrites: logPermissions(guild),
    });
  }

  const ids = {} as Record<LogChannelKey, string>;
  for (const definition of LOG_CHANNELS) {
    let channel = guild.channels.cache.find(
      (candidate) =>
        candidate.type === ChannelType.GuildText &&
        candidate.parentId === category!.id &&
        candidate.name === definition.name,
    );
    if (!channel) {
      channel = await guild.channels.create({
        name: definition.name,
        type: ChannelType.GuildText,
        parent: category.id,
        permissionOverwrites: logPermissions(guild),
      });
    }
    ids[definition.key] = channel.id;
  }

  await setGuard(guild.id, {
    logsEnabled: true,
    logChannelId: ids.generalLogChannelId,
    generalLogChannelId: ids.generalLogChannelId,
    banLogChannelId: ids.banLogChannelId,
    muteLogChannelId: ids.muteLogChannelId,
    messageLogChannelId: ids.messageLogChannelId,
    deletedMessageLogChannelId: ids.deletedMessageLogChannelId,
    protectionLogChannelId: ids.protectionLogChannelId,
    memberLogChannelId: ids.memberLogChannelId,
  });

  return ids;
}

export async function disableAutoLogs(guildId: string): Promise<void> {
  await setGuard(guildId, { logsEnabled: false });
}

export async function enableExistingLogs(guildId: string): Promise<void> {
  await setGuard(guildId, { logsEnabled: true });
}

export async function getLogStatus(guildId: string) {
  const settings = await getGuard(guildId);
  return {
    enabled: settings.logsEnabled,
    channels: {
      general: settings.generalLogChannelId,
      ban: settings.banLogChannelId,
      mute: settings.muteLogChannelId,
      message: settings.messageLogChannelId,
      deletedMessage: settings.deletedMessageLogChannelId,
      protection: settings.protectionLogChannelId,
      member: settings.memberLogChannelId,
    },
  };
}

type ActivityItem = { timestamp: number; text: string };

/** Discord audit kayıtları + bot moderasyon kayıtlarını tek listede birleştirir. */
export async function getUserActivity(guild: Guild, userId: string): Promise<ActivityItem[]> {
  const items: ActivityItem[] = [];

  try {
    let before: string | undefined;
    for (let page = 0; page < 5; page++) {
      const audit = await guild.fetchAuditLogs({ limit: 100, ...(before ? { before } : {}) });
      for (const entry of audit.entries.values()) {
        if (entry.executor?.id !== userId) continue;
        const target = entry.targetId ? `\`${entry.targetId}\`` : "—";
        items.push({
          timestamp: entry.createdTimestamp,
          text: `**${auditActionName(entry.action)}**\nHedef: ${target}${entry.reason ? `\nSebep: ${entry.reason}` : ""}`,
        });
      }
      const oldest = audit.entries.last();
      if (!oldest || audit.entries.size < 100) break;
      before = oldest.id;
    }
  } catch {
    // Audit Log izni yoksa moderasyon tablosu yine gösterilir.
  }

  try {
    const rows = await db
      .select()
      .from(moderationLogsTable)
      .where(and(
        eq(moderationLogsTable.guildId, guild.id),
        eq(moderationLogsTable.moderatorId, userId),
      ))
      .orderBy(desc(moderationLogsTable.createdAt))
      .limit(500);
    for (const row of rows) {
      items.push({
        timestamp: row.createdAt?.getTime() ?? Date.now(),
        text: `**${actionLabel(row.action)}**\nHedef: \`${row.userId}\`${row.reason ? `\nSebep: ${row.reason}` : ""}`,
      });
    }
  } catch {
    // Şema henüz hazır değilse audit kayıtları gösterilmeye devam eder.
  }

  return items
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 500);
}

function auditActionName(action: number): string {
  const labels: Record<number, string> = {
    10: "Kanal oluşturuldu",
    11: "Kanal güncellendi",
    12: "Kanal silindi",
    20: "Üye atıldı",
    22: "Üye banlandı",
    23: "Üye banı kaldırıldı",
    24: "Üye güncellendi",
    25: "Üye rolü güncellendi",
    26: "Üye taşındı",
    27: "Üye bağlantısı kesildi",
    28: "Bot eklendi",
    31: "Rol oluşturuldu",
    32: "Rol güncellendi",
    33: "Rol silindi",
    72: "Mesaj silindi",
    73: "Mesaj toplu silindi",
    74: "Mesaj sabitlendi",
    75: "Mesaj sabitlemesi kaldırıldı",
    140: "Webhook oluşturuldu",
    141: "Webhook güncellendi",
    142: "Webhook silindi",
  };
  return labels[action] ?? `Discord işlemi (#${action})`;
}

export async function buildUserActivityEmbeds(
  message: Message,
  userId: string,
): Promise<EmbedBuilder[]> {
  const items = await getUserActivity(message.guild!, userId);
  if (items.length === 0) {
    return [new EmbedBuilder()
      .setColor(0x72767d)
      .setTitle("🧾 Kullanıcı İşlem Geçmişi")
      .setDescription(`Kullanıcı ID: \`${userId}\`\nBu kullanıcı için görülebilir işlem bulunamadı.`)
      .setFooter({ text: "Discord Audit Log + VBRI moderasyon kayıtları" })
      .setTimestamp()];
  }

  const embeds: EmbedBuilder[] = [];
  for (let offset = 0; offset < items.length; offset += 10) {
    const pageItems = items.slice(offset, offset + 10);
    embeds.push(new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("🧾 Kullanıcı İşlem Geçmişi")
      .setDescription(`Kullanıcı ID: \`${userId}\`\nToplam **${items.length}** kayıt bulundu.`)
      .addFields(pageItems.map((item) => ({
        name: new Date(item.timestamp).toLocaleString("tr-TR"),
        value: item.text.slice(0, 1024),
        inline: false,
      })))
      .setFooter({ text: `Sayfa ${Math.floor(offset / 10) + 1} • Discord Audit Log + VBRI moderasyon kayıtları` })
      .setTimestamp());
  }
  return embeds;
}