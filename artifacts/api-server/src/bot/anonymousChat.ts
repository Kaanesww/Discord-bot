import { db } from "@workspace/db";
import {
  anonymousAccountsTable,
  anonymousBlocksTable,
  anonymousChatTable,
  anonymousPendingTable,
  anonymousSessionsTable,
  anonymousConversationRequestsTable,
  anonymousMessagesTable,
  anonymousIdRequestsTable,
} from "@workspace/db";
import { pool } from "@workspace/db";
import { and, eq, lt, or, sql } from "drizzle-orm";
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
  PermissionFlagsBits,
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

/** Yeni anonim kanal alanları için güvenli, tekrar çalıştırılabilir şema hazırlığı. */
export async function ensureAnonymousSchema(): Promise<void> {
  // Bazı kurulumlarda Drizzle şeması henüz push edilmemiş olabilir.
  // Anonim özelliğinin açılışta güvenli şekilde hazırlanması için temel tabloları da oluştur.
  await pool.query(`CREATE TABLE IF NOT EXISTS anonymous_chat (
    guild_id text PRIMARY KEY, channel_id text NOT NULL, approval_channel_id text,
    category_id text, general_webhook_id text, general_webhook_token text,
    enabled boolean NOT NULL DEFAULT true,
    updated_at timestamp NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS anonymous_accounts (
    id text PRIMARY KEY, guild_id text NOT NULL, user_id text NOT NULL,
    display_name text NOT NULL, webhook_id text NOT NULL, webhook_token text NOT NULL,
    anonymous_number integer, private_channel_id text, points integer NOT NULL DEFAULT 0,
     avatar_url text, private_webhook_id text, private_webhook_token text,
    active boolean NOT NULL DEFAULT true,
    created_at timestamp NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS anonymous_pending (
    id text PRIMARY KEY, guild_id text NOT NULL, channel_id text NOT NULL,
    user_id text NOT NULL, content text NOT NULL, expires_at timestamp NOT NULL,
    created_at timestamp NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS anonymous_blocks (
    id serial PRIMARY KEY, user_id text NOT NULL, blocked_account_id text NOT NULL,
    created_at timestamp NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS anonymous_sessions (
    id serial PRIMARY KEY, guild_id text, user_a_id text NOT NULL, user_a_account_id text NOT NULL,
    user_b_id text NOT NULL, user_b_account_id text NOT NULL,
    channel_a_id text, channel_b_id text, relay_channel_id text,
    active boolean NOT NULL DEFAULT true, updated_at timestamp NOT NULL DEFAULT now(),
    created_at timestamp NOT NULL DEFAULT now()
  )`);
  await pool.query(`ALTER TABLE anonymous_sessions
    ADD COLUMN IF NOT EXISTS guild_id text,
    ADD COLUMN IF NOT EXISTS channel_a_id text,
    ADD COLUMN IF NOT EXISTS channel_b_id text,
    ADD COLUMN IF NOT EXISTS relay_channel_id text`);
  await pool.query(`ALTER TABLE anonymous_chat
    ADD COLUMN IF NOT EXISTS approval_channel_id text,
    ADD COLUMN IF NOT EXISTS category_id text,
    ADD COLUMN IF NOT EXISTS general_webhook_id text,
    ADD COLUMN IF NOT EXISTS general_webhook_token text`);
  await pool.query(`ALTER TABLE anonymous_accounts
    ADD COLUMN IF NOT EXISTS anonymous_number integer,
    ADD COLUMN IF NOT EXISTS anonymous_id text,
    ADD COLUMN IF NOT EXISTS private_channel_id text,
    ADD COLUMN IF NOT EXISTS points integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS avatar_url text,
     ADD COLUMN IF NOT EXISTS private_webhook_id text,
     ADD COLUMN IF NOT EXISTS private_webhook_token text,
    ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true`);
  await pool.query(`CREATE TABLE IF NOT EXISTS anonymous_messages (
    id serial PRIMARY KEY,
    guild_id text NOT NULL,
    sender_account_id text NOT NULL,
    source_message_id text NOT NULL UNIQUE,
    general_message_id text NOT NULL,
    recipient_message_ids text NOT NULL DEFAULT '{}',
    created_at timestamp NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS anonymous_accounts_guild_user_unique
    ON anonymous_accounts (guild_id, user_id)`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS anonymous_accounts_guild_number_unique
    ON anonymous_accounts (guild_id, anonymous_number) WHERE anonymous_number IS NOT NULL`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS anonymous_accounts_anonymous_id_unique
    ON anonymous_accounts (anonymous_id) WHERE anonymous_id IS NOT NULL`);
  await pool.query(`CREATE TABLE IF NOT EXISTS anonymous_id_requests (
    id text PRIMARY KEY, account_id text NOT NULL, user_id text NOT NULL,
    requested_id text NOT NULL, expires_at timestamp NOT NULL,
    created_at timestamp NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS anonymous_conversation_requests (
    id text PRIMARY KEY, guild_id text NOT NULL, requester_id text NOT NULL,
    requester_account_id text NOT NULL, target_id text NOT NULL, target_account_id text NOT NULL,
    requester_channel_id text NOT NULL, approval_channel_id text, expires_at timestamp NOT NULL,
    created_at timestamp NOT NULL DEFAULT now()
  )`);
  await pool.query(`ALTER TABLE anonymous_conversation_requests
    ADD COLUMN IF NOT EXISTS approval_channel_id text`);
}

export async function getAnonymousAccounts(guildId: string) {
  return db.select().from(anonymousAccountsTable).where(and(
    eq(anonymousAccountsTable.guildId, guildId),
    eq(anonymousAccountsTable.active, true),
  ));
}

async function nextAnonymousNumber(guildId: string): Promise<number> {
  const rows = await db.select({ number: anonymousAccountsTable.anonymousNumber })
    .from(anonymousAccountsTable).where(eq(anonymousAccountsTable.guildId, guildId));
  const used = new Set(rows.map((r) => r.number).filter((n): n is number => n !== null));
  for (let i = 10000; i <= 99999; i++) if (!used.has(i)) return i;
  throw new Error("Anonim hesap numarası havuzu dolu.");
}

