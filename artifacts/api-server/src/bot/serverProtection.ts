import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  type Guild,
  type GuildChannel,
  type GuildMember,
  type TextChannel,
} from "discord.js";
import { db, pool } from "@workspace/db";
import { serverProtectionSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sendGuardLog } from "./guard";

type ProtectionConfig = typeof serverProtectionSettingsTable.$inferSelect;
export type ProtectionSetupDraft = {
  guildId: string;
  userId: string;
  joinEnabled: boolean;
  leaveEnabled: boolean;
  channelEnabled: boolean;
  roleEnabled: boolean;
  joinThreshold: number;
  leaveThreshold: number;
  changeThreshold: number;
  windowSeconds: number;
};

type ChannelSnapshot = {
  id: string;
  name: string;
  type: number;
  parentId: string | null;
  position: number;
  topic: string | null;
  nsfw: boolean | null;
  rateLimitPerUser: number | null;
  overwrites: Array<{ id: string; type: number; allow: string; deny: string }>;
};

type RoleSnapshot = {
  id: string;
  name: string;
  color: number;
  hoist: boolean;
  mentionable: boolean;
  permissions: string;
  position: number;
};

type MemberSnapshot = { id: string; roleIds: string[] };

const defaults = (guildId: string): ProtectionConfig => ({
  guildId,
  enabled: false,
  locked: false,
  joinEnabled: true,
  leaveEnabled: true,
  channelEnabled: false,
  roleEnabled: false,
  joinThreshold: 5,
  leaveThreshold: 5,
  changeThreshold: 4,
  windowSeconds: 60,
  infoChannelId: null,
  lockReason: null,
  channelSnapshot: null,
  roleSnapshot: null,
  memberSnapshot: null,
  lockedAt: null,
  updatedAt: new Date(),
});

const cache = new Map<string, { value: ProtectionConfig; expiresAt: number }>();
const eventWindows = new Map<string, number[]>();
const locking = new Set<string>();

