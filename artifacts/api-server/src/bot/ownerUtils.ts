/** Bot sahibi ID — tüm yetki kontrollerini atlar */
export const BOT_OWNER_ID = "1392892030257987836";

/** Kullanıcı bot sahibi mi? */
export function isOwner(userId: string): boolean {
  return userId === BOT_OWNER_ID;
}