export async function createPrivateAnonymousChannel(
  guild: Guild,
  accountId: string,
  userId: string,
  categoryId?: string | null,
): Promise<string> {
  const existing = await getAnonymousAccountById(accountId);
  if (!existing || existing.userId !== userId) throw new Error("Anonim hesap bulunamadı.");
  if (existing.privateChannelId) {
    const channel = await guild.channels.fetch(existing.privateChannelId).catch(() => null);
    if (channel && channel.type === ChannelType.GuildText) {
      if (!existing.privateWebhookToken) {
        const webhook = await (channel as TextChannel).createWebhook({
          name: "Anonim Sohbet",
          avatar: "https://cdn.discordapp.com/embed/avatars/0.png",
          reason: "Anonim hesap özel profil webhook'u",
        });
        await db.update(anonymousAccountsTable).set({
          privateWebhookId: webhook.id, privateWebhookToken: webhook.token!,
        }).where(eq(anonymousAccountsTable.id, accountId));
      }
      return channel.id;
    }
  }
  const botId = guild.client.user!.id;
  const channel = await guild.channels.create({
    name: `anonim-${existing.anonymousNumber ?? existing.id.slice(-4)}`,
    type: ChannelType.GuildText,
    parent: categoryId ?? undefined,
    topic: "VBRI anonim sohbet özel kanalı — kullanıcı mesajları anonim sohbete aktarılır.",
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: userId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages] },
    ],
  });
  const webhook = await channel.createWebhook({
    name: "Anonim Sohbet",
    avatar: "https://cdn.discordapp.com/embed/avatars/0.png",
    reason: "Anonim hesap özel profil webhook'u",
  });
  await db.update(anonymousAccountsTable).set({
    privateChannelId: channel.id,
    privateWebhookId: webhook.id,
    privateWebhookToken: webhook.token!,
  }).where(eq(anonymousAccountsTable.id, accountId));
  return channel.id;
}

export async function createAnonymousAccountForUser(
  guild: Guild,
  userId: string,
): Promise<{ account: any; created: boolean }> {
  const current = await getAccount(guild.id, userId);
  if (current?.active) return { account: current, created: false };
  if (current && process.env.ANONYMOUS_ALLOW_REJOIN !== "false") {
    await db.update(anonymousAccountsTable).set({ active: true }).where(eq(anonymousAccountsTable.id, current.id));
    return { account: { ...current, active: true }, created: false };
  }
  const number = await nextAnonymousNumber(guild.id);
  const account = {
    id: `${guild.id}-${userId}`,
    guildId: guild.id,
    userId,
    displayName: "Anonim",
    webhookId: "private-channel",
    webhookToken: "private-channel",
    anonymousNumber: number,
    anonymousId: String(number).padStart(5, "0"),
    active: true,
    createdAt: new Date(),
  };
  await db.insert(anonymousAccountsTable).values(account);
  return { account, created: true };
}

export async function leaveAnonymousAccount(
  guild: Guild,
  userId: string,
): Promise<{ ok: boolean; message: string }> {
  const account = await getAccount(guild.id, userId);
  if (!account || !account.active) return { ok: false, message: "Aktif anonim hesabın bulunmuyor." };
  await db.update(anonymousAccountsTable).set({ active: false })
    .where(eq(anonymousAccountsTable.id, account.id));
  if (account.privateChannelId) {
    const channel = await guild.channels.fetch(account.privateChannelId).catch(() => null);
    if (channel) await channel.delete("Anonim hesaptan ayrıldı").catch(() => null);
  }
  return { ok: true, message: "✅ Anonim hesaptan ayrıldın. Özel kanalın kapatıldı." };
}

export async function getOwnAnonymousProfile(guildId: string, userId: string) {
  const rows = await db.select().from(anonymousAccountsTable).where(and(
    eq(anonymousAccountsTable.guildId, guildId),
    eq(anonymousAccountsTable.userId, userId),
    eq(anonymousAccountsTable.active, true),
  )).limit(1);
  return rows[0] ?? null;
}

export async function getAnonymousProfileEmbed(guildId: string, userId: string): Promise<EmbedBuilder | null> {
  const account = await getOwnAnonymousProfile(guildId, userId);
  if (!account) return null;
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setThumbnail(account.avatarUrl ?? "https://cdn.discordapp.com/embed/avatars/0.png")
    .setTitle(`🕵️ ${anonymousPublicName(account)}`)
    .setDescription("Bu profil anonim sistemdeki kimliğindir. Gerçek Discord hesabın diğer kullanıcılara gösterilmez.")
    .addFields(
      { name: "Anonim Kimlik", value: anonymousPublicName(account), inline: true },
      { name: "Puan", value: `⭐ **${account.points}**`, inline: true },
      { name: "Durum", value: account.active ? "🟢 Aktif" : "🔴 Pasif", inline: true },
      { name: "Mesaj Sayısı", value: `${account.points} anonim mesaj`, inline: true },
      { name: "Katılım Tarihi", value: `<t:${Math.floor(account.createdAt.getTime() / 1000)}:D>`, inline: true },
      { name: "Özel Kanal", value: account.privateChannelId ? `<#${account.privateChannelId}>` : "Henüz oluşturulmadı", inline: true },
    )
    .setFooter({ text: "Puan: özel anonim kanalından gönderdiğin her mesaj = 1 puan" })
    .setTimestamp();
}

export async function changeAnonymousAvatar(
  guild: Guild,
  userId: string,
  avatarUrl: string,
): Promise<{ ok: boolean; message: string }> {
  const account = await getOwnAnonymousProfile(guild.id, userId);
  if (!account) return { ok: false, message: "Aktif anonim profilin bulunamadı." };
  if (!account.privateChannelId || account.webhookToken === "private-channel") {
    return { ok: false, message: "Önce anonim özel kanalına katılmalısın." };
  }
  const charged = await pool.query(
    `UPDATE anonymous_accounts SET points = points - 100
     WHERE id = $1 AND user_id = $2 AND active = true AND points >= 100
     RETURNING points`,
    [account.id, userId],
  );
  if (!charged.rowCount) {
    return { ok: false, message: `❌ Profil fotoğrafını değiştirmek için **100 puan** gerekiyor. Mevcut puanın: **${account.points}**.` };
  }
  const webhook = new WebhookClient({ id: account.webhookId, token: account.webhookToken });
  try {
    await webhook.edit({ avatar: avatarUrl });
    webhook.destroy();
    await db.update(anonymousAccountsTable).set({ avatarUrl }).where(eq(anonymousAccountsTable.id, account.id));
    return { ok: true, message: `✅ Profil fotoğrafın güncellendi. **100 puan** harcandı; kalan puanın: **${Number(charged.rows[0].points)}**.` };
  } catch (err) {
    webhook.destroy();
    await pool.query(`UPDATE anonymous_accounts SET points = points + 100 WHERE id = $1`, [account.id]);
    logger.warn({ err, accountId: account.id }, "Anonim profil avatarı güncellenemedi; puan iade edildi");
    return { ok: false, message: "❌ Profil fotoğrafı güncellenemedi, puanın iade edildi." };
  }
}

