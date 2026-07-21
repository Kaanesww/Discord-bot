/**
 * AI Komut Yürütücü
 * ─────────────────────────────────────────────────────────────────────────────
 * Gemini function-calling araçlarını tanımlar ve Discord işlemlerini uygular.
 * Tüm yetki kontrolleri burada yapılır; AI izinleri atlayamaz.
 */

import { ChannelType, TextChannel, type GuildMember, type Message } from "discord.js";
import {
  canUseMod,
  addRoleForCmd,
  removeRoleForCmd,
  setModEnabled,
  setModLogChannel,
  getModSettings,
  type ModCommand,
} from "./moderationSettings";
import { logAction } from "./moderation";
import { isOwner } from "./ownerUtils";
import { setPrefix as setPrefixUtil } from "./guildSettings";
import { logger } from "../lib/logger";

// ── Gemini Araç Tanımları ─────────────────────────────────────────────────────

export const BOT_TOOL_DECLARATIONS = [
  {
    name: "temizle",
    description:
      "Mevcut metin kanalından belirtilen sayıda mesajı siler. Kullanıcının 'temizle' yetkisi olmalı.",
    parameters: {
      type: "object",
      properties: {
        count: {
          type: "number",
          description: "Silinecek mesaj sayısı. 1 ile 100 arasında olmalı.",
        },
      },
      required: ["count"],
    },
  },
  {
    name: "ban",
    description:
      "Bir kullanıcıyı sunucudan yasaklar. Kullanıcının 'ban' yetkisi olmalı.",
    parameters: {
      type: "object",
      properties: {
        userId: {
          type: "string",
          description: "Banlanacak kullanıcının Discord ID'si (sadece sayı, ör: 123456789).",
        },
        reason: { type: "string", description: "Ban sebebi." },
      },
      required: ["userId"],
    },
  },
  {
    name: "kick",
    description:
      "Bir kullanıcıyı sunucudan atar. Kullanıcının 'kick' yetkisi olmalı.",
    parameters: {
      type: "object",
      properties: {
        userId: {
          type: "string",
          description: "Atılacak kullanıcının Discord ID'si.",
        },
        reason: { type: "string", description: "Atma sebebi." },
      },
      required: ["userId"],
    },
  },
  {
    name: "warn",
    description:
      "Bir kullanıcıyı uyarır ve kayıt oluşturur. Kullanıcının 'warn' yetkisi olmalı.",
    parameters: {
      type: "object",
      properties: {
        userId: {
          type: "string",
          description: "Uyarılacak kullanıcının Discord ID'si.",
        },
        reason: { type: "string", description: "Uyarı sebebi." },
      },
      required: ["userId"],
    },
  },
  {
    name: "timeout",
    description:
      "Bir kullanıcıyı belirtilen süre susturur. Kullanıcının 'timeout' yetkisi olmalı.",
    parameters: {
      type: "object",
      properties: {
        userId: {
          type: "string",
          description: "Susturulacak kullanıcının Discord ID'si.",
        },
        duration: {
          type: "string",
          description:
            "Süre formatı: 10m (10 dakika), 1sa (1 saat), 2g (2 gün), 30sn (30 saniye). Maksimum 28g.",
        },
        reason: { type: "string", description: "Susturma sebebi." },
      },
      required: ["userId", "duration"],
    },
  },
  {
    name: "kilitle",
    description:
      "Mevcut kanalı kilitler; hiçbir kullanıcı mesaj gönderemez. 'mute' yetkisi gerekir.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "ac",
    description:
      "Kilitli kanalın kilidini açar, mesaj gönderimi normale döner. 'mute' yetkisi gerekir.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "nuke",
    description:
      "Mevcut kanalı tamamen siler ve aynı ayarlarla yeniden oluşturur. Yalnızca sunucu sahibi veya Administrator kullanabilir.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "setprefix",
    description: "Botun bu sunucudaki prefix'ini değiştirir. Yalnızca sunucu sahibi kullanabilir.",
    parameters: {
      type: "object",
      properties: {
        prefix: { type: "string", description: "Yeni prefix (ör: !, ?, .)" },
      },
      required: ["prefix"],
    },
  },
  {
    name: "modsetup_ac",
    description:
      "Moderasyon sistemini aktif eder. Yalnızca sunucu sahibi kullanabilir.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "modsetup_kapat",
    description: "Moderasyon sistemini kapatır. Yalnızca sunucu sahibi kullanabilir.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "modsetup_log",
    description:
      "Moderasyon log kanalını ayarlar. Yalnızca sunucu sahibi kullanabilir.",
    parameters: {
      type: "object",
      properties: {
        channelId: {
          type: "string",
          description: "Log olarak kullanılacak kanalın Discord ID'si.",
        },
      },
      required: ["channelId"],
    },
  },
  {
    name: "modsetup_rol_ekle",
    description:
      "Bir role belirli bir moderasyon komutu için yetki verir. Yalnızca sunucu sahibi kullanabilir.",
    parameters: {
      type: "object",
      properties: {
        cmd: {
          type: "string",
          description: "Yetki verilecek komut. Geçerli değerler: ban, kick, warn, timeout, mute, temizle",
        },
        roleId: {
          type: "string",
          description: "Yetki verilecek rolün Discord ID'si.",
        },
      },
      required: ["cmd", "roleId"],
    },
  },
  {
    name: "modsetup_rol_kaldir",
    description:
      "Bir rolün belirli bir moderasyon komutu üzerindeki yetkisini kaldırır. Yalnızca sunucu sahibi kullanabilir.",
    parameters: {
      type: "object",
      properties: {
        cmd: {
          type: "string",
          description: "Yetkisi kaldırılacak komut: ban, kick, warn, timeout, mute, temizle",
        },
        roleId: {
          type: "string",
          description: "Yetkisi kaldırılacak rolün Discord ID'si.",
        },
      },
      required: ["cmd", "roleId"],
    },
  },
  {
    name: "modsetup_durum",
    description:
      "Moderasyon sisteminin mevcut ayarlarını gösterir (hangi roller hangi komutları kullanabilir).",
    parameters: { type: "object", properties: {}, required: [] },
  },
];