export async function ensureServerProtectionSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS server_protection_settings (
      guild_id TEXT PRIMARY KEY NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      locked BOOLEAN NOT NULL DEFAULT FALSE,
      join_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      leave_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      channel_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      role_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      join_threshold INTEGER NOT NULL DEFAULT 5,
      leave_threshold INTEGER NOT NULL DEFAULT 5,
      change_threshold INTEGER NOT NULL DEFAULT 4,
      window_seconds INTEGER NOT NULL DEFAULT 60,
      info_channel_id TEXT,
      lock_reason TEXT,
      channel_snapshot TEXT,
      role_snapshot TEXT,
      member_snapshot TEXT,
      locked_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export async function getProtection(guildId: string): Promise<ProtectionConfig> {
  const hit = cache.get(guildId);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  const rows = await db
    .select()
    .from(serverProtectionSettingsTable)
    .where(eq(serverProtectionSettingsTable.guildId, guildId))
    .limit(1);
  const value = rows[0] ?? defaults(guildId);
  cache.set(guildId, { value, expiresAt: Date.now() + 15_000 });
  return value;
}

async function setProtection(
  guildId: string,
  patch: Partial<typeof serverProtectionSettingsTable.$inferInsert>,
): Promise<void> {
  await db
    .insert(serverProtectionSettingsTable)
    .values({ guildId, ...patch, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: serverProtectionSettingsTable.guildId,
      set: { ...patch, updatedAt: new Date() },
    });
  cache.delete(guildId);
}

export function createProtectionSetup(guildId: string, userId: string, config: ProtectionConfig): ProtectionSetupDraft {
  return {
    guildId,
    userId,
    joinEnabled: config.joinEnabled,
    leaveEnabled: config.leaveEnabled,
    channelEnabled: config.channelEnabled,
    roleEnabled: config.roleEnabled,
    joinThreshold: config.joinThreshold,
    leaveThreshold: config.leaveThreshold,
    changeThreshold: config.changeThreshold,
    windowSeconds: config.windowSeconds,
  };
}

export function toggleProtectionSetup(
  draft: ProtectionSetupDraft,
  condition: "join" | "leave" | "channel" | "role",
): ProtectionSetupDraft {
  return {
    ...draft,
    joinEnabled: condition === "join" ? !draft.joinEnabled : draft.joinEnabled,
    leaveEnabled: condition === "leave" ? !draft.leaveEnabled : draft.leaveEnabled,
    channelEnabled: condition === "channel" ? !draft.channelEnabled : draft.channelEnabled,
    roleEnabled: condition === "role" ? !draft.roleEnabled : draft.roleEnabled,
  };
}

export async function saveProtectionSetup(draft: ProtectionSetupDraft): Promise<void> {
  await setProtection(draft.guildId, {
    enabled: true,
    locked: false,
    joinEnabled: draft.joinEnabled,
    leaveEnabled: draft.leaveEnabled,
    channelEnabled: draft.channelEnabled,
    roleEnabled: draft.roleEnabled,
    joinThreshold: Math.max(2, Math.min(100, draft.joinThreshold)),
    leaveThreshold: Math.max(2, Math.min(100, draft.leaveThreshold)),
    changeThreshold: Math.max(2, Math.min(100, draft.changeThreshold)),
    windowSeconds: Math.max(10, Math.min(3600, draft.windowSeconds)),
  });
}

export async function setProtectionEnabled(guildId: string, enabled: boolean): Promise<void> {
  await setProtection(guildId, { enabled });
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  try {
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

function takeChannelSnapshot(channel: GuildChannel): ChannelSnapshot {
  const topic = "topic" in channel && typeof channel.topic === "string" ? channel.topic : null;
  const nsfw = "nsfw" in channel && typeof channel.nsfw === "boolean" ? channel.nsfw : null;
  const rateLimitPerUser = "rateLimitPerUser" in channel && typeof channel.rateLimitPerUser === "number"
    ? channel.rateLimitPerUser
    : null;
  return {
    id: channel.id,
    name: channel.name,
    type: channel.type,
    parentId: channel.parentId,
    position: channel.rawPosition,
    topic,
    nsfw,
    rateLimitPerUser,
    overwrites: channel.permissionOverwrites.cache.map((overwrite) => ({
      id: overwrite.id,
      type: overwrite.type,
      allow: overwrite.allow.bitfield.toString(),
      deny: overwrite.deny.bitfield.toString(),
    })),
  };
}

function takeRoleSnapshot(guild: Guild): RoleSnapshot[] {
  return guild.roles.cache
    .filter((role) => role.id !== guild.id && !role.managed)
    .map((role) => ({
      id: role.id,
      name: role.name,
      color: role.color,
      hoist: role.hoist,
      mentionable: role.mentionable,
      permissions: role.permissions.bitfield.toString(),
      position: role.position,
    }));
}

function takeMemberSnapshot(guild: Guild): MemberSnapshot[] {
  return guild.members.cache.map((member) => ({
    id: member.id,
    roleIds: member.roles.cache
      .filter((role) => role.id !== guild.id && !role.managed)
      .map((role) => role.id),
  }));
}

async function ensureInfoChannel(guild: Guild): Promise<TextChannel> {
  const existing = guild.channels.cache.find(
    (channel) => channel.type === ChannelType.GuildText && channel.name === "sunucu-koruma-bilgi",
  );
  if (existing?.type === ChannelType.GuildText) return existing;

  const overwrites = [
    {
      id: guild.roles.everyone.id,
      allow: [PermissionFlagsBits.ViewChannel],
      deny: [PermissionFlagsBits.SendMessages],
    },
  ];
  if (guild.members.me) {
    overwrites.push({
      id: guild.members.me.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
      ],
      deny: [],
    } as typeof overwrites[number]);
  }
  return guild.channels.create({
    name: "sunucu-koruma-bilgi",
    type: ChannelType.GuildText,
    topic: "Sunucu koruması bilgilendirme ve kurtarma kanalı",
    permissionOverwrites: overwrites,
  });
}

async function applyLockPermissions(guild: Guild, infoChannelId: string): Promise<void> {
  for (const channel of guild.channels.cache.values()) {
    if (channel.id === infoChannelId || !("permissionOverwrites" in channel)) continue;
    await channel.permissionOverwrites.edit(guild.roles.everyone, {
      ViewChannel: false,
      SendMessages: false,
      AddReactions: false,
      Connect: false,
      Speak: false,
    }).catch(() => null);
  }
}

async function removeMemberRoles(guild: Guild): Promise<void> {
  for (const member of guild.members.cache.values()) {
    if (member.user.bot || member.id === guild.ownerId) continue;
    await member.roles.set([], "Sunucu koruması: geçici kilit").catch(() => null);
  }
}

async function lockServerInternal(
  guild: Guild,
  reason: string,
  requireProtectionEnabled: boolean,
): Promise<boolean> {
  if (locking.has(guild.id)) return false;
  const config = await getProtection(guild.id);
  if ((requireProtectionEnabled && !config.enabled) || config.locked) return false;
  locking.add(guild.id);

  try {
    const infoChannel = await ensureInfoChannel(guild);
    await guild.members.fetch().catch(() => null);
    const channels = [...guild.channels.cache.values()]
      .filter((channel) => "permissionOverwrites" in channel)
      .map((channel) => takeChannelSnapshot(channel as GuildChannel));
    const roles = takeRoleSnapshot(guild);
    const members = takeMemberSnapshot(guild);

    await setProtection(guild.id, {
      locked: true,
      infoChannelId: infoChannel.id,
      lockReason: reason,
      channelSnapshot: JSON.stringify(channels),
      roleSnapshot: JSON.stringify(roles),
      memberSnapshot: JSON.stringify(members),
      lockedAt: new Date(),
    });

    await applyLockPermissions(guild, infoChannel.id);
    await removeMemberRoles(guild);

    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle("🔒 Sunucu Koruması Aktif")
      .setDescription(
        "Şüpheli yoğunluk tespit edildiği için sunucu geçici olarak kilitlendi.\n" +
        "Kanallar ve kullanıcı rolleri güvenli biçimde saklandı. Sunucu sahibinin onayıyla eski hâline döndürülebilir.",
      )
      .addFields(
        { name: "Tetiklenme nedeni", value: reason.slice(0, 1024) },
        { name: "Kurtarma", value: "Sunucu sahibi **Koruma Kilidini Kaldır** butonuna basabilir." },
      )
      .setTimestamp();
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`server_protection_clear:${guild.id}:${guild.ownerId}`)
        .setLabel("Koruma Kilidini Kaldır")
        .setStyle(ButtonStyle.Success),
    );
    if (infoChannel.isSendable()) await infoChannel.send({ embeds: [embed], components: [row] }).catch(() => null);
    await sendGuardLog(guild, "protection", `🔒 **Sunucu kilitlendi**\n**Neden:** ${reason}\n**Bilgi kanalı:** <#${infoChannel.id}>`);
    return true;
  } finally {
    locking.delete(guild.id);
  }
}

