import { db } from "@workspace/db";
import {
  anonymousAccountsTable,
  anonymousBlocksTable,
  anonymousChatTable,
  anonymousPendingTable,
} from "@workspace/db";
import { and, eq, lt } from "drizzle-orm";
import {
  ChannelType,
  type Guild,
  type Message,
  type TextChannel,
  WebhookClient,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import { randomBytes } from "node:crypto";
import { logger } from "../lib/logger";

function makeAlias(): string {
  return `Anonim #${randomBytes(3).toString("hex").toUpperCase()}`;
}

export async function getAnonymousChat(guildId: string) {
  const rows = await db.select().from(anonymousChatTable)
    .where(eq(anonymousChatTable.guildId, guildId)).limit(1);
  return rows[0] ?? null;
}

export async function setAnonymousChat(guildId: string, channelId: string): Promise<void> {
  await db.insert(anonymousChatTable)
    .values({ guildId, channelId, enabled: true })
    .onConflictDoUpdate({
      target: anonymousChatTable.guildId,
      set: { channelId, enabled: true, updatedAt: new Date() },
    });
}

export async function disableAnonymousChat(guildId: string): Promise<void> {
  await db.update(anonymousChatTable)
    .set({ enabled: false, updatedAt: new Date() })
    .where(eq(anonymousChatTable.guildId, guildId));
}

async function getPending(userId: string) {
  const rows = await db.select().from(anonymousPendingTable)
    .where(eq(anonymousPendingTable.userId, userId))
    .limit(1);
  const pending = rows[0] ?? null;
  if (pending && pending.expiresAt <= new Date()) {
    await db.delete(anonymousPendingTable).where(eq(anonymousPendingTable.id, pending.id));
    return null;
  }
  return pending;
}

async function createPending(message: Message): Promise<string> {
  const id = `${message.guildId}-${message.author.id}-${Date.now()}`;
  await db.delete(anonymousPendingTable).where(eq(anonymousPendingTable.userId, message.author.id));
  await db.insert(anonymousPendingTable).values({
    id,
    guildId: message.guildId!,
    channelId: message.channelId,
    userId: message.author.id,
    content: message.content.slice(0, 2000),
    expiresAt: new Date(Date.now() + 10 * 60_000),
  });
  return id;
}

export async function getAnonymousProfile(userId: string) {
  return db.select({
    id: anonymousAccountsTable.id,
    displayName: anonymousAccountsTable.displayName,
    guildId: anonymousAccountsTable.guildId,
  }).from(anonymousAccountsTable).where(eq(anonymousAccountsTable.userId, userId));
}

export async function getAnonymousAccountById(id: string) {
  const rows = await db.select().from(anonymousAccountsTable)
    .where(eq(anonymousAccountsTable.id, id)).limit(1);
  return rows[0] ?? null;
}

function cleanAlias(value: string): string {
  return value.trim().replace(/[\r\n]/g, " ").slice(0, 32);
}

export async function updateAnonymousProfile(
  userId: string,
  accountId: string,
  displayName: string,
): Promise<{ ok: boolean; message: string }> {
  const alias = cleanAlias(displayName);
  if (alias.length < 2) return { ok: false, message: "Profil adı en az 2 karakter olmalı." };
  const account = await getAnonymousAccountById(accountId);
  if (!account || account.userId !== userId) {
    return { ok: false, message: "Bu anonim hesap sana ait değil veya bulunamadı." };
  }
  await db.update(anonymousAccountsTable)
    .set({ displayName: alias })
    .where(eq(anonymousAccountsTable.id, accountId));
  return { ok: true, message: `Anonim profil adın **${alias}** olarak güncellendi.` };
}

export async function isAnonymousBlocked(userId: string, accountId: string): Promise<boolean> {
  const rows = await db.select({ id: anonymousBlocksTable.id })
    .from(anonymousBlocksTable)
    .where(and(
      eq(anonymousBlocksTable.userId, userId),
      eq(anonymousBlocksTable.blockedAccountId, accountId),
    )).limit(1);
  return rows.length > 0;
}

export async function blockAnonymousAccount(
  userId: string,
  accountId: string,
): Promise<{ ok: boolean; message: string }> {
  const account = await getAnonymousAccountById(accountId);
  if (!account) return { ok: false, message: "Bu anonim hesap ID'si bulunamadı." };
  if (account.userId === userId) return { ok: false, message: "Kendi hesabını kara listeye alamazsın." };
  await db.insert(anonymousBlocksTable)
    .values({ userId, blockedAccountId: accountId })
    .onConflictDoNothing();
  return { ok: true, message: `**${account.displayName}** kara listeye alındı. Bu hesaptan gelen anonim DM'ler engellenecek.` };
}

export async function unblockAnonymousAccount(
  userId: string,
  accountId: string,
): Promise<{ ok: boolean; message: string }> {
  const deleted = await db.delete(anonymousBlocksTable)
    .where(and(
      eq(anonymousBlocksTable.userId, userId),
      eq(anonymousBlocksTable.blockedAccountId, accountId),
    )).returning({ id: anonymousBlocksTable.id });
  return deleted.length
    ? { ok: true, message: `Anonim hesap **${accountId}** kara listeden çıkarıldı.` }
    : { ok: false, message: "Bu hesap kara listende değil." };
}

export async function getBlockedAnonymousAccounts(userId: string) {
  return db.select({
    accountId: anonymousBlocksTable.blockedAccountId,
    displayName: anonymousAccountsTable.displayName,
  }).from(anonymousBlocksTable)
    .leftJoin(
      anonymousAccountsTable,
      eq(anonymousAccountsTable.id, anonymousBlocksTable.blockedAccountId),
    )
    .where(eq(anonymousBlocksTable.userId, userId));
}

export async function sendAnonymousMessage(
  senderUserId: string,
  targetAccountId: string,
  content: string,
  client: Message["client"],
): Promise<{ ok: boolean; message: string }> {
  const target = await getAnonymousAccountById(targetAccountId);
  if (!target) return { ok: false, message: "Bu anonim hesap ID'si bulunamadı." };
  if (target.userId === senderUserId) return { ok: false, message: "Kendi anonim hesabına mesaj gönderemezsin." };
  if (await isAnonymousBlocked(target.userId, targetAccountId)) {
    return { ok: false, message: "Bu anonim hesap, anonim DM'leri kabul etmiyor." };
  }

  const senderProfiles = await getAnonymousProfile(senderUserId);
  const senderProfile = senderProfiles[0];
  if (!senderProfile) {
    return { ok: false, message: "Önce anonim bir profil oluşturmalısın. Bir sunucunun anonim kanalında ilk mesajını gönderip onayla." };
  }

  const recipient = await client.users.fetch(target.userId);
  await recipient.send({
    content:
      `🕵️ **Anonim mesajın var**\n\n` +
      `Gönderen: **${senderProfile.displayName}**\n` +
      `Gönderen anonim hesap ID'si: \`${senderProfile.id}\`\n\n` +
      content.trim().slice(0, 1900) +
      `\n\nYanıt almak istemiyorsan: \`v!anon karaliste ekle ${senderProfile.id}\``,
  });
  return { ok: true, message: `✅ Mesajın **${target.displayName}** hesabına anonim olarak gönderildi.` };
}

export async function sendAnonymousProfileDm(userId: string, client: Message["client"]): Promise<void> {
  const user = await client.users.fetch(userId);
  const profiles = await getAnonymousProfile(userId);
  if (!profiles.length) {
    await user.send("🕵️ Henüz oluşturulmuş anonim profilin yok. Anonim kanala ilk mesajında onay istenecek.").catch(() => null);
    return;
  }
  const uniqueServers = [...new Set(profiles.map(p => p.guildId))];
  const serverNames = await Promise.all(uniqueServers.map(async id => {
    const guild = await client.guilds.fetch(id).catch(() => null);
    return guild ? `• ${guild.name}` : `• Bilinmeyen sunucu`;
  }));
  await user.send(
    {
      content: `🕵️ **Anonim Profil Bilgilerin**\n` +
        `Anonim profil sayısı: **${profiles.length}**\n` +
        `Hesap ID'leri:\n${profiles.map(p => `• \`${p.id}\` — **${p.displayName}**`).join("\n")}\n` +
        `Kullanıldığı sunucular:\n${serverNames.join("\n")}\n\n` +
        `Profil fotoğrafın anonim varsayılan avatar olarak gösterilir.`,
      embeds: [new EmbedBuilder()
        .setTitle("Anonim profil fotoğrafı")
        .setThumbnail("https://cdn.discordapp.com/embed/avatars/0.png")
        .setDescription("Bu fotoğraf anonim kimliğini korumak için tüm sunucularda aynıdır.")
        .setColor(0x5865f2)],
    },
  ).catch(() => null);
}

export async function handleAnonymousButton(
  customId: string,
  userId: string,
  client: Message["client"],
): Promise<{ handled: boolean; content?: string }> {
  if (!customId.startsWith("anon_approve:") && !customId.startsWith("anon_deny:")) {
    return { handled: false };
  }
  const [action, pendingId, buttonUserId] = customId.split(":");
  if (buttonUserId !== userId) return { handled: true, content: "❌ Bu onay isteği sana ait değil." };

  const rows = await db.select().from(anonymousPendingTable)
    .where(eq(anonymousPendingTable.id, pendingId!)).limit(1);
  const pending = rows[0];
  if (!pending || pending.userId !== userId || pending.expiresAt <= new Date()) {
    return { handled: true, content: "⌛ Bu anonim profil onay isteğinin süresi dolmuş." };
  }

  await db.delete(anonymousPendingTable).where(eq(anonymousPendingTable.id, pending.id));
  if (action === "anon_deny") return { handled: true, content: "❌ Anonim profil oluşturulmadı. Mesajın yayınlanmadı." };

  const guild = await client.guilds.fetch(pending.guildId);
  const channel = await guild.channels.fetch(pending.channelId);
  if (!channel || channel.type !== ChannelType.GuildText) {
    return { handled: true, content: "❌ Anonim kanal artık bulunamıyor; mesaj yayınlanmadı." };
  }
  const account = await getAccount(pending.guildId, userId) ?? await createAccountFromPending(guild, channel as TextChannel, userId);
  const webhook = new WebhookClient({ id: account.webhookId, token: account.webhookToken });
  await webhook.send({
    content: pending.content,
    username: account.displayName,
    avatarURL: "https://cdn.discordapp.com/embed/avatars/0.png",
    allowedMentions: { parse: [] },
  });
  webhook.destroy();
  return { handled: true, content: "✅ Anonim profilin oluşturuldu ve mesajın anonim olarak gönderildi." };
}

async function createAccountFromPending(guild: Guild, channel: TextChannel, userId: string) {
  const webhook = await channel.createWebhook({
    name: "Anonim Sohbet",
    reason: "Anonim sohbet için kullanıcıya özel profil",
  });
  const account = {
    id: `${guild.id}-${userId}`,
    guildId: guild.id,
    userId,
    displayName: makeAlias(),
    webhookId: webhook.id,
    webhookToken: webhook.token!,
    createdAt: new Date(),
  };
  await db.insert(anonymousAccountsTable).values(account);
  return account;
}

async function getAccount(guildId: string, userId: string) {
  const rows = await db.select().from(anonymousAccountsTable)
    .where(and(
      eq(anonymousAccountsTable.guildId, guildId),
      eq(anonymousAccountsTable.userId, userId),
    )).limit(1);
  return rows[0] ?? null;
}

async function createAccount(message: Message) {
  const channel = message.channel as TextChannel;
  const webhook = await channel.createWebhook({
    name: "Anonim Sohbet",
    reason: "Anonim sohbet için kullanıcıya özel profil",
  });
  const alias = makeAlias();
  const account = {
    id: `${message.guildId}-${message.author.id}`,
    guildId: message.guildId!,
    userId: message.author.id,
    displayName: alias,
    webhookId: webhook.id,
    webhookToken: webhook.token!,
    createdAt: new Date(),
  };
  await db.insert(anonymousAccountsTable).values(account)
    .onConflictDoUpdate({
      target: anonymousAccountsTable.id,
      set: {
        displayName: alias,
        webhookId: webhook.id,
        webhookToken: webhook.token!,
      },
    });
  return account;
}

/**
 * Mesajı kullanıcı adına değil, kullanıcıya özel anonim webhook profiline
 * gönderir. Orijinal mesaj, webhook işlemlerinden önce silinir; böylece
 * normal kullanıcı adı kanalda görünür kalmaz.
 */
export async function handleAnonymousMessage(message: Message): Promise<boolean> {
  if (!message.guildId || message.author.bot) return false;
  const settings = await getAnonymousChat(message.guildId);
  if (!settings?.enabled || settings.channelId !== message.channelId) return false;
  if (message.channel.type !== ChannelType.GuildText) return false;

  const channel = message.channel as TextChannel;

  // Önce sil: webhook oluşturma/gönderme gecikmesi sırasında kullanıcı adı
  // görünmesin. Silme başarısızsa orijinal mesajı anonim olarak kopyalamıyoruz.
  try {
    await message.delete();
  } catch (err) {
    logger.error({ err, guildId: message.guildId, channelId: message.channelId }, "Anonim mesaj silinemedi");
    await channel.send(
      `❌ ${message.author} anonim sohbet için botun **Manage Messages** yetkisi gerekli.`,
    ).then(warning => setTimeout(() => warning.delete().catch(() => null), 7000)).catch(() => null);
    return true;
  }

  let account = await getAccount(message.guildId, message.author.id);
  try {
    if (!account) {
      const pendingId = await createPending(message);
      const dm = await message.author.send({
        content:
          `🕵️ **Anonim profil oluşturma onayı**\n\n` +
          `Bu sunucudaki anonim kanala gönderdiğin mesaj silindi ve yayınlanmayı bekliyor.\n` +
          `Anonim profil oluşturulursa mesajın **${message.guild?.name ?? "bu sunucu"}** sunucusunda anonim olarak paylaşılacak.\n` +
          `Profil fotoğrafı kullanılmayacak; varsayılan anonim avatar gösterilecek.\n\n` +
          `Onay isteği 10 dakika geçerlidir.`,
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(`anon_approve:${pendingId}:${message.author.id}`).setLabel("Anonim profili oluştur ve gönder").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`anon_deny:${pendingId}:${message.author.id}`).setLabel("İptal").setStyle(ButtonStyle.Danger),
        )],
      });
      void dm;
      return true;
    }

    const webhook = new WebhookClient({
      id: account.webhookId,
      token: account.webhookToken,
    });
    await webhook.send({
      content: message.content.slice(0, 2000),
      username: account.displayName,
      // Gerçek profil fotoğrafı kullanılmaz; anonimlik güçlendirilir.
      avatarURL: "https://cdn.discordapp.com/embed/avatars/0.png",
      allowedMentions: { parse: [] },
    });
    webhook.destroy();

    return true;
  } catch (err) {
    logger.error({ err, guildId: message.guildId, channelId: message.channelId }, "Anonim mesaj gönderilemedi");
    await channel.send(
      `❌ ${message.author} anonim mesaj gönderilemedi. Botun bu kanalda **Manage Webhooks** ve **Manage Messages** yetkileri olmalı.`,
    ).then(warning => setTimeout(() => warning.delete().catch(() => null), 7000)).catch(() => null);
    return true;
  }
}

export async function anonymousStatus(guild: Guild): Promise<string> {
  const settings = await getAnonymousChat(guild.id);
  if (!settings?.enabled) return "🔴 Anonim genel sohbet kapalı.";
  const channel = await guild.channels.fetch(settings.channelId).catch(() => null);
  return channel
    ? `🟢 Anonim genel sohbet aktif: <#${settings.channelId}>`
    : "⚠️ Anonim sohbet açık görünüyor ancak kanal bulunamadı. `anon kapat` ile sıfırlayabilirsin.";
}