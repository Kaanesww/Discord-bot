import { db } from "@workspace/db";
import { moderationLogsTable } from "@workspace/db";
import { and, eq, desc } from "drizzle-orm";
import type { ModerationLog } from "@workspace/db";

export type ModAction = "warn" | "kick" | "ban" | "unban" | "timeout" | "untimeout";

export async function logAction(opts: {
  guildId: string;
  userId: string;
  moderatorId: string;
  action: ModAction;
  reason?: string;
  duration?: number;
}): Promise<ModerationLog> {
  const [row] = await db
    .insert(moderationLogsTable)
    .values({
      guildId: opts.guildId,
      userId: opts.userId,
      moderatorId: opts.moderatorId,
      action: opts.action,
      reason: opts.reason ?? null,
      duration: opts.duration ?? null,
      active: true,
      createdAt: new Date(),
    })
    .returning();
  return row!;
}

export async function getUserLogs(
  userId: string,
  guildId: string,
): Promise<ModerationLog[]> {
  return db
    .select()
    .from(moderationLogsTable)
    .where(
      and(
        eq(moderationLogsTable.userId, userId),
        eq(moderationLogsTable.guildId, guildId),
      ),
    )
    .orderBy(desc(moderationLogsTable.createdAt));
}

export async function getLogById(
  id: number,
  guildId: string,
): Promise<ModerationLog | undefined> {
  const rows = await db
    .select()
    .from(moderationLogsTable)
    .where(
      and(
        eq(moderationLogsTable.id, id),
        eq(moderationLogsTable.guildId, guildId),
      ),
    )
    .limit(1);
  return rows[0];
}

export async function deactivateLog(id: number, guildId: string): Promise<boolean> {
  const result = await db
    .update(moderationLogsTable)
    .set({ active: false })
    .where(
      and(
        eq(moderationLogsTable.id, id),
        eq(moderationLogsTable.guildId, guildId),
        eq(moderationLogsTable.action, "warn"),
      ),
    )
    .returning();
  return result.length > 0;
}

export function actionLabel(action: string): string {
  const map: Record<string, string> = {
    warn: "⚠️ Uyarı",
    kick: "👢 Kick",
    ban: "🔨 Ban",
    unban: "✅ Unban",
    timeout: "🔇 Timeout",
    untimeout: "🔊 Timeout Kaldırma",
  };
  return map[action] ?? action;
}

export function actionColor(action: string): string {
  const map: Record<string, string> = {
    warn: "#faa61a",
    kick: "#ed4245",
    ban: "#eb459e",
    unban: "#57f287",
    timeout: "#5865f2",
    untimeout: "#57f287",
  };
  return map[action] ?? "#99aab5";
}