export async function setupAnonymousApprovalPanel(
  guild: Guild,
  approvalChannelId: string,
  generalChannelId: string,
  categoryId?: string | null,
): Promise<void> {
  await setAnonymousChat(guild.id, generalChannelId);
  await pool.query(
    `UPDATE anonymous_chat SET approval_channel_id = $1, category_id = $2 WHERE guild_id = $3`,
    [approvalChannelId, categoryId ?? null, guild.id],
  );
  const channel = await guild.channels.fetch(approvalChannelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) throw new Error("Onay kanalı bulunamadı.");
  const general = await guild.channels.fetch(generalChannelId).catch(() => null);
  if (!general || general.type !== ChannelType.GuildText) throw new Error("Genel anonim kanalı bulunamadı.");
  const oldSettings = await getAnonymousChat(guild.id);
  let generalWebhookId = oldSettings?.generalWebhookId;
  let generalWebhookToken = oldSettings?.generalWebhookToken;
  if (!generalWebhookId || !generalWebhookToken) {
    const generalWebhook = await (general as TextChannel).createWebhook({
      name: "Anonim Sohbet",
      avatar: "https://cdn.discordapp.com/embed/avatars/0.png",
      reason: "Anonim genel sohbet profil webhook'u",
    });
    generalWebhookId = generalWebhook.id;
    generalWebhookToken = generalWebhook.token!;
  }
  await pool.query(
    `UPDATE anonymous_chat SET general_webhook_id = $1, general_webhook_token = $2 WHERE guild_id = $3`,
    [generalWebhookId, generalWebhookToken, guild.id],
  );
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`anon_create_account:${guild.id}`).setLabel("Anonim Hesap Oluştur").setStyle(ButtonStyle.Primary),
  );
  await channel.send({
    embeds: [new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("🕵️ Anonim Sohbet")
      .setDescription(
        "Bu sistemde mesajların genel anonim sohbet kanalına **Anonim #numara** adıyla gönderilir.\n\n" +
        "• Gerçek Discord kullanıcı adın, ID'n veya avatarın paylaşılmaz.\n" +
        "• Mesaj yazmak için sana özel gizli kanalı kullanırsın.\n" +
        "• Özel kanalındaki mesajlar anonim sohbette yayınlanır ve diğer mesajlar özel kanalına dağıtılır.\n" +
        "• Katılarak anonim sohbet kurallarını kabul etmiş olursun."
      )
      .setFooter({ text: "Anonimlik için gerçek kimlik bilgilerini mesajlarında paylaşma." })
      .setTimestamp()],
    components: [row],
  });
}

async function getOrCreateGeneralWebhook(
  guild: Guild,
  channel: TextChannel,
  settings: { generalWebhookId: string | null; generalWebhookToken: string | null },
): Promise<WebhookClient> {
  let webhookId = settings.generalWebhookId;
  let webhookToken = settings.generalWebhookToken;
  if (!webhookId || !webhookToken) {
    const created = await channel.createWebhook({
      name: "Anonim Sohbet",
      avatar: "https://cdn.discordapp.com/embed/avatars/0.png",
      reason: "Anonim genel sohbet profil webhook'u",
    });
    webhookId = created.id;
    webhookToken = created.token!;
    await pool.query(
      `UPDATE anonymous_chat SET general_webhook_id = $1, general_webhook_token = $2 WHERE guild_id = $3`,
      [webhookId, webhookToken, guild.id],
    );
  }
  return new WebhookClient({ id: webhookId, token: webhookToken });
}

