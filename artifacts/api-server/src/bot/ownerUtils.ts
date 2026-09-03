import { isBotAdminCached } from "./botAdmin";
import { getBotOwner } from "./maintenance";

/** Eski kurulumlarda fallback olarak kullanılan bot sahibi ID. */
export const BOT_OWNER_ID = "1392892030257987836";

/** Gerçek bot sahibi kontrolü. */
export function isBotOwner(userId: string): boolean {
  return userId === BOT_OWNER_ID || getBotOwner() === userId;
}

/** Bot sahibi veya aktif bot admini mi? */
export function isOwner(userId: string): boolean {
  return isBotOwner(userId) || isBotAdminCached(userId);
}
