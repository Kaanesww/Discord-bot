import { db } from "@workspace/db";
import { moderationSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { GuildMember } from "discord.js";
import { isOwner } from "./ownerUtils";

// Hangi komut hangi roller kolonuna bakıyor
export type ModCommand =
  | "ban" | "kick" | "warn" | "timeout" | "mute" | "temizle";

const CMD_COL: Record<ModCommand, keyof typeof moderationSettingsTable.$inferSelect> = {
  ban:      "banRoles",
  kick:     "kickRoles",
  warn:     "warnRoles",
  timeout:  "timeoutRoles",
  mute:     "muteRoles",
  temizle:  "temizleRoles",
};

// Bellekte önbellekle
const cache = new Map<string, typeof moderationSettingsTable.$inferSelect>();

export async function getModSettings(guildId: string) {
  if (cache.has(guildId)) return cache.get(guildId)!;
  const rows = await db
    .select()
    .from(moderationSettingsTable)
    .where(eq(moderationSettingsTable.guildId, guildId))
    .limit(1);
  const row = rows[0] ?? null;
  if (row) cache.set(guildId, row);
  return row;
}

function invalidate(guildId: string) {
  cache.delete(guildId);
}

export async function isModEnabled(guildId: string): Promise<boolean> {
  const s = await getModSettings(guildId);
  return s?.enabled ?? false;
}

export async function setModEnabled(guildId: string, enabled: boolean): Promise<void> {
  await db
    .insert(moderationSettingsTable)
    .values({ guildId, enabled, updatedAt: new Date() })
    .onConflictDoUpdate({ target: moderationSettingsTable.guildId, set: { enabled, updatedAt: new Date() } });
  invalidate(guildId);
}

export async function setModLogChannel(guildId: string, channelId: string | null): Promise<void> {
  await db
    .insert(moderationSettingsTable)
    .values({ guildId, logChannelId: channelId, updatedAt: new Date() })
    .onConflictDoUpdate({ target: moderationSettingsTable.guildId, set: { logChannelId: channelId, updatedAt: new Date() } });
  invalidate(guildId);
}

function parseRoles(json: string): string[] {
  try { return JSON.parse(json); } catch { return []; }
}

export async function getRolesForCmd(guildId: string, cmd: ModCommand): Promise<string[]> {
  const s = await getModSettings(guildId);
  if (!s) return [];
  return parseRoles(s[CMD_COL[cmd]] as string);
}

export async function addRoleForCmd(guildId: string, cmd: ModCommand, roleId: string): Promise<string[]> {
  const current = await getRolesForCmd(guildId, cmd);
  if (!current.includes(roleId)) current.push(roleId);
  const col = CMD_COL[cmd] as string;
  const patch: Record<string, unknown> = { [col]: JSON.stringify(current), updatedAt: new Date() };
  await db
    .insert(moderationSettingsTable)
    .values({ guildId, [col]: JSON.stringify(current), updatedAt: new Date() })
    .onConflictDoUpdate({ target: moderationSettingsTable.guildId, set: patch });
  invalidate(guildId);
  return current;
}

export async function removeRoleForCmd(guildId: string, cmd: ModCommand, roleId: string): Promise<string[]> {
  const current = (await getRolesForCmd(guildId, cmd)).filter(r => r !== roleId);
  const col = CMD_COL[cmd] as string;
  const patch: Record<string, unknown> = { [col]: JSON.stringify(current), updatedAt: new Date() };
  await db
    .insert(moderationSettingsTable)
    .values({ guildId, [col]: JSON.stringify(current), updatedAt: new Date() })
    .onConflictDoUpdate({ target: moderationSettingsTable.guildId, set: patch });
  invalidate(guildId);
  return current;
}

// ── İzin kontrolü ─────────────────────────────────────────────────────────────
// Bot sahibi + sunucu sahibi her zaman geçer.
// Mod sistemi kapalıysa → false döner (komut bloklanır).
// Mod sistemi açık + rol ayarlanmışsa → o rolü taşıyan üye geçer.
// Mod sistemi açık + rol ayarlanmamışsa → Discord native iznine bakar.

const DISCORD_PERM: Record<ModCommand, keyof GuildMember["permissions"]["has"] extends never ? never : Parameters<GuildMember["permissions"]["has"]>[0]> = {
  ban:     "BanMembers",
  kick:    "KickMembers",
  warn:    "ModerateMembers",
  timeout: "ModerateMembers",
  mute:    "ManageChannels",
  temizle: "ManageMessages",
} as any;

export async function canUseMod(
  member: GuildMember,
  guildId: string,
  cmd: ModCommand,
): Promise<{ ok: boolean; reason?: string }> {
  // Bot sahibi her zaman geçer
  if (isOwner(member.id)) return { ok: true };
  // Sunucu sahibi her zaman geçer
  if (member.guild.ownerId === member.id) return { ok: true };

  const settings = await getModSettings(guildId);

  // Mod sistemi hiç kurulmamış → Discord native permission kontrolü
  if (!settings) {
    const perm = DISCORD_PERM[cmd] as string;
    return member.permissions.has(perm as any)
      ? { ok: true }
      : { ok: false, reason: `❌ Bu komutu kullanmak için **${perm}** yetkisine ihtiyacın var.` };
  }

  // Mod sistemi kapalı
  if (!settings.enabled) {
    return {
      ok: false,
      reason: "❌ Bu sunucuda moderasyon sistemi **kapalı**. Sunucu sahibi `modsetup aç` ile aktif edebilir.",
    };
  }

  // Mod sistemi açık — rol kontrolü
  const configuredRoles = parseRoles(settings[CMD_COL[cmd]] as string);

  if (configuredRoles.length === 0) {
    // Rol ayarlanmamış → Discord native permission
    const perm = DISCORD_PERM[cmd] as string;
    return member.permissions.has(perm as any)
      ? { ok: true }
      : { ok: false, reason: `❌ Bu komutu kullanmak için **${perm}** yetkisine veya moderatör rolüne ihtiyacın var.` };
  }

  // Kullanıcı configure edilmiş rollerden birini taşıyor mu?
  const hasRole = configuredRoles.some(rId => member.roles.cache.has(rId));
  if (hasRole) return { ok: true };

  // Discord native permission de olabilir
  const perm = DISCORD_PERM[cmd] as string;
  if (member.permissions.has(perm as any)) return { ok: true };

  return {
    ok: false,
    reason: `❌ Bu komutu kullanmak için gerekli moderatör rolüne sahip değilsin.`,
  };
}
