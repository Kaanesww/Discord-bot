/**
 * Gelişmiş Otorol Sistemi
 * ─────────────────────────────────────────────────────────────────────────────
 * Üye sunucuya katıldığında yapılandırılmış rolleri otomatik atar.
 *
 * Hedef türleri:
 *   all   → tüm üyeler (insan + bot)
 *   human → yalnızca gerçek kullanıcılar
 *   bot   → yalnızca botlar
 *
 * Ek koşul: minAccountAgeDays > 0 ise hesap bu kadar günden eski olmalıdır.
 * Bot hesaplara hesap yaşı kontrolü uygulanmaz.
 */

import { db }                      from "@workspace/db";
import { autoRoleSettingsTable }   from "@workspace/db";
import { eq, and }                 from "drizzle-orm";
import { type GuildMember, Role }  from "discord.js";
import { logger }                  from "../lib/logger";

// ── DB CRUD ───────────────────────────────────────────────────────────────────

export async function getAutoRoles(guildId: string) {
  return db
    .select()
    .from(autoRoleSettingsTable)
    .where(and(
      eq(autoRoleSettingsTable.guildId, guildId),
      eq(autoRoleSettingsTable.enabled, true),
    ));
}

export async function getAllAutoRoles(guildId: string) {
  return db
    .select()
    .from(autoRoleSettingsTable)
    .where(eq(autoRoleSettingsTable.guildId, guildId));
}

export async function addAutoRole(
  guildId:           string,
  roleId:            string,
  target:            "all" | "human" | "bot" = "all",
  minAccountAgeDays: number = 0,
): Promise<void> {
  await db
    .insert(autoRoleSettingsTable)
    .values({ guildId, roleId, target, minAccountAgeDays })
    .onConflictDoUpdate({
      target: [autoRoleSettingsTable.guildId, autoRoleSettingsTable.roleId],
      set:    { target, minAccountAgeDays, enabled: true },
    });
}

export async function removeAutoRole(guildId: string, roleId: string): Promise<boolean> {
  const rows = await db
    .delete(autoRoleSettingsTable)
    .where(and(
      eq(autoRoleSettingsTable.guildId, guildId),
      eq(autoRoleSettingsTable.roleId, roleId),
    ))
    .returning();
  return rows.length > 0;
}

export async function toggleAutoRole(guildId: string, roleId: string, enabled: boolean): Promise<void> {
  await db
    .update(autoRoleSettingsTable)
    .set({ enabled })
    .where(and(
      eq(autoRoleSettingsTable.guildId, guildId),
      eq(autoRoleSettingsTable.roleId, roleId),
    ));
}

export async function clearAutoRoles(guildId: string): Promise<void> {
  await db
    .delete(autoRoleSettingsTable)
    .where(eq(autoRoleSettingsTable.guildId, guildId));
}

// ── Üye katılımında rol atama ─────────────────────────────────────────────────

export async function applyAutoRoles(member: GuildMember): Promise<void> {
  const settings = await getAutoRoles(member.guild.id).catch(() => []);
  if (settings.length === 0) return;

  const isBot        = member.user.bot;
  const accountAgeMs = Date.now() - member.user.createdTimestamp;
  const accountAgeDays = accountAgeMs / (1000 * 60 * 60 * 24);

  const toAdd: string[] = [];

  for (const s of settings) {
    // Hedef türü kontrolü
    if (s.target === "human" &&  isBot) continue;
    if (s.target === "bot"   && !isBot) continue;

    // Hesap yaşı kontrolü (botlara uygulanmaz)
    if (!isBot && s.minAccountAgeDays > 0 && accountAgeDays < s.minAccountAgeDays) continue;

    // Rol mevcut mu ve bot yönetebilir mi?
    const role = member.guild.roles.cache.get(s.roleId);
    if (!role || role.managed) continue;
    if (role.position >= member.guild.members.me!.roles.highest.position) continue;

    toAdd.push(s.roleId);
  }

  if (toAdd.length === 0) return;

  try {
    await member.roles.add(toAdd, "Otorol sistemi");
    logger.info({ guildId: member.guild.id, userId: member.id, roles: toAdd }, "Otorol uygulandı");
  } catch (err) {
    logger.warn({ err, guildId: member.guild.id, userId: member.id }, "Otorol atanamadı");
  }
}