async function getOrCreatePrivateWebhook(
  guild: Guild,
  account: { id: string; privateChannelId: string | null; privateWebhookId: string | null; privateWebhookToken: string | null },
): Promise<WebhookClient | null> {
  if (!account.privateChannelId) return null;
  const channel = await guild.channels.fetch(account.privateChannelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return null;
  let webhookId = account.privateWebhookId;
  let webhookToken = account.privateWebhookToken;
  if (!webhookId || !webhookToken) {
    const created = await (channel as TextChannel).createWebhook({
      name: "Anonim Sohbet",
      avatar: "https://cdn.discordapp.com/embed/avatars/0.png",
      reason: "Eksik anonim özel kanal webhook'u otomatik tamamlandı",
    });
    webhookId = created.id;
    webhookToken = created.token!;
    await db.update(anonymousAccountsTable).set({
      privateWebhookId: webhookId,
      privateWebhookToken: webhookToken,
    }).where(eq(anonymousAccountsTable.id, account.id));
  }
  return new WebhookClient({ id: webhookId, token: webhookToken });
}

export async function resetAnonymousChannel(
  guild: Guild,
  channelId?: string,
): Promise<string> {
  const current = await getAnonymousChat(guild.id);
  const selectedChannelId = channelId ?? current?.channelId;
  if (!selectedChannelId) throw new Error("Genel anonim sohbet kanalı belirtilmedi.");

  if (current?.generalWebhookId && current.generalWebhookToken) {
    const oldWebhook = new WebhookClient({
      id: current.generalWebhookId,
      token: current.generalWebhookToken,
    });
    await oldWebhook.delete("Anonim genel sohbet kanalı sıfırlandı").catch(() => null);
    oldWebhook.destroy();
  }

  await db.insert(anonymousChatTable)
    .values({
      guildId: guild.id,
      channelId: selectedChannelId,
      enabled: true,
      generalWebhookId: null,
      generalWebhookToken: null,
    })
    .onConflictDoUpdate({
      target: anonymousChatTable.guildId,
      set: {
        channelId: selectedChannelId,
        enabled: true,
        generalWebhookId: null,
        generalWebhookToken: null,
        updatedAt: new Date(),
      },
    });
  return selectedChannelId;
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
    anonymousId: anonymousAccountsTable.anonymousId,
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

function cleanAnonymousId(value: string): string {
  return value.trim().toUpperCase();
}

function publicAnonymousId(account: { anonymousId: string | null; displayName: string }): string {
  return anonymousPublicName(account);
}

export async function requestAnonymousIdChange(
  userId: string,
  requestedId: string,
): Promise<{ ok: boolean; message: string; requestId?: string; accountId?: string }> {
  const normalized = cleanAnonymousId(requestedId);
  if (!/^\d{5}$/.test(normalized)) {
    return { ok: false, message: "Anonim ID tam olarak 5 rakam olmalı. Örnek: 01234" };
  }
  const accounts = await db.select().from(anonymousAccountsTable)
    .where(and(eq(anonymousAccountsTable.userId, userId), eq(anonymousAccountsTable.active, true))).limit(1);
  const account = accounts[0];
  if (!account) return { ok: false, message: "Aktif anonim profilin bulunamadı." };
  if (cleanAnonymousId(publicAnonymousId(account)) === normalized) {
    return { ok: false, message: "Bu ID zaten mevcut anonim ID'n." };
  }
  const used = await db.select({ id: anonymousAccountsTable.id }).from(anonymousAccountsTable)
    .where(eq(anonymousAccountsTable.anonymousId, normalized)).limit(1);
  if (used.length) return { ok: false, message: "Bu anonim ID zaten kullanılıyor. Başka bir ID seç." };
  const requestId = `${userId}-${Date.now()}-${randomBytes(3).toString("hex")}`;
  await db.delete(anonymousIdRequestsTable).where(eq(anonymousIdRequestsTable.userId, userId));
  await db.insert(anonymousIdRequestsTable).values({
    id: requestId, accountId: account.id, userId, requestedId: normalized,
    expiresAt: new Date(Date.now() + 10 * 60_000),
  });
  return { ok: true, message: "Onay bekleniyor.", requestId, accountId: account.id };
}

export async function resolveAnonymousIdChange(
  requestId: string,
  userId: string,
  approve: boolean,
): Promise<{ ok: boolean; message: string }> {
  const rows = await db.select().from(anonymousIdRequestsTable)
    .where(and(eq(anonymousIdRequestsTable.id, requestId), eq(anonymousIdRequestsTable.userId, userId))).limit(1);
  const request = rows[0];
  if (!request || request.expiresAt <= new Date()) {
    if (request) await db.delete(anonymousIdRequestsTable).where(eq(anonymousIdRequestsTable.id, request.id));
    return { ok: false, message: "Bu anonim ID isteğinin süresi dolmuş." };
  }
  await db.delete(anonymousIdRequestsTable).where(eq(anonymousIdRequestsTable.id, request.id));
  if (!approve) return { ok: true, message: "Anonim ID değişikliği reddedildi; puanın harcanmadı." };
  const used = await db.select({ id: anonymousAccountsTable.id }).from(anonymousAccountsTable)
    .where(and(eq(anonymousAccountsTable.anonymousId, request.requestedId), sql`${anonymousAccountsTable.id} <> ${request.accountId}`)).limit(1);
  if (used.length) return { ok: false, message: "Bu anonim ID bu sırada başka biri tarafından alındı; puanın harcanmadı." };
  const charged = await pool.query(
    `UPDATE anonymous_accounts SET points = points - 50, anonymous_id = $1
     WHERE id = $2 AND user_id = $3 AND active = true AND points >= 50
     RETURNING points`,
    [request.requestedId, request.accountId, userId],
  );
  if (!charged.rowCount) return { ok: false, message: "Anonim ID değiştirmek için 50 puanın olmalı. Puanın harcanmadı." };
  return { ok: true, message: `Anonim ID'n **${request.requestedId}** olarak değiştirildi. **50 puan** harcandı; kalan puanın: **${charged.rows[0].points}**.` };
}

export async function getAnonymousPointLeaderboard(limit = 10) {
  return db.select({
    anonymousId: anonymousAccountsTable.anonymousId,
    displayName: anonymousAccountsTable.displayName,
    points: anonymousAccountsTable.points,
  }).from(anonymousAccountsTable)
    .where(eq(anonymousAccountsTable.active, true))
    .orderBy(sql`${anonymousAccountsTable.points} DESC`, sql`${anonymousAccountsTable.createdAt} ASC`)
    .limit(limit);
}

export async function grantAnonymousPoints(
  anonymousId: string,
  amount: number,
): Promise<{ ok: boolean; message: string }> {
  if (!/^\d{5}$/.test(anonymousId) || !Number.isInteger(amount) || amount < 1 || amount > 100000) {
    return { ok: false, message: "Kullanım: `v!anonpuanver <5-haneli-id> <1-100000>`" };
  }
  const result = await pool.query(
    `UPDATE anonymous_accounts
     SET points = points + $1
     WHERE anonymous_id = $2 AND active = true
     RETURNING display_name, anonymous_id, points`,
    [amount, anonymousId],
  );
  if (!result.rowCount) return { ok: false, message: "Bu 5 haneli anonim ID bulunamadı." };
  return {
    ok: true,
    message: `✅ **Anonim #${anonymousId}** hesabına **${amount} puan** verildi. Yeni puan: **${result.rows[0].points}**.`,
  };
}

function anonymousPublicName(account: { anonymousId: string | null; displayName: string }): string {
  const id = account.anonymousId ?? account.displayName.match(/\d+/)?.[0] ?? "00000";
  return `Anonim #${id.padStart(5, "0").slice(-5)}`;
}

export async function requestAnonymousConversation(
  guild: Guild,
  requesterId: string,
  requesterChannelId: string,
  targetPublicId: string,
): Promise<{ ok: boolean; message: string }> {
  const normalized = cleanAnonymousId(targetPublicId.replace(/^#/, ""));
  const requester = await getAccount(guild.id, requesterId);
  if (!requester?.active || requester.privateChannelId !== requesterChannelId) {
    return { ok: false, message: "Bu komut yalnızca kendi anonim özel kanalında kullanılabilir." };
  }
  const targets = await db.select().from(anonymousAccountsTable).where(and(
    eq(anonymousAccountsTable.guildId, guild.id),
    eq(anonymousAccountsTable.active, true),
    eq(anonymousAccountsTable.anonymousId, normalized),
  )).limit(1);
  const target = targets[0];
  if (!target) return { ok: false, message: "Bu anonim ID bulunamadı. Kullanıcının özel ID'sini kontrol et." };
  if (target.userId === requesterId) return { ok: false, message: "Kendinle anonim sohbet başlatamazsın." };
  if (!target.privateChannelId) return { ok: false, message: "Bu kullanıcının anonim özel kanalı hazır değil." };
  if (await isAnonymousBlocked(target.userId, requester.id)) {
    return { ok: false, message: "Bu anonim kullanıcı senden mesaj almayı engellemiş." };
  }
  const activeSessions = await db.select().from(anonymousSessionsTable).where(and(
    eq(anonymousSessionsTable.guildId, guild.id),
    eq(anonymousSessionsTable.active, true),
    or(
      eq(anonymousSessionsTable.userAId, requesterId),
      eq(anonymousSessionsTable.userBId, requesterId),
      eq(anonymousSessionsTable.userAId, target.userId),
      eq(anonymousSessionsTable.userBId, target.userId),
    ),
  ));
  for (const session of activeSessions) {
    const channelsExist = Boolean(
      session.channelAId &&
      session.channelBId &&
      await guild.channels.fetch(session.channelAId).catch(() => null) &&
      await guild.channels.fetch(session.channelBId).catch(() => null),
    );
    if (channelsExist) {
      return { ok: false, message: "Bu kullanıcılardan biri zaten aktif bir anonim sohbette." };
    }
    await db.update(anonymousSessionsTable)
      .set({ active: false, updatedAt: new Date() })
      .where(eq(anonymousSessionsTable.id, session.id));
  }

  const settings = await getAnonymousChat(guild.id);
  const botId = guild.client.user!.id;
  const approvalChannel = await guild.channels.create({
    name: `anon-onay-${normalized}`,
    type: ChannelType.GuildText,
    parent: settings?.categoryId ?? undefined,
    topic: "Anonim sohbet isteği onay kanalı.",
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: target.userId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] },
    ],
  });
  const requestId = `anon-${randomBytes(12).toString("hex")}`;
  await db.delete(anonymousConversationRequestsTable).where(or(
    eq(anonymousConversationRequestsTable.requesterId, requesterId),
    eq(anonymousConversationRequestsTable.targetId, target.userId),
  ));
  await db.insert(anonymousConversationRequestsTable).values({
    id: requestId,
    guildId: guild.id,
    requesterId,
    requesterAccountId: requester.id,
    targetId: target.userId,
    targetAccountId: target.id,
    requesterChannelId,
    approvalChannelId: approvalChannel.id,
    expiresAt: new Date(Date.now() + 10 * 60_000),
  });
  await approvalChannel.send({
    embeds: [new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("🕵️ Anonim özel sohbet isteği")
      .setDescription(
        `**#${anonymousPublicName(requester)}** anonim kullanıcı sizinle özel sohbet başlatmak istiyor.\n\n` +
        "Onaylarsanız iki taraf için ayrı özel sohbet kanalları ve yalnızca botun görebildiği güvenli aktarım kanalı oluşturulacak.",
      )
      .setFooter({ text: "Bu istek 10 dakika içinde geçerliliğini yitirir." })
      .setTimestamp()],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`anon_chat_approve:${requestId}:${target.userId}`).setLabel("✅ Onayla").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`anon_chat_reject:${requestId}:${target.userId}`).setLabel("❌ Reddet").setStyle(ButtonStyle.Danger),
    )],
  });
  return { ok: true, message: `✅ **#${anonymousPublicName(target)}** kullanıcısına anonim sohbet isteği gönderildi.` };
}

