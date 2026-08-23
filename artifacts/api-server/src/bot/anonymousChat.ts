import { db } from "@workspace/db";
import {
  anonymousAccountsTable,
  anonymousBlocksTable,
  anonymousChatTable,
  anonymousPendingTable,
  anonymousSessionsTable,
  anonymousMessagesTable,
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
    avatar_url text,
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
    id serial PRIMARY KEY, user_a_id text NOT NULL, user_a_account_id text NOT NULL,
    user_b_id text NOT NULL, user_b_account_id text NOT NULL,
    active boolean NOT NULL DEFAULT true, updated_at timestamp NOT NULL DEFAULT now(),
    created_at timestamp NOT NULL DEFAULT now()
  )`);
  await pool.query(`ALTER TABLE anonymous_chat
    ADD COLUMN IF NOT EXISTS approval_channel_id text,
    ADD COLUMN IF NOT EXISTS category_id text,
    ADD COLUMN IF NOT EXISTS general_webhook_id text,
    ADD COLUMN IF NOT EXISTS general_webhook_token text`);
  await pool.query(`ALTER TABLE anonymous_accounts
    ADD COLUMN IF NOT EXISTS anonymous_number integer,
    ADD COLUMN IF NOT EXISTS private_channel_id text,
    ADD COLUMN IF NOT EXISTS points integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS avatar_url text,
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
  for (let i = 1000; i <= 9999; i++) if (!used.has(i)) return i;
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
      if (!existing.webhookToken || existing.webhookToken === "private-channel") {
        const webhook = await (channel as TextChannel).createWebhook({
          name: existing.displayName,
          avatar: "https://cdn.discordapp.com/embed/avatars/0.png",
          reason: "Anonim hesap özel profil webhook'u",
        });
        await db.update(anonymousAccountsTable).set({
          webhookId: webhook.id, webhookToken: webhook.token!,
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
    name: existing.displayName,
    avatar: "https://cdn.discordapp.com/embed/avatars/0.png",
    reason: "Anonim hesap özel profil webhook'u",
  });
  await db.update(anonymousAccountsTable).set({ privateChannelId: channel.id })
    .where(eq(anonymousAccountsTable.id, accountId));
  await db.update(anonymousAccountsTable).set({
    webhookId: webhook.id,
    webhookToken: webhook.token!,
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
    displayName: `Anonim #${number}`,
    webhookId: "private-channel",
    webhookToken: "private-channel",
    anonymousNumber: number,
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
    .setTitle(`🕵️ ${account.displayName}`)
    .setDescription("Bu profil anonim sistemdeki kimliğindir. Gerçek Discord hesabın diğer kullanıcılara gösterilmez.")
    .addFields(
      { name: "Anonim Kimlik", value: account.displayName, inline: true },
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
      `Gönderen: **${senderProfile.displayName}**\n` +
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
    let generalWebhookId = settings.generalWebhookId;
    let generalWebhookToken = settings.generalWebhookToken;
    if (!generalWebhookId || !generalWebhookToken) {
      const created = await (general as TextChannel).createWebhook({
        name: "Anonim Sohbet",
        avatar: "https://cdn.discordapp.com/embed/avatars/0.png",
        reason: "Anonim genel sohbet profil webhook'u",
      });
      generalWebhookId = created.id;
      generalWebhookToken = created.token!;
      await pool.query(
        `UPDATE anonymous_chat SET general_webhook_id = $1, general_webhook_token = $2 WHERE guild_id = $3`,
        [generalWebhookId, generalWebhookToken, message.guildId],
      );
    }
    if (!privateAccount.webhookToken || privateAccount.webhookToken === "private-channel") return true;
    const generalWebhook = new WebhookClient({ id: generalWebhookId, token: generalWebhookToken });
    const generalMessage = await generalWebhook.send({
      content,
      username: privateAccount.displayName,
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
      if (!recipient.webhookToken || recipient.webhookToken === "private-channel") continue;
      const copyWebhook = new WebhookClient({ id: recipient.webhookId, token: recipient.webhookToken });
      const copy = await copyWebhook.send({
        content,
        username: privateAccount.displayName,
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