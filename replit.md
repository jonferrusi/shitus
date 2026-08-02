# Duty Log — Shift Tracker Bot

A Discord bot + Express web dashboard for tracking staff shifts on a single
Discord server: clock on/off, shift types, weekly quotas, a leaderboard, and
a website where people can see their hours.

## Stack

- **Runtime**: Node.js 18+
- **Bot**: discord.js 14
- **Web server**: Express (with express-session)
- **Database**: SQLite via better-sqlite3 (`data.sqlite` — created automatically on first run)
- **Auth**: Discord OAuth2 (`identify` scope), guild membership checked with the bot token

## How to run

The workflow `Start application` runs `npm start`, which launches both the
bot and the web server together via `src/index.js`. Set `PORT` for the
Replit webview (defaults to 3000).

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
| `PORT` | Set for the Replit webview |
| `WEEK_START_DAY` | Day the quota week resets on (0=Sunday … 6=Saturday) |

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