export async function resolveAnonymousConversation(
  guild: Guild,
  requestId: string,
  userId: string,
  approve: boolean,
): Promise<{ ok: boolean; message: string }> {
  const rows = await db.select().from(anonymousConversationRequestsTable).where(and(
    eq(anonymousConversationRequestsTable.id, requestId),
    eq(anonymousConversationRequestsTable.targetId, userId),
  )).limit(1);
  const request = rows[0];
  if (!request || request.expiresAt <= new Date()) {
    if (request) await db.delete(anonymousConversationRequestsTable).where(eq(anonymousConversationRequestsTable.id, request.id));
    return { ok: false, message: "Bu sohbet isteğinin süresi dolmuş." };
  }
  await db.delete(anonymousConversationRequestsTable).where(eq(anonymousConversationRequestsTable.id, request.id));
  if (request.approvalChannelId) {
    const approvalChannel = await guild.channels.fetch(request.approvalChannelId).catch(() => null);
    await approvalChannel?.delete("Anonim sohbet isteği sonuçlandı").catch(() => null);
  }
  if (!approve) return { ok: true, message: "Anonim özel sohbet isteği reddedildi." };

  const requester = await getAnonymousAccountById(request.requesterAccountId);
  const target = await getAnonymousAccountById(request.targetAccountId);
  if (!requester || !target || !requester.active || !target.active) {
    return { ok: false, message: "Anonim hesaplardan biri artık aktif değil." };
  }
  const settings = await getAnonymousChat(guild.id);
  const parent = settings?.categoryId ?? undefined;
  const botId = guild.client.user!.id;
  const privateOverwrites = (memberId: string) => [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: memberId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages] },
  ];
  const channelA = await guild.channels.create({
    name: "anon-sohbet-1", type: ChannelType.GuildText, parent,
    topic: "Anonim özel sohbet — yalnızca kullanıcı ve bot görebilir.",
    permissionOverwrites: privateOverwrites(request.requesterId),
  });
  const channelB = await guild.channels.create({
    name: "anon-sohbet-2", type: ChannelType.GuildText, parent,
    topic: "Anonim özel sohbet — yalnızca kullanıcı ve bot görebilir.",
    permissionOverwrites: privateOverwrites(request.targetId),
  });
  const relay = await guild.channels.create({
    name: "anon-aktarim", type: ChannelType.GuildText, parent,
    topic: "Anonim aktarım kanalı — kullanıcı erişimi yoktur.",
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    ],
  });
  await db.update(anonymousSessionsTable).set({ active: false, updatedAt: new Date() }).where(or(
    eq(anonymousSessionsTable.userAId, request.requesterId),
    eq(anonymousSessionsTable.userBId, request.requesterId),
    eq(anonymousSessionsTable.userAId, request.targetId),
    eq(anonymousSessionsTable.userBId, request.targetId),
  ));
  await db.insert(anonymousSessionsTable).values({
    guildId: guild.id,
    userAId: request.requesterId, userAAccountId: request.requesterAccountId,
    userBId: request.targetId, userBAccountId: request.targetAccountId,
    channelAId: channelA.id, channelBId: channelB.id, relayChannelId: relay.id,
    active: true, updatedAt: new Date(),
  });
  await channelA.send({ content: `✅ Anonim sohbet hazır. Mesajların **#${anonymousPublicName(target)}** kullanıcısına anonim olarak iletilecek.\nSohbeti kapatmak için: \`v!konuşmakapat\`` });
  await channelB.send({ content: `✅ Anonim sohbet hazır. Mesajların **#${anonymousPublicName(requester)}** kullanıcısına anonim olarak iletilecek.\nSohbeti kapatmak için: \`v!konuşmakapat\`` });
  return { ok: true, message: "Anonim özel sohbet onaylandı; iki kullanıcı için özel kanallar oluşturuldu." };
}

