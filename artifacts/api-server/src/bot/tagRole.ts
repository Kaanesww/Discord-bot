import { eq } from "drizzle-orm";
import type { Guild, GuildMember, User } from "discord.js";
import { db, pool, tagRoleSettingsTable, type TagRoleSettings } from "@workspace/db";
import { logger } from "../lib/logger";

type PrimaryGuildInfo = {
  identityEnabled?: boolean;
  identityGuildId?: string | null;
  tag?: string | null;
};

type TagRoleSyncResult = {
  added: number;
  removed: number;
  skipped: number;
};

export async function ensureTagRoleSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tag_role_settings (
      guild_id TEXT PRIMARY KEY,
      tag TEXT NOT NULL,
      role_id TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

function getPrimaryGuild(user: User): PrimaryGuildInfo | null {
  const primaryGuild = (user as User & { primaryGuild?: PrimaryGuildInfo | null }).primaryGuild;
  return primaryGuild ?? null;
}

function usesGuildTag(user: User, guildId: string, configuredTag: string): boolean {
  const primaryGuild = getPrimaryGuild(user);
  if (!primaryGuild || primaryGuild.identityEnabled === false) return false;
  if (primaryGuild.identityGuildId && primaryGuild.identityGuildId !== guildId) return false;
  return primaryGuild.tag === configuredTag;
}

export async function getTagRoleSettings(guildId: string): Promise<TagRoleSettings | null> {
  const rows = await db
    .select()
    .from(tagRoleSettingsTable)
    .where(eq(tagRoleSettingsTable.guildId, guildId))
    .limit(1);
  return rows[0] ?? null;
}

export async function setTagRoleSettings(
  guildId: string,
  tag: string,
  roleId: string,
): Promise<void> {
  await db
    .insert(tagRoleSettingsTable)
    .values({ guildId, tag, roleId, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: tagRoleSettingsTable.guildId,
      set: { tag, roleId, updatedAt: new Date() },
    });
}

export async function removeTagRoleSettings(guildId: string): Promise<void> {
  await db
    .delete(tagRoleSettingsTable)
    .where(eq(tagRoleSettingsTable.guildId, guildId));
}

function canManageConfiguredRole(guild: Guild, roleId: string): boolean {
  const role = guild.roles.cache.get(roleId);
  const botMember = guild.members.me;
  if (!role || role.managed || !botMember) return false;
  return botMember.permissions.has("ManageRoles") && role.position < botMember.roles.highest.position;
}

export async function syncMemberTagRole(
  member: GuildMember,
  settings?: TagRoleSettings | null,
): Promise<"added" | "removed" | "unchanged" | "skipped"> {
  if (member.user.bot) return "skipped";

  const currentSettings = settings === undefined
    ? await getTagRoleSettings(member.guild.id)
    : settings;
  if (!currentSettings) return "skipped";

  const role = member.guild.roles.cache.get(currentSettings.roleId);
  if (!role || !canManageConfiguredRole(member.guild, currentSettings.roleId)) {
    logger.warn(
      { guildId: member.guild.id, roleId: currentSettings.roleId },
      "Etiket rolü senkronize edilemedi: rol bulunamadı veya botun rolü yetersiz",
    );
    return "skipped";
  }

  const shouldHaveRole = usesGuildTag(member.user, member.guild.id, currentSettings.tag);
  const hasRole = member.roles.cache.has(role.id);

  if (shouldHaveRole && !hasRole) {
    await member.roles.add(role, "Sunucu etiketi aktif edildi");
    return "added";
  }

  if (!shouldHaveRole && hasRole) {
    await member.roles.remove(role, "Sunucu etiketi kaldırıldı");
    return "removed";
  }

  return "unchanged";
}

export async function syncGuildTagRoles(
  guild: Guild,
  settings?: TagRoleSettings | null,
): Promise<TagRoleSyncResult> {
  const currentSettings = settings === undefined
    ? await getTagRoleSettings(guild.id)
    : settings;
  if (!currentSettings) return { added: 0, removed: 0, skipped: 0 };

  try {
    await guild.members.fetch();
  } catch (err) {
    logger.warn({ err, guildId: guild.id }, "Etiket rolleri için üyeler alınamadı");
  }

  const result: TagRoleSyncResult = { added: 0, removed: 0, skipped: 0 };
  for (const member of guild.members.cache.values()) {
    try {
      const action = await syncMemberTagRole(member, currentSettings);
      if (action === "added") result.added++;
      else if (action === "removed") result.removed++;
      else if (action === "skipped") result.skipped++;
    } catch (err) {
      result.skipped++;
      logger.warn(
        { err, guildId: guild.id, userId: member.id, roleId: currentSettings.roleId },
        "Etiket rolü üyeye uygulanamadı",
      );
    }
  }

  logger.info({ guildId: guild.id, tag: currentSettings.tag, ...result }, "Etiket rolleri senkronize edildi");
  return result;
}

export async function removeManagedRoleFromGuild(
  guild: Guild,
  roleId: string,
): Promise<number> {
  const role = guild.roles.cache.get(roleId);
  if (!role || !canManageConfiguredRole(guild, roleId)) return 0;

  try {
    await guild.members.fetch();
  } catch (err) {
    logger.warn({ err, guildId: guild.id }, "Etiket rolünü temizlemek için üyeler alınamadı");
  }

  let removed = 0;
  for (const member of guild.members.cache.values()) {
    if (member.user.bot || !member.roles.cache.has(roleId)) continue;
    try {
      await member.roles.remove(role, "Etiket rolü ayarı kaldırıldı");
      removed++;
    } catch (err) {
      logger.warn({ err, guildId: guild.id, userId: member.id, roleId }, "Etiket rolü temizlenemedi");
    }
  }
  return removed;
}