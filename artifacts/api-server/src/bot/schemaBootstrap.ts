import { pool } from "@workspace/db";

/**
 * Drizzle şeması ile geliştirme veritabanı arasında fark olduğunda botun
 * özellikleri relation-not-found hatasıyla düşmemesi için idempotent bootstrap.
 * Bu script veri silmez; yalnızca eksik tablo/kolon/index ekler.
 */
export async function ensureBotSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS guild_settings (
      guild_id TEXT PRIMARY KEY,
      prefix TEXT NOT NULL DEFAULT 'v!',
      level_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS levels (
      user_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      xp INTEGER NOT NULL DEFAULT 0,
      level INTEGER NOT NULL DEFAULT 0,
      message_count INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, guild_id)
    );

    CREATE TABLE IF NOT EXISTS level_roles (
      guild_id TEXT NOT NULL,
      level INTEGER NOT NULL,
      role_id TEXT NOT NULL,
      PRIMARY KEY (guild_id, level)
    );

    CREATE TABLE IF NOT EXISTS moderation_logs (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      moderator_id TEXT NOT NULL,
      action TEXT NOT NULL,
      reason TEXT,
      duration INTEGER,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS moderation_settings (
      guild_id TEXT PRIMARY KEY,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      log_channel_id TEXT,
      ban_roles TEXT NOT NULL DEFAULT '[]',
      kick_roles TEXT NOT NULL DEFAULT '[]',
      warn_roles TEXT NOT NULL DEFAULT '[]',
      timeout_roles TEXT NOT NULL DEFAULT '[]',
      mute_roles TEXT NOT NULL DEFAULT '[]',
      temizle_roles TEXT NOT NULL DEFAULT '[]',
      mod_roles TEXT NOT NULL DEFAULT '[]',
      senior_mod_roles TEXT NOT NULL DEFAULT '[]',
      approval_channel_id TEXT,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS economy (
      user_id TEXT PRIMARY KEY,
      coins INTEGER NOT NULL DEFAULT 0,
      last_daily TIMESTAMP,
      streak INTEGER NOT NULL DEFAULT 0,
      luck INTEGER NOT NULL DEFAULT 0,
      luck_expires_at TIMESTAMP,
      pray_used_at TIMESTAMP,
      econ_xp INTEGER NOT NULL DEFAULT 0,
      econ_level INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS stat_channels (
      guild_id TEXT PRIMARY KEY,
      category_id TEXT,
      total_channel_id TEXT,
      online_channel_id TEXT,
      bots_channel_id TEXT,
      ch_count_channel_id TEXT,
      role_count_channel_id TEXT
    );

    CREATE TABLE IF NOT EXISTS giveaways (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message_id TEXT,
      host_id TEXT NOT NULL,
      prize TEXT NOT NULL,
      participants TEXT NOT NULL DEFAULT '[]',
      ends_at TIMESTAMP NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      winner_id TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS video_request_settings (
      guild_id TEXT PRIMARY KEY,
      moderation_channel_id TEXT,
      approval_roles TEXT NOT NULL DEFAULT '[]',
      invite_url TEXT,
      show_sharer_name BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS auto_role_settings (
      guild_id TEXT NOT NULL,
      role_id TEXT NOT NULL,
      target TEXT NOT NULL DEFAULT 'all',
      min_account_age_days INTEGER NOT NULL DEFAULT 0,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      PRIMARY KEY (guild_id, role_id)
    );

    CREATE TABLE IF NOT EXISTS remote_mod_settings (
      guild_id TEXT PRIMARY KEY,
      log_channel_id TEXT NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS remote_mod_authorized (
      user_id TEXT PRIMARY KEY,
      added_by TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS vbri_memories (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT,
      type TEXT NOT NULL DEFAULT 'fact',
      content TEXT NOT NULL,
      keywords TEXT DEFAULT '',
      importance INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT NOW(),
      access_count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS vbri_conversations (
      id SERIAL PRIMARY KEY,
      channel_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );

    ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS prefix TEXT NOT NULL DEFAULT 'v!';
    ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS level_enabled BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE guild_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();

    ALTER TABLE levels ADD COLUMN IF NOT EXISTS xp INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE levels ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE levels ADD COLUMN IF NOT EXISTS message_count INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE levels ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();

    ALTER TABLE moderation_logs ADD COLUMN IF NOT EXISTS guild_id TEXT;
    ALTER TABLE moderation_logs ADD COLUMN IF NOT EXISTS user_id TEXT;
    ALTER TABLE moderation_logs ADD COLUMN IF NOT EXISTS moderator_id TEXT;
    ALTER TABLE moderation_logs ADD COLUMN IF NOT EXISTS action TEXT;
    ALTER TABLE moderation_logs ADD COLUMN IF NOT EXISTS reason TEXT;
    ALTER TABLE moderation_logs ADD COLUMN IF NOT EXISTS duration INTEGER;
    ALTER TABLE moderation_logs ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE moderation_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW();

    ALTER TABLE moderation_settings ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE moderation_settings ADD COLUMN IF NOT EXISTS log_channel_id TEXT;
    ALTER TABLE moderation_settings ADD COLUMN IF NOT EXISTS ban_roles TEXT NOT NULL DEFAULT '[]';
    ALTER TABLE moderation_settings ADD COLUMN IF NOT EXISTS kick_roles TEXT NOT NULL DEFAULT '[]';
    ALTER TABLE moderation_settings ADD COLUMN IF NOT EXISTS warn_roles TEXT NOT NULL DEFAULT '[]';
    ALTER TABLE moderation_settings ADD COLUMN IF NOT EXISTS timeout_roles TEXT NOT NULL DEFAULT '[]';
    ALTER TABLE moderation_settings ADD COLUMN IF NOT EXISTS mute_roles TEXT NOT NULL DEFAULT '[]';
    ALTER TABLE moderation_settings ADD COLUMN IF NOT EXISTS temizle_roles TEXT NOT NULL DEFAULT '[]';
    ALTER TABLE moderation_settings ADD COLUMN IF NOT EXISTS mod_roles TEXT NOT NULL DEFAULT '[]';
    ALTER TABLE moderation_settings ADD COLUMN IF NOT EXISTS senior_mod_roles TEXT NOT NULL DEFAULT '[]';
    ALTER TABLE moderation_settings ADD COLUMN IF NOT EXISTS approval_channel_id TEXT;
    ALTER TABLE moderation_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();

    ALTER TABLE video_request_settings ADD COLUMN IF NOT EXISTS invite_url TEXT;
    ALTER TABLE video_request_settings ADD COLUMN IF NOT EXISTS show_sharer_name BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE video_request_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();

    CREATE UNIQUE INDEX IF NOT EXISTS anonymous_accounts_guild_user_unique
      ON anonymous_accounts (guild_id, user_id);
    CREATE UNIQUE INDEX IF NOT EXISTS anonymous_accounts_guild_number_unique
      ON anonymous_accounts (guild_id, anonymous_number);
    CREATE UNIQUE INDEX IF NOT EXISTS anonymous_accounts_anonymous_id_unique
      ON anonymous_accounts (anonymous_id);
    CREATE UNIQUE INDEX IF NOT EXISTS anonymous_messages_source_message_unique
      ON anonymous_messages (source_message_id);
    CREATE UNIQUE INDEX IF NOT EXISTS anonymous_blocks_user_account_unique
      ON anonymous_blocks (user_id, blocked_account_id);
  `);
}