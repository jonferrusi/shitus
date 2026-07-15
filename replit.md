# Duty Log — Shift Tracker Bot

A Discord bot + Express web dashboard for tracking staff shifts: clock on/off, shift types, weekly quotas, leaderboards, and manual time entry.

## Stack

- **Runtime**: Node.js 20
- **Bot**: discord.js 14
- **Web server**: Express (with express-session)
- **Database**: SQLite via better-sqlite3 (`data.sqlite` — created automatically on first run)
- **Auth**: Discord OAuth2

## How to run

The workflow `Start application` runs `npm start`, which launches both the bot and the web server together via `src/index.js`. Port **5000**.

To deploy slash commands to the Discord server (run once after setup or when commands change):

```
node src/deploy-commands.js
```

> **Note:** The bot must be invited with `bot` **and** `applications.commands` scopes for slash commands to register. See "Re-invite the bot" below.

## Environment variables (set in Replit Secrets / Env Vars)

| Key | Where to get it |
|-----|----------------|
| `DISCORD_TOKEN` | Bot tab → Reset Token in Discord Developer Portal |
| `DISCORD_CLIENT_ID` | OAuth2 → General → Client ID |
| `DISCORD_CLIENT_SECRET` | OAuth2 → General → Client Secret |
| `DISCORD_GUILD_ID` | Right-click server icon (Developer Mode on) → Copy Server ID |
| `ADMIN_ROLE_IDS` | Comma-separated role IDs with admin access |
| `ADD_TIME_ROLE_IDS` | Comma-separated role IDs that can manually log time |
| `OAUTH_REDIRECT_URI` | Must match a redirect in Discord Developer Portal exactly |
| `SESSION_SECRET` | Any long random string (already set) |
| `PORT` | Set to 5000 for Replit webview |
| `WEEK_START_DAY` | 0=Sunday … 6=Saturday (default: 1 = Monday) |

## Discord Developer Portal — required redirect URI

Add this to **OAuth2 → General → Redirects** in the Discord Developer Portal:

```
https://3d01bee1-44eb-45e4-84f3-91c999dc84cd-00-3v8ekzq331cv5.kirk.replit.dev/auth/callback
```

## Re-invite the bot (required for slash commands)

Open this URL in a browser to re-invite with the correct scopes:

```
https://discord.com/api/oauth2/authorize?client_id=1526620658723983421&permissions=309237648384&scope=bot+applications.commands
```

After the bot is in the server with `applications.commands`, run:

```
node src/deploy-commands.js
```

## Project structure

```
src/
  index.js          — entry point: starts bot + web server
  bot.js            — Discord client setup
  server.js         — Express app + OAuth2 routes
  db.js             — SQLite schema + queries
  commands/         — slash command handlers
  deploy-commands.js — registers slash commands with Discord API
  panel.js          — interactive Discord panel (buttons/dropdowns)
  format.js         — time formatting helpers
  discordApi.js     — Discord REST helpers
public/
  index.html        — landing / sign-in page
  dashboard.html    — user dashboard
  admin.html        — admin roster page
  css/ js/          — static assets
data.sqlite         — created automatically on first run
```

## User preferences

- Keep the existing project structure and stack.
