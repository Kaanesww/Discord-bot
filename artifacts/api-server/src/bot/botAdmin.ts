import { db, pool } from "@workspace/db";
import { botAdminSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

type BotAdminState = {
  enabled: boolean;
  adminIds: string[];
  expiresAt: number;
};

const SINGLETON_ID = 1;
const CACHE_TTL = 15_000;
let cache: BotAdminState | null = null;

function parseIds(value: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(value ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string" && /^\d{15,20}$/.test(id))
      : [];
  } catch {
    return [];
  }
}

export async function ensureBotAdminSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bot_admin_settings (
      id INTEGER PRIMARY KEY DEFAULT 1,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      admin_ids TEXT NOT NULL DEFAULT '[]',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function readState(): Promise<BotAdminState> {
  if (cache && cache.expiresAt > Date.now()) return cache;
  const row = await db
    .select()
    .from(botAdminSettingsTable)
    .where(eq(botAdminSettingsTable.id, SINGLETON_ID))
    .limit(1)
    .then((rows) => rows[0]);
  const next = {
    enabled: row?.enabled ?? false,
    adminIds: parseIds(row?.adminIds),
    expiresAt: Date.now() + CACHE_TTL,
  };
  cache = next;
  return next;
}

export async function refreshBotAdminCache(): Promise<void> {
  cache = null;
  await readState();
}

export async function isBotAdmin(userId: string): Promise<boolean> {
  const state = await readState();
  return state.enabled && state.adminIds.includes(userId);
}

/** Senkron yetki kontrolleri için son okunan admin listesini kullanır. */
export function isBotAdminCached(userId: string): boolean {
  return Boolean(cache?.enabled && cache.adminIds.includes(userId));
}

export async function getBotAdminState(): Promise<{ enabled: boolean; adminIds: string[] }> {
  const state = await readState();
  return { enabled: state.enabled, adminIds: [...state.adminIds] };
}

export async function setBotAdminEnabled(enabled: boolean): Promise<void> {
  await db
    .insert(botAdminSettingsTable)
    .values({ id: SINGLETON_ID, enabled, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: botAdminSettingsTable.id,
      set: { enabled, updatedAt: new Date() },
    });
  await refreshBotAdminCache();
}

export async function addBotAdmin(userId: string): Promise<boolean> {
  const state = await getBotAdminState();
  if (state.adminIds.includes(userId)) return false;
  const adminIds = [...state.adminIds, userId];
  await db
    .insert(botAdminSettingsTable)
    .values({ id: SINGLETON_ID, adminIds: JSON.stringify(adminIds), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: botAdminSettingsTable.id,
      set: { adminIds: JSON.stringify(adminIds), updatedAt: new Date() },
    });
  await refreshBotAdminCache();
  return true;
}

export async function removeBotAdmin(userId: string): Promise<boolean> {
  const state = await getBotAdminState();
  const adminIds = state.adminIds.filter((id) => id !== userId);
  if (adminIds.length === state.adminIds.length) return false;
  await db
    .insert(botAdminSettingsTable)
    .values({ id: SINGLETON_ID, adminIds: JSON.stringify(adminIds), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: botAdminSettingsTable.id,
      set: { adminIds: JSON.stringify(adminIds), updatedAt: new Date() },
    });
  await refreshBotAdminCache();
  return true;
}