export async function relayAnonymousChannelMessage(message: Message): Promise<boolean> {
  if (!message.guildId || message.author.bot) return false;
  const sessions = await db.select().from(anonymousSessionsTable).where(and(
    eq(anonymousSessionsTable.active, true),
    or(eq(anonymousSessionsTable.channelAId, message.channelId), eq(anonymousSessionsTable.channelBId, message.channelId)),
  )).limit(1);
  const session = sessions[0];
  if (!session) return false;
  const senderIsA = session.channelAId === message.channelId;
  const recipientChannelId = senderIsA ? session.channelBId : session.channelAId;
  if (!recipientChannelId) return true;
  const senderAccountId = senderIsA ? session.userAAccountId : session.userBAccountId;
  const senderAccount = await getAnonymousAccountById(senderAccountId);
  const recipient = await message.guild.channels.fetch(recipientChannelId).catch(() => null);
  const relay = session.relayChannelId
    ? await message.guild.channels.fetch(session.relayChannelId).catch(() => null)
    : null;
  const content = message.content.trim().slice(0, 1900);
  if (!content || !senderAccount || !recipient || recipient.type !== ChannelType.GuildText) return true;
  await message.delete().catch(() => null);

  const recipientAccounts = await db.select().from(anonymousAccountsTable).where(and(
    eq(anonymousAccountsTable.guildId, message.guildId),
    eq(anonymousAccountsTable.privateChannelId, recipientChannelId),
    eq(anonymousAccountsTable.active, true),
  )).limit(1);
  const recipientAccount = recipientAccounts[0];
  const privateWebhook = recipientAccount
    ? await getOrCreatePrivateWebhook(message.guild, recipientAccount)
    : null;
  if (!privateWebhook) {
    await (recipient as TextChannel).send({
      content: "❌ Karşı tarafın anonim özel kanalı bulunamadı; sohbet kapatıldı.",
      allowedMentions: { parse: [] },
    }).catch(() => null);
    return true;
  }
  await privateWebhook.send({
    content,
    username: anonymousPublicName(senderAccount),
    avatarURL: senderAccount.avatarUrl ?? "https://cdn.discordapp.com/embed/avatars/0.png",
    allowedMentions: { parse: [] },
  }).catch(() => null);
  privateWebhook.destroy();
  if (relay && relay.type === ChannelType.GuildText) {
    await (relay as TextChannel).send({ content: `[${anonymousPublicName(senderAccount)}] ${content}`, allowedMentions: { parse: [] } }).catch(() => null);
  }
  await db.update(anonymousSessionsTable).set({ updatedAt: new Date() }).where(eq(anonymousSessionsTable.id, session.id));
  await db.update(anonymousAccountsTable).set({ points: sql`${anonymousAccountsTable.points} + 1` }).where(eq(anonymousAccountsTable.id, senderAccountId));
  return true;
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

  const senderProfiles = await getAnonymousProfile(senderUserId);
  const senderProfile = senderProfiles.find(p => p.guildId === target.guildId) ?? senderProfiles[0];
  if (!senderProfile) {
    return { ok: false, message: "Önce anonim bir profil oluşturmalısın. Bir sunucunun anonim kanalında ilk mesajını gönderip onayla." };
  }
  if (await isAnonymousBlocked(target.userId, senderProfile.id)) {
    return { ok: false, message: "Bu anonim hesap, anonim DM'leri kabul etmiyor." };
  }

  const recipient = await client.users.fetch(target.userId);
  await recipient.send({
    content:
      `🕵️ **Anonim mesajın var**\n\n` +
      `Gönderen: **${senderProfile.anonymousId ?? senderProfile.displayName}**\n` +
      `Gönderen anonim hesap ID'si: \`${senderProfile.id}\`\n\n` +
      content.trim().slice(0, 1900) +
      `\n\nYanıt almak istemiyorsan: \`v!anon karaliste ekle ${senderProfile.id}\``,
  });
  return { ok: true, message: `✅ Mesajın **${target.displayName}** hesabına anonim olarak gönderildi.` };
}

