/**
 * Bakım Modu Sistemi
 * ─────────────────────────────────────────────────────────────────────────────
 * Bot sahibi belirli komutları bakıma alabilir.
 * Bakımdaki komutlar tüm sunucularda çalışmaz.
 */

export interface MaintenanceEntry {
  command: string;
  reason: string;
  addedAt: Date;
}

// Bakımdaki komutlar
const maintenanceCommands = new Map<string, MaintenanceEntry>();

// Bot sahibi Discord ID (ClientReady'de set edilir)
let botOwnerId: string | null = null;

export function setBotOwner(id: string): void {
  botOwnerId = id;
}

export function getBotOwner(): string | null {
  return botOwnerId;
}

export function isOwner(userId: string): boolean {
  return botOwnerId !== null && userId === botOwnerId;
}

export function isInMaintenance(command: string): boolean {
  return maintenanceCommands.has(command.toLowerCase());
}

export function addMaintenance(command: string, reason = "Bakım çalışması yapılıyor"): void {
  maintenanceCommands.set(command.toLowerCase(), {
    command: command.toLowerCase(),
    reason,
    addedAt: new Date(),
  });
}

export function removeMaintenance(command: string): boolean {
  return maintenanceCommands.delete(command.toLowerCase());
}

export function clearAllMaintenance(): void {
  maintenanceCommands.clear();
}

export function getMaintenanceList(): MaintenanceEntry[] {
  return Array.from(maintenanceCommands.values()).sort(
    (a, b) => a.addedAt.getTime() - b.addedAt.getTime()
  );
}

/** Geçen süreyi Türkçe formatlar */
export function formatElapsed(date: Date): string {
  const ms = Date.now() - date.getTime();
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}g ${h % 24}sa`;
  if (h > 0) return `${h}sa ${m % 60}dk`;
  if (m > 0) return `${m}dk`;
  return `${s}sn`;
}
