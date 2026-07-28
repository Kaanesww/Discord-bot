/**
 * VBRIaimotor — Kod Üretici
 * Doğal dil açıklamasından Discord.js TypeScript komutu üretir.
 * Dış API yok.
 */

import { writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { logger } from "../../lib/logger";

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMMANDS_DIR = join(__dirname, "../commands");
const GENERATED_DIR = join(__dirname, "../../generated-commands");

// ── Komut kategorisi ──────────────────────────────────────────────────────────

type Category = "economy" | "moderation" | "fun" | "utility" | "info" | "custom";

interface ParsedSpec {
  name: string;
  description: string;
  category: Category;
  options: Array<{
    kind: "user" | "string" | "integer" | "boolean" | "channel" | "role";
    name: string;
    description: string;
    required: boolean;
  }>;
  permission?: string;
  logic: string;
}

// ── Keyword haritaları ────────────────────────────────────────────────────────

const CATEGORY_KEYWORDS: Record<Category, string[]> = {
  economy: ["para", "coin", "bakiye", "ekonomi", "transfer", "ödül", "günlük", "satın", "fiyat", "zengin", "mal varlık", "faiz"],
  moderation: ["ban", "kick", "uyar", "warn", "timeout", "sustur", "kilitle", "temizle", "ceza", "moderasyon", "sil", "nuke"],
  fun: ["oyun", "eğlence", "zar", "rulet", "şans", "kumarhane", "blackjack", "müzik", "şarkı", "espri", "fıkra", "quiz", "trivia"],
  utility: ["yardım", "bilgi", "sunucu", "kullanıcı", "rol", "kanal", "ping", "gecikme", "istatistik", "sayaç"],
  info: ["info", "bilgi", "göster", "listele", "durum", "stat", "rapor", "profil", "seviye", "level", "rank"],
  custom: [],
};

function detectCategory(text: string): Category {
  const lower = text.toLowerCase();
  let best: Category = "custom";
  let bestCount = 0;
  for (const [cat, keys] of Object.entries(CATEGORY_KEYWORDS) as [Category, string[]][]) {
    const count = keys.filter((k) => lower.includes(k)).length;
    if (count > bestCount) { bestCount = count; best = cat; }
  }
  return best;
}

// ── Komut adı çıkar ───────────────────────────────────────────────────────────

function extractCommandName(text: string): string {
  const lower = text.toLowerCase();
  // "X komutu yap" veya "X adında bir komut"
  const nameMatch =
    lower.match(/["']([a-zA-ZğüşıöçĞÜŞİÖÇ\-_]+)["']\s*(?:adında|isimli|komut)/i) ??
    lower.match(/(?:komut adı|adı)\s*[:\s]+([a-zA-ZğüşıöçĞÜŞİÖÇ\-_]+)/i) ??
    lower.match(/([a-zA-ZğüşıöçĞÜŞİÖÇ\-_]+)\s+(?:komutu|slash komut)\s+(?:yap|oluştur|ekle)/i);

  if (nameMatch?.[1]) {
    return nameMatch[1]
      .toLowerCase()
      .replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s")
      .replace(/ı/g, "i").replace(/ö/g, "o").replace(/ç/g, "c")
      .replace(/[^a-z0-9\-_]/g, "-")
      .slice(0, 32);
  }

  // Kategoriye göre varsayılan isim
  const cat = detectCategory(text);
  const defaults: Record<Category, string> = {
    economy: "ekonomi", moderation: "modkomut", fun: "oyun",
    utility: "yardimci", info: "bilgi", custom: "yenikomut",
  };
  return defaults[cat];
}

// ── Seçenek çıkar ─────────────────────────────────────────────────────────────

function extractOptions(text: string, category: Category): ParsedSpec["options"] {
  const lower = text.toLowerCase();
  const opts: ParsedSpec["options"] = [];

  if (lower.includes("kullanıcı") || lower.includes("hedef") || lower.includes("kişi") || category === "moderation") {
    opts.push({ kind: "user", name: "kullanici", description: "Hedef kullanıcı", required: true });
  }
  if (lower.includes("miktar") || lower.includes("para") || lower.includes("coin") || lower.includes("kaç")) {
    opts.push({ kind: "integer", name: "miktar", description: "Miktar", required: true });
  }
  if (lower.includes("sebep") || lower.includes("neden") || category === "moderation") {
    opts.push({ kind: "string", name: "sebep", description: "Sebep", required: false });
  }
  if (lower.includes("süre") || lower.includes("zaman") || lower.includes("dakika")) {
    opts.push({ kind: "string", name: "sure", description: "Süre (örn: 10m, 1sa, 2g)", required: true });
  }
  if (lower.includes("mesaj") || lower.includes("metin") || lower.includes("yazı")) {
    opts.push({ kind: "string", name: "mesaj", description: "Mesaj içeriği", required: false });
  }
  if (lower.includes("rol")) {
    opts.push({ kind: "role", name: "rol", description: "Hedef rol", required: false });
  }
  if (lower.includes("kanal")) {
    opts.push({ kind: "channel", name: "kanal", description: "Hedef kanal", required: false });
  }

  return opts;
}

// ── İzin belirle ──────────────────────────────────────────────────────────────

function detectPermission(text: string, category: Category): string | undefined {
  const lower = text.toLowerCase();
  if (lower.includes("admin") || lower.includes("yönetici")) return "Administrator";
  if (lower.includes("moderatör") || lower.includes("mod") || category === "moderation") return "ModerateMembers";
  if (lower.includes("sunucu sahibi") || lower.includes("owner")) return "ManageGuild";
  return undefined;
}

// ── Komut gövdesi üret ────────────────────────────────────────────────────────

function buildLogic(spec: ParsedSpec): string {
  const lower = spec.description.toLowerCase();
  const hasUser = spec.options.some((o) => o.kind === "user");
  const hasMiktar = spec.options.some((o) => o.name === "miktar");
  const hasSebep = spec.options.some((o) => o.name === "sebep");

  const lines: string[] = [];

  if (hasUser) lines.push(`  const target = interaction.options.getUser("kullanici", true);`);
  if (hasMiktar) lines.push(`  const miktar = interaction.options.getInteger("miktar", true);`);
  if (hasSebep) lines.push(`  const sebep = interaction.options.getString("sebep") ?? "Sebep belirtilmedi";`);

  // Kategori bazlı mantık
  if (spec.category === "economy" && lower.includes("bakiye")) {
    lines.push(
      `  // TODO: Bakiye sorgula`,
      `  await interaction.reply({ content: \`💰 \${target?.username ?? interaction.user.username} adlı kullanıcının bakiyesi: **0** coin\`, ephemeral: false });`,
    );
  } else if (spec.category === "economy" && lower.includes("transfer")) {
    lines.push(
      `  if (!target || !miktar || miktar <= 0) {`,
      `    await interaction.reply({ content: "❌ Geçersiz kullanıcı veya miktar.", ephemeral: true });`,
      `    return;`,
      `  }`,
      `  // TODO: Veritabanından para transferi yap`,
      `  await interaction.reply(\`✅ **\${miktar}** coin başarıyla <@\${target.id}> adlı kullanıcıya gönderildi!\`);`,
    );
  } else if (spec.category === "moderation" && lower.includes("uyar")) {
    lines.push(
      `  if (!target) { await interaction.reply({ content: "❌ Kullanıcı bulunamadı.", ephemeral: true }); return; }`,
      `  // TODO: DB'ye uyarı kaydı yaz`,
      `  await interaction.reply(\`⚠️ <@\${target.id}> uyarıldı. Sebep: \${sebep}\`);`,
    );
  } else if (spec.category === "fun" && lower.includes("zar")) {
    lines.push(
      `  const sides = interaction.options.getInteger("yuzey") ?? 6;`,
      `  const result = Math.floor(Math.random() * sides) + 1;`,
      `  await interaction.reply(\`🎲 **\${result}** (1-\${sides} arası)\`);`,
    );
  } else if (spec.category === "info" && lower.includes("sunucu")) {
    lines.push(
      `  const guild = interaction.guild!;`,
      `  await interaction.reply(\`📊 **\${guild.name}** — \${guild.memberCount} üye | Oluşturulma: <t:\${Math.floor(guild.createdTimestamp / 1000)}:R>\`);`,
    );
  } else {
    lines.push(
      `  // TODO: Bu komutun mantığını buraya yaz`,
      `  await interaction.reply({ content: "⚙️ **${spec.name}** komutu çalıştı! (Geliştirme aşamasında)", ephemeral: false });`,
    );
  }

  return lines.join("\n");
}

// ── Option builder oluştur ────────────────────────────────────────────────────

function buildOptionCode(opts: ParsedSpec["options"]): string {
  return opts.map((o) => {
    const req = o.required ? ".setRequired(true)" : "";
    switch (o.kind) {
      case "user":    return `  .addUserOption(opt => opt.setName("${o.name}").setDescription("${o.description}")${req})`;
      case "integer": return `  .addIntegerOption(opt => opt.setName("${o.name}").setDescription("${o.description}")${req})`;
      case "boolean": return `  .addBooleanOption(opt => opt.setName("${o.name}").setDescription("${o.description}")${req})`;
      case "channel": return `  .addChannelOption(opt => opt.setName("${o.name}").setDescription("${o.description}")${req})`;
      case "role":    return `  .addRoleOption(opt => opt.setName("${o.name}").setDescription("${o.description}")${req})`;
      default:        return `  .addStringOption(opt => opt.setName("${o.name}").setDescription("${o.description}")${req})`;
    }
  }).join("\n");
}

// ── Ana kod üretici ───────────────────────────────────────────────────────────

export interface GeneratedCommand {
  filename: string;
  commandName: string;
  description: string;
  category: Category;
  code: string;
}

export function generateCommand(description: string): GeneratedCommand {
  const category = detectCategory(description);
  const name = extractCommandName(description);
  const options = extractOptions(description, category);
  const permission = detectPermission(description, category);

  const spec: ParsedSpec = {
    name,
    description: description.slice(0, 100),
    category,
    options,
    permission,
    logic: "",
  };
  spec.logic = buildLogic(spec);

  const permBlock = permission
    ? `\n  .setDefaultMemberPermissions(PermissionFlagsBits.${permission})`
    : "";

  const permImport = permission
    ? `import { ChatInputCommandInteraction, SlashCommandBuilder, PermissionFlagsBits } from "discord.js";`
    : `import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";`;

  const optionCode = buildOptionCode(options);

  const code = `${permImport}

/**
 * Komut: /${name}
 * Kategori: ${category}
 * Açıklama: ${description.slice(0, 120)}
 * Üretildi: VBRIaimotor v1.0
 */

export const data = new SlashCommandBuilder()
  .setName("${name}")
  .setDescription("${spec.description.replace(/"/g, '\\"')}")${optionCode ? `\n${optionCode}` : ""}${permBlock};

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
${spec.logic}
}
`;

  return {
    filename: `${name}.ts`,
    commandName: name,
    description: spec.description,
    category,
    code,
  };
}

// ── Kodu dosyaya kaydet ───────────────────────────────────────────────────────

export async function saveGeneratedCommand(cmd: GeneratedCommand): Promise<string> {
  try {
    await mkdir(GENERATED_DIR, { recursive: true });
    const filePath = join(GENERATED_DIR, cmd.filename);
    await writeFile(filePath, cmd.code, "utf-8");
    logger.info({ file: cmd.filename }, "VBRIaimotor: komut kaydedildi");
    return filePath;
  } catch (err) {
    logger.error({ err }, "VBRIaimotor: kaydetme hatası");
    throw err;
  }
}

// ── Bekleyen kod onayı (in-memory state) ─────────────────────────────────────

const pendingCode = new Map<string, GeneratedCommand>(); // channelId → cmd

export function setPendingCode(channelId: string, cmd: GeneratedCommand): void {
  pendingCode.set(channelId, cmd);
  // 10 dakika sonra otomatik temizle
  setTimeout(() => pendingCode.delete(channelId), 10 * 60 * 1000);
}

export function getPendingCode(channelId: string): GeneratedCommand | undefined {
  return pendingCode.get(channelId);
}

export function clearPendingCode(channelId: string): void {
  pendingCode.delete(channelId);
}