/** Otomatik guard tetiklemeleri yalnızca koruma açıkken kilitleyebilir. */
export async function lockServer(guild: Guild, reason: string): Promise<boolean> {
  return lockServerInternal(guild, reason, true);
}

/** Sunucu sahibi tarafından başlatılan manuel kilitleme koruma ayarından bağımsızdır. */
export async function manuallyLockServer(guild: Guild, reason: string): Promise<boolean> {
  return lockServerInternal(guild, reason, false);
}

export async function clearProtection(guild: Guild): Promise<boolean> {
  if (locking.has(guild.id)) return false;
  const config = await getProtection(guild.id);
  if (!config.locked) return false;
  locking.add(guild.id);

  try {
    const channels = parseJson<ChannelSnapshot[]>(config.channelSnapshot, []);
    const roles = parseJson<RoleSnapshot[]>(config.roleSnapshot, []);
    const members = parseJson<MemberSnapshot[]>(config.memberSnapshot, []);

    for (const snapshot of roles) {
      const role = guild.roles.cache.get(snapshot.id);
      if (!role || role.managed) continue;
      await role.edit({
        name: snapshot.name,
        color: snapshot.color,
        hoist: snapshot.hoist,
        mentionable: snapshot.mentionable,
        permissions: BigInt(snapshot.permissions),
      }).catch(() => null);
    }
    for (const snapshot of roles.sort((a, b) => a.position - b.position)) {
      await guild.roles.cache.get(snapshot.id)?.setPosition(snapshot.position).catch(() => null);
    }

    for (const snapshot of channels) {
      const channel = guild.channels.cache.get(snapshot.id);
      if (!channel || !("permissionOverwrites" in channel)) continue;
      const edit: { name: string; position: number; topic?: string; nsfw?: boolean; rateLimitPerUser?: number } = {
        name: snapshot.name,
        position: snapshot.position,
      };
      if (snapshot.topic !== null && "topic" in channel) edit.topic = snapshot.topic;
      if (snapshot.nsfw !== null && "nsfw" in channel) edit.nsfw = snapshot.nsfw;
      if (snapshot.rateLimitPerUser !== null && "rateLimitPerUser" in channel) {
        edit.rateLimitPerUser = snapshot.rateLimitPerUser;
      }
      await channel.edit(edit).catch(() => null);
      await channel.setParent(snapshot.parentId).catch(() => null);
      await channel.permissionOverwrites.set(snapshot.overwrites.map((overwrite) => ({
        id: overwrite.id,
        type: overwrite.type,
        allow: BigInt(overwrite.allow),
        deny: BigInt(overwrite.deny),
      }))).catch(() => null);
    }

    for (const snapshot of members) {
      const member = guild.members.cache.get(snapshot.id);
      if (!member || member.user.bot) continue;
      const roleIds = snapshot.roleIds.filter((roleId) => guild.roles.cache.has(roleId));
      await member.roles.set(roleIds, "Sunucu koruması temizlendi: roller geri yüklendi").catch(() => null);
    }

    await setProtection(guild.id, {
      locked: false,
      lockReason: null,
      channelSnapshot: null,
      roleSnapshot: null,
      memberSnapshot: null,
    });
    const infoChannel = config.infoChannelId ? guild.channels.cache.get(config.infoChannelId) : null;
    if (infoChannel?.isTextBased() && infoChannel.isSendable()) {
      await infoChannel.send({
        embeds: [new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle("🔓 Sunucu Koruması Temizlendi")
          .setDescription("Sunucu açıldı; kaydedilen kanal ayarları ve kullanıcı rolleri geri yüklendi.")
          .setTimestamp()],
      }).catch(() => null);
    }
    await sendGuardLog(guild, "protection", "🔓 **Sunucu koruması temizlendi.** Kanallar ve roller geri yüklendi.");
    return true;
  } finally {
    locking.delete(guild.id);
  }
}