export async function startAnonymousConversation(
  senderUserId: string,
  targetAccountId: string,
  client: Message["client"],
): Promise<{ ok: boolean; message: string }> {
  const target = await getAnonymousAccountById(targetAccountId);
  if (!target) return { ok: false, message: "Bu anonim hesap ID'si bulunamadı." };
  if (target.userId === senderUserId) return { ok: false, message: "Kendi hesabınla sohbet başlatamazsın." };

  const senderProfiles = await getAnonymousProfile(senderUserId);
  const senderProfile = senderProfiles.find(p => p.guildId === target.guildId) ?? senderProfiles[0];
  if (!senderProfile) {
    return { ok: false, message: "Önce anonim bir profil oluşturmalısın. Anonim kanalda ilk mesajını gönderip onayla." };
  }
  if (await isAnonymousBlocked(target.userId, senderProfile.id)) {
    return { ok: false, message: "Bu anonim hesap senden mesaj almak istemiyor." };
  }

  await db.update(anonymousSessionsTable)
    .set({ active: false, updatedAt: new Date() })
    .where(and(
      eq(anonymousSessionsTable.active, true),
      or(
        eq(anonymousSessionsTable.userAId, senderUserId),
        eq(anonymousSessionsTable.userBId, senderUserId),
        eq(anonymousSessionsTable.userAId, target.userId),
        eq(anonymousSessionsTable.userBId, target.userId),
      ),
    ));

  await db.insert(anonymousSessionsTable).values({
    userAId: senderUserId,
    userAAccountId: senderProfile.id,
    userBId: target.userId,
    userBAccountId: target.id,
    active: true,
    updatedAt: new Date(),
  });

  const recipient = await client.users.fetch(target.userId);
  try {
    await recipient.send(
      `🕵️ **Anonim sohbet başladı**\n` +
      `Bir kullanıcı senin anonim hesabınla sohbet başlattı.\n` +
      `Mesajlarını bu DM'ye yaz; bot karşı tarafa anonim olarak iletecek.\n` +
      `Sohbeti kapatmak için: \`v!konuşmakapat\``,
    );
  } catch (err) {
    await stopAnonymousConversation(senderUserId);
    logger.warn({ err, targetUserId: target.userId }, "Anonim sohbet karşı tarafa DM gönderilemedi");
    return {
      ok: false,
      message: "Karşı tarafa DM gönderilemedi. Kullanıcının bottan DM almayı açtığından emin ol.",
    };
  }
  logger.info({ senderUserId, targetAccountId, targetUserId: target.userId }, "Anonim sohbet başlatıldı");

  return {
    ok: true,
    message: `✅ **${target.displayName}** ile anonim sohbet başladı.\nArtık bu DM'ye yazdığın her mesaj karşı tarafa anonim olarak iletilecek.\nSohbeti kapatmak için: \`v!konuşmakapat\``,
  };
}

export async function stopAnonymousConversation(userId: string): Promise<boolean> {
  const result = await db.update(anonymousSessionsTable)
    .set({ active: false, updatedAt: new Date() })
    .where(and(
      eq(anonymousSessionsTable.active, true),
      or(
        eq(anonymousSessionsTable.userAId, userId),
        eq(anonymousSessionsTable.userBId, userId),
      ),
    ))
    .returning({ id: anonymousSessionsTable.id });
  return result.length > 0;
}

export async function closeAnonymousChannelConversation(
  guild: Guild,
  userId: string,
): Promise<boolean> {
  const rows = await db.select().from(anonymousSessionsTable).where(and(
    eq(anonymousSessionsTable.active, true),
    or(
      eq(anonymousSessionsTable.userAId, userId),
      eq(anonymousSessionsTable.userBId, userId),
    ),
  )).limit(1);
  const session = rows[0];
  if (!session) return false;

  await db.update(anonymousSessionsTable)
    .set({ active: false, updatedAt: new Date() })
    .where(eq(anonymousSessionsTable.id, session.id));

  for (const channelId of [session.channelAId, session.channelBId, session.relayChannelId]) {
    if (!channelId) continue;
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    await channel?.delete("Anonim özel sohbet kapatıldı").catch(() => null);
  }
  return true;
}

