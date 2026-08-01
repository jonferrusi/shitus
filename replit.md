# Shiftus — Shift Tracker Bot

A multi-tenant Discord bot + Express web dashboard for tracking staff
shifts: clock on/off, shift types, weekly/biweekly/monthly quotas,
leaderboards, LOA requests, and weekly reports — across many independent
Discord communities from one deployment.

## Stack

- **Runtime**: Node.js 20+
- **Bot**: discord.js 14
- **Web server**: Express (with express-session, backed by a SQLite-based session store)
- **Database**: SQLite via better-sqlite3 (`data.sqlite` — created automatically on first run)
- **Billing**: Stripe (optional — subscription enforcement is a no-op if `STRIPE_SECRET_KEY` isn't set)
- **Auth**: Discord OAuth2 (`identify guilds` scope)

## How to run

The workflow `Start application` runs `npm start`, which launches the bot,
the web server, and the hourly background scheduler together via
`src/index.js`. Set `PORT` for the Replit webview (defaults to 3000).

To (re-)register slash commands globally — run once after setup or when a
command's options change; new communities also get an instant guild-scoped
registration automatically when they're created:

```
node src/deploy-commands.js
```

> **Note:** The bot must be invited with the `bot` **and**
> `applications.commands` scopes for slash commands to work. Communities
> link their own Discord server from the dashboard — there's no single
> guild ID to configure for the whole deployment.

## Environment variables (set in Replit Secrets / Env Vars)

See `env.example` for the full list with descriptions. In short:

| Key | Where to get it |
|-----|----------------|
| `DISCORD_TOKEN` | Bot tab → Reset Token in Discord Developer Portal |
| `DISCORD_CLIENT_ID` | OAuth2 → General → Client ID |
| `DISCORD_CLIENT_SECRET` | OAuth2 → General → Client Secret |
| `PLATFORM_OWNER_DISCORD_ID` | Your own Discord user ID — communities you create are auto-activated, and the bot grants you an Administrator role in every server it joins |
| `ADMIN_ROLE_IDS` / `ADD_TIME_ROLE_IDS` | Optional global fallback role IDs, comma-separated |
| `OAUTH_REDIRECT_URI` | Must match a redirect in Discord Developer Portal exactly |
| `SESSION_SECRET` | Any long random string |
| `PORT` | Set for the Replit webview |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PRICE_ID` | Optional — leave blank to run without billing enforcement |

## Discord Developer Portal — redirect URI

Add your deployment's `/auth/callback` URL to **OAuth2 → General →
Redirects** in the Discord Developer Portal, matching `OAUTH_REDIRECT_URI`
exactly (e.g. `https://<your-repl-domain>/auth/callback`).

## Project structure

```
src/
  index.js            — entry point: starts bot + web server + scheduler
  bot.js              — Discord client setup, owner auto-role, interaction routing
  server.js           — Express app, OAuth2 routes, all /api/communities/:id/* routes
  db.js               — SQLite schema + every query
  discordApi.js       — Discord REST helpers (roles, DMs, guild info, command deployment)
  communityContext.js — resolves the community/admin/subscription context for bot interactions
  shiftActions.js      — on-shift role sync + Force End, shared by the bot and the website
  reminders.js         — quota reminder DM content, shared by the manual send and the scheduler
  stripe.js            — Checkout sessions + webhook handling
  scheduler.js          — hourly reminders + week-rollover job
  sessionStore.js       — SQLite-backed express-session store
  panel.js              — legacy button/dropdown shift panel
  commands/             — slash command handlers + the shared command manifest
  deploy-commands.js    — registers slash commands globally with the Discord API
public/
  index.html    — marketing landing page + Discord sign-in
  dashboard.html — user dashboard (community switcher, clock, quotas, history)
  admin.html     — admin panel (all sections described in README.md)
  css/ js/       — static assets
data.sqlite      — created automatically on first run
```

## User preferences

- Keep the existing project structure and stack.