export async function disableProtection(guild: Guild): Promise<boolean> {
  const config = await getProtection(guild.id);
  if (config.locked) await clearProtection(guild);
  await setProtectionEnabled(guild.id, false);
  return true;
}

export async function checkProtectionTrigger(
  guild: Guild,
  condition: "join" | "leave" | "channel" | "role",
): Promise<void> {
  const config = await getProtection(guild.id);
  if (!config.enabled || config.locked) return;
  const enabled = condition === "join"
    ? config.joinEnabled
    : condition === "leave"
      ? config.leaveEnabled
      : condition === "channel"
        ? config.channelEnabled
        : config.roleEnabled;
  if (!enabled) return;

  const key = `${guild.id}:${condition}`;
  const now = Date.now();
  const windowMs = config.windowSeconds * 1000;
  const times = (eventWindows.get(key) ?? []).filter((time) => now - time < windowMs);
  times.push(now);
  eventWindows.set(key, times);
  const threshold = condition === "join"
    ? config.joinThreshold
    : condition === "leave"
      ? config.leaveThreshold
      : config.changeThreshold;
  if (times.length < threshold) return;
  eventWindows.set(key, []);
  await lockServer(
    guild,
    `${condition === "join" ? "Kısa sürede çok sayıda giriş" : condition === "leave" ? "Kısa sürede çok sayıda çıkış" : condition === "channel" ? "Kısa sürede çok sayıda kanal değişikliği" : "Kısa sürede çok sayıda rol değişikliği"}: ${times.length} olay / ${config.windowSeconds} saniye`,
  );
}

export function protectionSetupEmbed(draft: ProtectionSetupDraft): EmbedBuilder {
  const state = (enabled: boolean) => enabled ? "🟢 Açık" : "🔴 Kapalı";
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("🛡️ Sunucu Koruması Kurulumu")
    .setDescription("Aşağıdaki koşullardan hangileri gerçekleştiğinde otomatik kilit uygulanacağını seç.")
    .addFields(
      { name: "Toplu giriş", value: `${state(draft.joinEnabled)}\n${draft.joinThreshold} kişi / ${draft.windowSeconds} sn`, inline: true },
      { name: "Toplu çıkış", value: `${state(draft.leaveEnabled)}\n${draft.leaveThreshold} kişi / ${draft.windowSeconds} sn`, inline: true },
      { name: "Kanal değişikliği", value: `${state(draft.channelEnabled)}\n${draft.changeThreshold} olay / ${draft.windowSeconds} sn`, inline: true },
      { name: "Rol değişikliği", value: `${state(draft.roleEnabled)}\n${draft.changeThreshold} olay / ${draft.windowSeconds} sn`, inline: true },
    )
    .setFooter({ text: "Seçimleri değiştirdikten sonra Kurulumu Kaydet butonuna bas." })
    .setTimestamp();
}