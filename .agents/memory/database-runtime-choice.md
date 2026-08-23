---
name: Database runtime choice
description: Database driver and schema consistency after merging richer bot features.
---

The bot's current source of truth is Replit PostgreSQL via Drizzle; all schema files and the runtime driver must use the same dialect.

**Why:** A merge introduced PostgreSQL schemas while the local runtime still used SQLite/libsql, which caused missing exports and incompatible schema behavior.

**How to apply:** When importing future bot features, keep the PostgreSQL driver/config and run the database schema push before restarting the bot.