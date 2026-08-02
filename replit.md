# Duty Log — Shift Tracker Bot

A Discord bot + Express web dashboard for tracking staff shifts on a single
Discord server: clock on/off, shift types, weekly quotas, a leaderboard, and
a website where people can see their hours.

## Stack

- **Runtime**: Node.js 20 (`.replit` pins `nodejs-20`)
- **Bot**: discord.js 14
- **Web server**: Express (with express-session)
- **Database**: SQLite via `@libsql/client` — a local `data.sqlite` file by
  default (created automatically on first run), or a remote
  [Turso](https://turso.tech) database if `TURSO_DATABASE_URL` is set. On
  Replit the local file is fine: unlike some other free hosts, a Repl's
  filesystem persists across restarts and inactivity sleep, so there's no
  need to set up Turso here — leave `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN`
  blank.
- **Auth**: Discord OAuth2 (`identify` scope), guild membership checked with the bot token

## How to run

`.replit` runs `npm start`, which launches both the bot and the web server
together via `src/index.js`, listening on port 3000 (mapped to the Replit
webview's external port 80 — see `.replit`). By default a Repl sleeps after
a period of inactivity; turn on **Always On** (or use a Reserved VM
deployment) if you need the bot connected to Discord continuously — either
way, the SQLite file's contents are never lost, since disk persists through
sleep/wake regardless.

To (re-)register slash commands — run once after setup or when a command's
options change:

```
node src/deploy-commands.js
```

> **Note:** The bot must be invited with the `bot` **and**
> `applications.commands` scopes for slash commands to work, and needs
> `DISCORD_GUILD_ID` set to the one server it manages.

## Environment variables (set in Replit Secrets / Env Vars)

See `env.example` for the full list with descriptions. In short:

| Key | Where to get it |
|-----|----------------|
| `DISCORD_TOKEN` | Bot tab → Reset Token in Discord Developer Portal |
| `DISCORD_CLIENT_ID` | OAuth2 → General → Client ID |
| `DISCORD_CLIENT_SECRET` | OAuth2 → General → Client Secret |
| `DISCORD_GUILD_ID` | Right-click the server icon → Copy Server ID (Developer Mode on) |
| `ADMIN_ROLE_IDS` / `ADD_TIME_ROLE_IDS` | Comma-separated role IDs, granted here or from `/admin permissions` |
| `OAUTH_REDIRECT_URI` | Must match a redirect in Discord Developer Portal exactly |
| `SESSION_SECRET` | Any long random string |
| `WEEK_START_DAY` | Day the quota week resets on (0=Sunday … 6=Saturday) |
| `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` | Leave blank on Replit — only needed on hosts with an ephemeral filesystem |

`PORT` doesn't need to be a Secret — it's already set to `3000` in `.replit`.

## Discord Developer Portal — redirect URI

Add your deployment's `/auth/callback` URL to **OAuth2 → General →
Redirects** in the Discord Developer Portal, matching `OAUTH_REDIRECT_URI`
exactly (e.g. `https://<your-repl-domain>/auth/callback`).

## Project structure

```
src/
  index.js            — entry point: starts bot + web server together
  bot.js              — Discord client setup, interaction routing
  server.js           — Express app, OAuth2 routes, all /api routes
  db.js               — SQLite schema + every query
  discordApi.js       — Discord REST helpers (OAuth exchange, guild member/roles)
  format.js           — shared embed styling + duration formatting
  panel.js            — the /shift manage button/dropdown panel
  commands/            — slash command handlers (shift, admin, leaderboard)
  deploy-commands.js   — registers slash commands with the Discord API
public/
  index.html    — marketing landing page + Discord sign-in
  dashboard.html — user dashboard (clock, quotas, log time, history)
  admin.html     — admin panel (roster, shift types, quotas, permissions)
  css/ js/       — static assets
data.sqlite      — created automatically on first run
```

## User preferences

- Keep the existing project structure and stack.