// ── Yardımcılar ───────────────────────────────────────────────────────────────

/** Discord mention / raw ID → pure ID */
function extractId(value: string): string {
  return value.replace(/[<@#&!>]/g, "").trim();
}

function parseDuration(str: string): number | null {
  const m = str.match(/^(\d+)(sn|sa|s|m|h|g|d)$/i);
  if (!m) return null;
  const val = parseInt(m[1]!);
  const unit = m[2]!.toLowerCase();
  const map: Record<string, number> = {
    sn: 1_000, s: 1_000,
    m: 60_000,
    sa: 3_600_000, h: 3_600_000,
    g: 86_400_000, d: 86_400_000,
  };
  return val * (map[unit] ?? 0);
}

async function sendModLog(message: Message, guildId: string, text: string): Promise<void> {
  try {
    const s = await getModSettings(guildId);
    if (!s?.logChannelId) return;
    const ch = await message.guild?.channels.fetch(s.logChannelId).catch(() => null);
    if (ch?.isTextBased()) await (ch as TextChannel).send(text);
  } catch { /**/ }
}

const MOD_CMD_MAP: Record<string, ModCommand> = {
  ban: "ban", unban: "ban",
  kick: "kick",
  warn: "warn",
  timeout: "timeout", sustur: "timeout",
  mute: "mute", kilitle: "mute",
  temizle: "temizle", nuke: "temizle",
};

const MOD_CMD_LABELS: Record<ModCommand, string> = {
  ban: "ban / unban",
  kick: "kick",
  warn: "warn",
  timeout: "timeout / sustur",
  mute: "kilitle / ac",
  temizle: "temizle / nuke",
};

// ── Ana yürütücü ──────────────────────────────────────────────────────────────

export async function executeToolCall(
  toolName: string,
  params: Record<string, unknown>,
  message: Message,
): Promise<string> {
  if (!message.guild || !message.guildId || !message.member) {
    return "❌ Bu komutu sadece bir sunucuda kullanabilirsin.";
  }

  const member = message.member as GuildMember;
  const guildId  = message.guildId;
  const isGuildOwner = message.guild.ownerId === message.author.id;
  const isBotOwner   = isOwner(message.author.id);
  const isPrivileged = isGuildOwner || isBotOwner;

  try {
    switch (toolName) {

      // ── temizle ────────────────────────────────────────────────────────────
      case "temizle": {
        const perm = await canUseMod(member, guildId, "temizle");
        if (!perm.ok) return perm.reason!;
        if (!(message.channel instanceof TextChannel)) {
          return "❌ Bu komut sadece metin kanallarında çalışır.";
        }
        const count = Math.min(Math.max(1, Math.round(Number(params.count) || 10)), 100);
        const msgs    = await message.channel.messages.fetch({ limit: count + 1 });
        const deleted = await message.channel.bulkDelete(msgs, true);
        const n       = Math.max(deleted.size - 1, 0);
        const notice  = await message.channel.send(`🗑️ **${n}** mesaj silindi.`);
        setTimeout(() => notice.delete().catch(() => null), 4000);
        return `✅ ${n} mesaj silindi.`;
      }

      // ── ban ────────────────────────────────────────────────────────────────
      case "ban": {
        const perm = await canUseMod(member, guildId, "ban");
        if (!perm.ok) return perm.reason!;
        const userId = extractId(String(params.userId ?? ""));
        if (!userId) return "❌ Geçerli bir kullanıcı ID'si belirtilemedi.";
        const reason = String(params.reason ?? "Sebep belirtilmedi");
        try {
          const target = await message.client.users.fetch(userId);
          await message.guild.bans.create(userId, { reason });
          const log = await logAction({ guildId, userId, moderatorId: message.author.id, action: "ban", reason });
          await sendModLog(message, guildId,
            `🔨 **Ban (AI)** | <@${userId}> (${target.tag}) | Mod: <@${message.author.id}> | Sebep: ${reason} | #${log.id}`);
          return `🔨 **${target.username}** yasaklandı. Sebep: ${reason}`;
        } catch {
          return "❌ Bu kullanıcıyı yasaklayamıyorum (yetki hiyerarşisi veya geçersiz ID).";
        }
      }

      // ── kick ───────────────────────────────────────────────────────────────
      case "kick": {
        const perm = await canUseMod(member, guildId, "kick");
        if (!perm.ok) return perm.reason!;
        const userId = extractId(String(params.userId ?? ""));
        if (!userId) return "❌ Geçerli bir kullanıcı ID'si belirtilemedi.";
        const reason = String(params.reason ?? "Sebep belirtilmedi");
        try {
          const target = await message.guild.members.fetch(userId);
          if (!target.kickable && !isBotOwner) return "❌ Bu kullanıcıyı atamıyorum (yetki hiyerarşisi).";
          await target.kick(reason);
          const log = await logAction({ guildId, userId, moderatorId: message.author.id, action: "kick", reason });
          await sendModLog(message, guildId,
            `👢 **Kick (AI)** | <@${userId}> (${target.user.tag}) | Mod: <@${message.author.id}> | Sebep: ${reason} | #${log.id}`);
          return `👢 **${target.user.username}** atıldı. Sebep: ${reason}`;
        } catch {
          return "❌ Kullanıcı bulunamadı veya atılamıyor.";
        }
      }

      // ── warn ───────────────────────────────────────────────────────────────
      case "warn": {
        const perm = await canUseMod(member, guildId, "warn");
        if (!perm.ok) return perm.reason!;
        const userId = extractId(String(params.userId ?? ""));
        if (!userId) return "❌ Geçerli bir kullanıcı ID'si belirtilemedi.";
        const reason = String(params.reason ?? "Sebep belirtilmedi");
        const log = await logAction({ guildId, userId, moderatorId: message.author.id, action: "warn", reason });
        await sendModLog(message, guildId,
          `⚠️ **Uyarı (AI)** | <@${userId}> | Mod: <@${message.author.id}> | Sebep: ${reason} | #${log.id}`);
        try {
          const u = await message.client.users.fetch(userId);
          await u.send(`⚠️ **${message.guild.name}** sunucusunda uyarı aldın!\nSebep: ${reason} | #${log.id}`);
        } catch { /**/ }
        return `⚠️ <@${userId}> uyarıldı. Sebep: ${reason} | #${log.id}`;
      }

      // ── timeout ────────────────────────────────────────────────────────────
      case "timeout": {
        const perm = await canUseMod(member, guildId, "timeout");
        if (!perm.ok) return perm.reason!;
        const userId = extractId(String(params.userId ?? ""));
        if (!userId) return "❌ Geçerli bir kullanıcı ID'si belirtilemedi.";
        const durationStr = String(params.duration ?? "");
        const ms = parseDuration(durationStr);
        if (!ms || ms < 1000 || ms > 28 * 24 * 3_600_000) {
          return "❌ Geçersiz süre. Örnekler: `10m`, `1sa`, `2g` (Maks: 28 gün)";
        }
        const reason = String(params.reason ?? "Sebep belirtilmedi");
        try {
          const target = await message.guild.members.fetch(userId);
          await target.timeout(ms, reason);
          const log = await logAction({ guildId, userId, moderatorId: message.author.id, action: "timeout", reason });
          await sendModLog(message, guildId,
            `⏰ **Timeout (AI)** | <@${userId}> | Süre: ${durationStr} | Mod: <@${message.author.id}> | Sebep: ${reason} | #${log.id}`);
          return `⏰ <@${userId}> ${durationStr} susturuldu. Sebep: ${reason}`;
        } catch {
          return "❌ Bu kullanıcıya timeout uygulanamıyor.";
        }
      }

      // ── kilitle ────────────────────────────────────────────────────────────
      case "kilitle": {
        const perm = await canUseMod(member, guildId, "mute");
        if (!perm.ok) return perm.reason!;
        if (!(message.channel instanceof TextChannel)) return "❌ Metin kanalı gerekli.";
        await message.channel.permissionOverwrites.edit(guildId, { SendMessages: false });
        await sendModLog(message, guildId,
          `🔒 **Kanal Kilidi (AI)** | <#${message.channelId}> | Mod: <@${message.author.id}>`);
        return "🔒 Kanal kilitlendi.";
      }

      // ── aç ────────────────────────────────────────────────────────────────
      case "ac": {
        const perm = await canUseMod(member, guildId, "mute");
        if (!perm.ok) return perm.reason!;
        if (!(message.channel instanceof TextChannel)) return "❌ Metin kanalı gerekli.";
        await message.channel.permissionOverwrites.edit(guildId, { SendMessages: null });
        await sendModLog(message, guildId,
          `🔓 **Kanal Kilidi Açıldı (AI)** | <#${message.channelId}> | Mod: <@${message.author.id}>`);
        return "🔓 Kanal kilidi açıldı.";
      }

      // ── nuke ───────────────────────────────────────────────────────────────
      case "nuke": {
        const perm = await canUseMod(member, guildId, "temizle");
        const isAdmin = member.permissions.has("Administrator");
        if (!perm.ok && !isAdmin && !isPrivileged) {
          return "❌ Nuke için sunucu sahibi veya Administrator yetkisi gerekir.";
        }
        if (!(message.channel instanceof TextChannel)) return "❌ Metin kanalı gerekli.";
        const ch = message.channel;
        const { name, topic, nsfw, rateLimitPerUser, position, parentId } = ch;
        const overwrites = ch.permissionOverwrites.cache.map((o) => ({
          id: o.id, allow: o.allow, deny: o.deny, type: o.type,
        }));
        await ch.delete(`Nuke (AI) — ${message.author.tag}`);
        const newCh = await message.guild.channels.create({
          name, type: ChannelType.GuildText,
          topic: topic ?? undefined, nsfw, rateLimitPerUser, position,
          parent: parentId ?? undefined, permissionOverwrites: overwrites,
        });
        await newCh.send("💥 **NUKE!** Kanal temizlendi ve yeniden oluşturuldu.");
        return "✅ Nuke tamamlandı.";
      }

      // ── setprefix ──────────────────────────────────────────────────────────
      case "setprefix": {
        if (!isPrivileged) return "❌ Prefix'i sadece sunucu sahibi değiştirebilir.";
        const prefix = String(params.prefix ?? "").slice(0, 5).trim();
        if (!prefix) return "❌ Geçerli bir prefix belirt.";
        await setPrefixUtil(guildId, prefix);
        return `✅ Botun yeni prefix'i: **\`${prefix}\`**`;
      }

      // ── modsetup_ac ────────────────────────────────────────────────────────
      case "modsetup_ac": {
        if (!isPrivileged) return "❌ Bu işlemi sadece sunucu sahibi yapabilir.";
        await setModEnabled(guildId, true);
        return (
          "🟢 **Moderasyon sistemi aktif edildi!**\n" +
          "Şu an tüm mod komutları Discord native iznine bakıyor.\n" +
          "Rol izni tanımlamak için: `@ben ban yetkisini @Moderatör rolüne ver` veya `modsetup rol ban @Moderatör`"
        );
      }

      // ── modsetup_kapat ─────────────────────────────────────────────────────
      case "modsetup_kapat": {
        if (!isPrivileged) return "❌ Bu işlemi sadece sunucu sahibi yapabilir.";
        await setModEnabled(guildId, false);
        return "🔴 **Moderasyon sistemi kapatıldı.** Tüm mod komutları devre dışı.";
      }

      // ── modsetup_log ───────────────────────────────────────────────────────
      case "modsetup_log": {
        if (!isPrivileged) return "❌ Bu işlemi sadece sunucu sahibi yapabilir.";
        const channelId = extractId(String(params.channelId ?? ""));
        if (!channelId) return "❌ Geçerli bir kanal ID'si belirt.";
        await setModLogChannel(guildId, channelId);
        return `✅ Mod log kanalı <#${channelId}> olarak ayarlandı.`;
      }

      // ── modsetup_rol_ekle ──────────────────────────────────────────────────
      case "modsetup_rol_ekle": {
        if (!isPrivileged) return "❌ Bu işlemi sadece sunucu sahibi yapabilir.";
        const cmdRaw = String(params.cmd ?? "").toLowerCase().trim();
        const roleId = extractId(String(params.roleId ?? ""));
        const cmd    = MOD_CMD_MAP[cmdRaw];
        if (!cmd) {
          return `❌ Geçersiz komut: \`${cmdRaw}\`\nGeçerli değerler: ${Object.keys(MOD_CMD_MAP).join(", ")}`;
        }
        if (!roleId) return "❌ Geçerli bir rol ID'si belirtilemedi.";
        const roles = await addRoleForCmd(guildId, cmd, roleId);
        return (
          `✅ <@&${roleId}> rolüne **${MOD_CMD_LABELS[cmd]}** yetkisi verildi.\n` +
          `Bu komutu kullanabilecek roller: ${roles.map((r) => `<@&${r}>`).join(", ")}`
        );
      }

      // ── modsetup_rol_kaldir ────────────────────────────────────────────────
      case "modsetup_rol_kaldir": {
        if (!isPrivileged) return "❌ Bu işlemi sadece sunucu sahibi yapabilir.";
        const cmdRaw = String(params.cmd ?? "").toLowerCase().trim();
        const roleId = extractId(String(params.roleId ?? ""));
        const cmd    = MOD_CMD_MAP[cmdRaw];
        if (!cmd) {
          return `❌ Geçersiz komut: \`${cmdRaw}\``;
        }
        if (!roleId) return "❌ Geçerli bir rol ID'si belirtilemedi.";
        const roles = await removeRoleForCmd(guildId, cmd, roleId);
        return (
          `✅ <@&${roleId}> rolünün **${MOD_CMD_LABELS[cmd]}** yetkisi kaldırıldı.\n` +
          `Kalan roller: ${roles.length ? roles.map((r) => `<@&${r}>`).join(", ") : "*(yok — Discord native izni kullanılır)*"}`
        );
      }

      // ── modsetup_durum ─────────────────────────────────────────────────────
      case "modsetup_durum": {
        const s       = await getModSettings(guildId);
        const enabled = s?.enabled ?? false;
        const log     = s?.logChannelId ? `<#${s.logChannelId}>` : "Ayarlanmamış";
        const cmds    = (Object.entries(MOD_CMD_LABELS) as [ModCommand, string][]).map(([cmd, label]) => {
          const roles: string[] = s ? JSON.parse((s as Record<string, string>)[`${cmd}Roles`] ?? "[]") : [];
          const roleStr = roles.length ? roles.map((r) => `<@&${r}>`).join(", ") : "*(sadece Discord izni)*";
          return `**${label}** → ${roleStr}`;
        });
        return (
          `🛡️ **Moderasyon Sistemi** — ${message.guild.name}\n` +
          `Durum: ${enabled ? "🟢 **Aktif**" : "🔴 **Kapalı**"}\n` +
          `📋 Log kanalı: ${log}\n\n` +
          `**Komut Rol İzinleri:**\n${cmds.join("\n")}`
        );
      }

      default:
        logger.warn({ toolName }, "Bilinmeyen AI aracı çağrıldı");
        return `❌ Bilinmeyen araç: \`${toolName}\``;
    }
  } catch (err: unknown) {
    logger.error({ err, toolName, params }, "AI komut yürütme hatası");
    const msg = err instanceof Error ? err.message : "Bilinmeyen hata";
    return `❌ Komut çalıştırılırken hata: ${msg}`;
  }
}
