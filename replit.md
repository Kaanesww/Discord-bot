# VBRI Discord Bot

A Turkish-language Discord bot system with a web dashboard. Features XP-based leveling, economy (coins, blackjack, roulette, duels), moderation, and canvas-generated profile/rank cards.

## Run & Operate

- API server + bot start automatically via the **`artifacts/api-server: API Server`** workflow
- Dashboard starts automatically via the **`artifacts/bot-dashboard: web`** workflow
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages

## Stack

- pnpm workspaces, Node.js 20, TypeScript 5.9
- **Bot/API**: Express 5, Discord.js 14, @napi-rs/canvas (image cards)
- **DB**: SQLite (local file at `data/bot.db`) + Drizzle ORM (libsql/turso dialect)
- **Dashboard**: React 19, Vite, Tailwind CSS 4, Shadcn UI
- **Validation**: Zod, drizzle-zod
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Where things live

- `artifacts/api-server/src/bot/` — bot entry point, all commands, leveling, economy, moderation
- `artifacts/api-server/src/bot/commands/` — individual command files
- `artifacts/api-server/src/routes/` — Express API routes
- `artifacts/bot-dashboard/src/` — React dashboard frontend
- `lib/db/src/schema/` — Drizzle ORM schema (economy, guilds, levels, moderation, levelRoles)
- `lib/api-spec/` — OpenAPI spec (source of truth for API contracts)

## Required env

- `DISCORD_TOKEN` — bot token
- `DISCORD_CLIENT_ID` — Discord application ID
- `GEMINI_API_KEY` — Google Gemini API key (used for AI chat features)
- No database URL needed — DB is a local SQLite file (`data/bot.db`)

## Bot invite URL

Logged in the API server console on startup (check workflow logs).

## Architecture decisions

- Bot runs inside the same process as the Express API server (`artifacts/api-server/src/index.ts`)
- All canvas image generation uses `@napi-rs/canvas` (not browser Canvas API)
- Prefix is per-guild, stored in `guildSettings` table; default is `v!`
- Currently uses slash commands registered globally via Discord REST API on startup

## User preferences

- Commands should be prefix-based (not slash), default prefix `v!`
- Help menu should be category-based with per-category images
- Economy system should have luck mechanic with `pray` command

## Gotchas

- The API server builds via esbuild before starting (`pnpm run build` inside the dev script) — first startup is slow (~1-2s)
- `PORT` env var must be set; the managed workflow injects it automatically (8080 for API, 3000 for dashboard)
- After any Discord intent or command change, the bot must be restarted for it to re-register slash commands

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