export async function relayAnonymousConversationMessage(
  message: Message,
  client: Message["client"],
): Promise<boolean> {
  if (message.author.bot || message.guildId) return false;
  const rows = await db.select().from(anonymousSessionsTable)
    .where(and(
      eq(anonymousSessionsTable.active, true),
      or(
        eq(anonymousSessionsTable.userAId, message.author.id),
        eq(anonymousSessionsTable.userBId, message.author.id),
      ),
    )).limit(1);
  const session = rows[0];
  if (!session) return false;

  const senderIsA = session.userAId === message.author.id;
  const recipientUserId = senderIsA ? session.userBId : session.userAId;
  const senderAccountId = senderIsA ? session.userAAccountId : session.userBAccountId;
  if (await isAnonymousBlocked(recipientUserId, senderAccountId)) {
    await message.author.send(
      "🚫 Bu anonim hesap senden mesaj almayı engellemiş. Sohbet kapatıldı.",
    ).catch(() => null);
    await stopAnonymousConversation(message.author.id);
    return true;
  }

  const senderAccount = await getAnonymousAccountById(senderAccountId);
  if (!senderAccount) {
    await stopAnonymousConversation(message.author.id);
    return true;
  }

  const recipient = await client.users.fetch(recipientUserId);
  try {
    await recipient.send(
      `🕵️ **Anonim sohbet mesajı** — **${senderAccount.displayName}**\n\n` +
      message.content.slice(0, 1900) +
      `\n\nSohbeti kapatmak için: \`v!konuşmakapat\``,
    );
  } catch (err) {
    await message.author.send(
      "❌ Mesaj karşı tarafa iletilemedi. Karşı taraf bottan DM almayı kapatmış olabilir; sohbet kapatıldı.",
    ).catch(() => null);
    await stopAnonymousConversation(message.author.id);
    logger.warn({ err, recipientUserId, senderAccountId }, "Anonim sohbet mesajı iletilemedi");
    return true;
  }
  logger.info({ senderId: message.author.id, recipientUserId }, "Anonim sohbet mesajı iletildi");
  await db.update(anonymousSessionsTable)
    .set({ updatedAt: new Date() })
    .where(eq(anonymousSessionsTable.id, session.id));
  return true;
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
): Promise<{ handled: boolean; content?: string; accountId?: string }> {
  if (customId.startsWith("anon_create_account:")) {
    const [, guildId] = customId.split(":");
    const guild = await client.guilds.fetch(guildId!).catch(() => null);
    if (!guild) return { handled: true, content: "❌ Sunucu bulunamadı." };
    return { handled: true, content: "Anonim sohbet kurallarını kabul ediyor musun? Gerçek kimlik bilgilerini paylaşmaman gerektiğini ve mesajlarının dağıtılacağını kabul ederek devam edebilirsin." };
  }
  if (customId.startsWith("anon_confirm_account:")) {
    const [, guildId] = customId.split(":");
    const guild = await client.guilds.fetch(guildId!).catch(() => null);
    if (!guild) return { handled: true, content: "❌ Sunucu bulunamadı." };
    const result = await createAnonymousAccountForUser(guild, userId);
    return {
      handled: true, accountId: result.account.id,
      content: result.created
        ? `✅ Anonim hesabın başarıyla oluşturuldu: **${result.account.displayName}**\n\nAnonim sohbete katılmak için aşağıdaki **Sohbete Katıl** butonuna bas.`
        : `ℹ️ Zaten bir anonim hesabın var: **${result.account.displayName}**\n\nSohbete katılmak için aşağıdaki **Sohbete Katıl** butonuna bas.`,
    };
  }
  if (customId.startsWith("anon_join:")) {
    const [, accountId, buttonUserId] = customId.split(":");
    if (buttonUserId !== userId) return { handled: true, content: "❌ Bu buton sana ait değil." };
    const account = await getAnonymousAccountById(accountId!);
    if (!account || account.userId !== userId) return { handled: true, content: "❌ Anonim hesap bulunamadı." };
    const guild = await client.guilds.fetch(account.guildId).catch(() => null);
    if (!guild) return { handled: true, content: "❌ Sunucu bulunamadı." };
    const settings = await getAnonymousChat(account.guildId);
    const privateChannelId = await createPrivateAnonymousChannel(guild, account.id, userId, settings?.categoryId);
    return { handled: true, content: `✅ Özel anonim kanalın hazır: <#${privateChannelId}>\nBu kanala yazdığın mesajlar anonim sohbete gönderilir.` };
  }
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
    username: anonymousPublicName(account),
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
  const number = await nextAnonymousNumber(guild.id);
  const account = {
    id: `${guild.id}-${userId}`,
    guildId: guild.id,
    userId,
      displayName: "Anonim",
    webhookId: webhook.id,
    webhookToken: webhook.token!,
    createdAt: new Date(),
    anonymousNumber: number,
    anonymousId: String(number).padStart(5, "0"),
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
  const number = await nextAnonymousNumber(message.guildId!);
  const account = {
    id: `${message.guildId}-${message.author.id}`,
    guildId: message.guildId!,
    userId: message.author.id,
    displayName: "Anonim",
    webhookId: webhook.id,
    webhookToken: webhook.token!,
    anonymousNumber: number,
    anonymousId: String(number).padStart(5, "0"),
    createdAt: new Date(),
  };
  await db.insert(anonymousAccountsTable).values(account)
    .onConflictDoUpdate({
      target: anonymousAccountsTable.id,
      set: {
        displayName: "Anonim",
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
  if (!settings?.enabled) return false;
  if (message.channel.type !== ChannelType.GuildText) return false;

  const channel = message.channel as TextChannel;

  // Özel anonim kanaldan genel kanala yayın.
  const privateRows = await db.select().from(anonymousAccountsTable).where(and(
    eq(anonymousAccountsTable.guildId, message.guildId),
    eq(anonymousAccountsTable.privateChannelId, message.channelId),
    eq(anonymousAccountsTable.active, true),
  )).limit(1);
  const privateAccount = privateRows[0];
  if (privateAccount) {
    const general = await message.guild!.channels.fetch(settings.channelId).catch(() => null);
    if (!general || general.type !== ChannelType.GuildText) return true;
    const content = message.content.trim().slice(0, 1900);
    if (!content) return true;
    const generalWebhook = await getOrCreateGeneralWebhook(message.guild, general as TextChannel, settings);
    const generalMessage = await generalWebhook.send({
      content,
      username: anonymousPublicName(privateAccount),
      avatarURL: privateAccount.avatarUrl ?? "https://cdn.discordapp.com/embed/avatars/0.png",
      allowedMentions: { parse: [] },
      wait: true,
    });
    generalWebhook.destroy();
    await db.update(anonymousAccountsTable)
      .set({ points: sql`${anonymousAccountsTable.points} + 1` })
      .where(eq(anonymousAccountsTable.id, privateAccount.id));
    const recipients: Record<string, string> = {};
    const accounts = await getAnonymousAccounts(message.guildId);
    for (const recipient of accounts) {
      // Gönderen mesajı zaten kendi özel kanalında görüyor; tekrar kopyalama.
      if (recipient.id === privateAccount.id || !recipient.privateChannelId) continue;
      const target = await message.guild!.channels.fetch(recipient.privateChannelId).catch(() => null);
      if (!target || target.type !== ChannelType.GuildText) continue;
      const copyWebhook = await getOrCreatePrivateWebhook(message.guild, recipient);
      if (!copyWebhook) continue;
      const copy = await copyWebhook.send({
        content,
        username: anonymousPublicName(privateAccount),
        avatarURL: privateAccount.avatarUrl ?? "https://cdn.discordapp.com/embed/avatars/0.png",
        allowedMentions: { parse: [] },
        wait: true,
      }).catch(() => null);
      copyWebhook.destroy();
      if (copy) recipients[recipient.id] = copy.id;
    }
    await db.insert(anonymousMessagesTable).values({
      guildId: message.guildId,
      senderAccountId: privateAccount.id,
      sourceMessageId: message.id,
      generalMessageId: generalMessage.id,
      recipientMessageIds: JSON.stringify(recipients),
    }).catch((err) => logger.warn({ err }, "Anonim mesaj eşleştirmesi kaydedilemedi"));
    return true;
  }

  // Genel anonim kanala doğrudan yazılan gerçek kullanıcı mesajını hemen sil.
  if (settings.channelId !== message.channelId) return false;

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
      const approval = settings.approvalChannelId
        ? `<#${settings.approvalChannelId}> kanalındaki **Anonim Hesap Oluştur** butonuna bas`
        : "`v!anon kur #onay #genel` ile sistem yöneticisinden onay panelini kurmasını iste";
      await channel.send(`🕵️ Anonim mesaj göndermek için önce ${approval}.`)
        .then((warning) => setTimeout(() => warning.delete().catch(() => null), 10000))
        .catch(() => null);
      return true;
    }

    const generalWebhook = await getOrCreateGeneralWebhook(message.guild, channel, settings);
    await generalWebhook.send({
      content: message.content.slice(0, 2000),
      username: anonymousPublicName(account),
      avatarURL: account.avatarUrl ?? "https://cdn.discordapp.com/embed/avatars/0.png",
      allowedMentions: { parse: [] },
    });
    generalWebhook.destroy();

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