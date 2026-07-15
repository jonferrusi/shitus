# Duty Log — Shift Tracker Bot

A Discord bot + web dashboard for tracking staff shifts: clock on/off, different
shift types (Normal Patrol, Supervisory, or anything you add), weekly quotas,
and a website where people can see their hours. No CAD/dispatch — just shift
tracking.

## What you get

- **`/shift on`** — clock on to a shift (pick a type from the autocomplete list)
- **`/shift off`** — clock off, see how long you were on and this week's totals
- **`/shift status`** — quick check of your current shift + weekly progress
- **`/shift manage`** — an interactive panel the bot posts in the channel:
  a **Start Shift** button → a dropdown to pick the shift type → the panel
  updates to show **Start Break** / **End Break** and **End Shift** buttons
  while you're on. Everything happens on that one message.
- **`/shiftleaderboard`** — pick a shift type from a dropdown, then see the
  weekly leaderboard for it: 🟢 for people over quota, 🔴 for people under it
- **`/admin shifttype add|remove|restrict|list`** — manage shift types, including
  restricting one to a specific Discord role (e.g. only Supervisors can start
  a Supervisory Shift)
- **`/admin quota set|list`** — set a weekly hour quota, either overall or per shift type
- **`/admin permissions add|remove|list`** — grant/revoke Admin or Add Time
  access to a role directly from Discord, no `.env` editing or restart needed
- A dashboard website (**Sign in with Discord**) showing:
  - a live "on shift" (or "on break") timer, with **Start Shift**, **Start
    Break** / **End Break**, and **End Shift** controls right on the page —
    the same clock as the Discord panel, so either one works
  - weekly progress bars against quota, with a clear "Quota met" / "Below
    quota" pill for each shift type
  - all-time totals per shift type
  - shift history, tagged "Manual" for hand-entered time
  - a **Log Time** form so people with a specific Discord role can add a
    completed shift by hand (for time that wasn't clocked live)
  - an **Admin** page with the full roster's weekly hours (green if over
    quota, red if under), controls to manage shift types/quotas (including
    restricting a shift type to one role) without touching Discord, and a
    **Permissions** section to grant/revoke Admin or Add Time access per role

The bot and the website share one local SQLite database file (`data.sqlite`),
so anything logged in Discord shows up on the site immediately.

## 1. Create the Discord application

1. Go to https://discord.com/developers/applications → **New Application**.
2. **Bot** tab → **Reset Token** → copy it. This is `DISCORD_TOKEN`.
3. **OAuth2 → General** → copy **Client ID** (`DISCORD_CLIENT_ID`) and
   **Client Secret** (`DISCORD_CLIENT_SECRET`).
4. **OAuth2 → General → Redirects** → add `http://localhost:3000/auth/callback`
   (must match `OAUTH_REDIRECT_URI` in your `.env` exactly).
5. **OAuth2 → URL Generator** → scopes: `bot`, `applications.commands` →
   permissions: at least `Send Messages`, `Use Slash Commands` → open the
   generated URL and invite the bot to your server.
6. Turn on **Developer Mode** in Discord (User Settings → Advanced), then
   right-click your server icon → **Copy Server ID** → that's `DISCORD_GUILD_ID`.
7. Right-click whichever role(s) should count as "admin" (able to manage
   shift types/quotas and see the roster) → Copy Role ID → put those,
   comma-separated, in `ADMIN_ROLE_IDS`. Server members with the
   **Administrator** permission always count as admin too.
8. Right-click whichever role(s) should be allowed to manually **add time**
   on the website → Copy Role ID → put those, comma-separated, in
   `ADD_TIME_ROLE_IDS`. Anyone without one of these roles (or an admin role)
   won't see the "Log Time" form at all. Admins can always add time too.

## 2. Install & configure

```bash
npm install
cp .env.example .env
# then fill in .env with the values from step 1
```

## 3. Register the slash commands

Run this once, and again any time you change a command's options:

```bash
npm run deploy-commands
```

## 4. Run it

```bash
npm start
```

This runs both the Discord bot and the website together. You should see
"Logged in as YourBot#1234" and "Dashboard running at http://localhost:3000".

(If you ever want them as separate processes instead, `npm run bot-only`
and `npm run web-only` still work individually.)

Open `http://localhost:3000`, click **Sign in with Discord**. You'll need to
already be a member of the server for login to work.

## Default data

The database seeds two shift types the first time it's created: **Normal
Patrol** and **Supervisory Shift**. Add more (e.g. "Training Shift", "K9
Patrol") with `/admin shifttype add` or from the Admin page on the site — no
code changes needed. No quotas are set by default; use `/admin quota set` or
the Admin page to set them.

## Notes on quotas

- A quota can apply to one specific shift type, or be left as "Overall" to
  require a certain number of hours across *all* shift types combined per week.
  You can set both an overall quota and per-type quotas at the same time.
- The week resets on the day set by `WEEK_START_DAY` in `.env` (default `1` =
  Monday), at midnight server time.
- Removing a shift type just hides it from `/shift on` and the admin lists —
  past shifts logged under it are kept for history/roster purposes.

## Roles and permissions

There are three kinds of access, and each can be granted two ways — listed
in `.env` (`ADMIN_ROLE_IDS` / `ADD_TIME_ROLE_IDS`), or granted from inside
the app (`/admin permissions add` in Discord, or the Permissions section on
the Admin page) — both count, so you don't have to touch `.env` or restart
anything for day-to-day changes:

- **Admin** — manage shift types, quotas, restrictions, and permissions;
  view the roster. Server members with Discord's own **Administrator**
  permission always count as admin too.
- **Add Time** — can use the "Log Time" form on the website to add a
  completed shift by hand.
- **Shift-type restrictions** — separate from the above, any individual
  shift type can be locked to one role (e.g. only **Supervisor** can start
  a Supervisory Shift) via `/admin shifttype add`/`restrict`, or the
  dropdown next to each shift type on the Admin page. Leave it unrestricted
  and anyone can start it. This is checked everywhere someone can start a
  shift: `/shift on`, the `/shift manage` panel, and the website.

## The Shift Manager panel (`/shift manage`)

- Running the command posts a normal message from the bot (not ephemeral) —
  it's a real panel that stays in the channel and updates in place as
  buttons/dropdowns are used, rather than disappearing.
- The panel is personal: only the person who ran `/shift manage` can use
  its buttons. If someone else clicks it, the bot tells them to run their
  own `/shift manage` instead — it won't touch the original user's shift.
- **Breaks** pause the clock without ending the shift: time spent on break
  is subtracted from the shift's duration when it's totaled up. If a shift
  is ended while still on break, the in-progress break is automatically
  closed out first so nothing is double-counted.
- `/shift on`/`/shift off` and the panel both read/write the same shift
  data, so people can mix and match — clock on with the panel, end with
  the slash command, whatever's convenient. The **website's Start
  Shift/Start Break/End Break/End Shift buttons use the exact same clock**
  too, so someone can start a shift on Discord and end it from the website
  (or vice versa) with no issues.

## Leaderboard and quota colors

- `/shiftleaderboard` shows a dropdown of every shift type plus "Overall".
  Whichever one is picked, it ranks the top 15 people by hours logged **this
  week** for that type, with a colored dot per person: 🟢 if they've met or
  passed the quota for that type, 🔴 if they haven't, ⚪ if no quota is set.
- The same "over quota = green, under quota = red" treatment is used on the
  website's Admin roster page, and every quota bar on the dashboard has an
  explicit "Quota met" / "Below quota" label rather than relying on color alone.

## Manual time entries

Time added through the "Log Time" form is stored the same as clocked shifts
and counts toward weekly totals, quotas, and the leaderboard — it's just
tagged internally as `manual` (vs `clock`) so you can tell the two apart if
you ever query the database directly.

## Moving off your own machine later

Everything here is a plain Node.js app with a SQLite file, so it will run
as-is on a small VPS or a host like Railway/Render — just set the same
environment variables there, update `OAUTH_REDIRECT_URI` (and the Discord
Developer Portal redirect) to your real domain, and run `npm start` there
(it launches both the bot and the website together).

**Want the website on Netlify specifically?** There's a separate
`shift-tracker-website` package with just the frontend, set up to proxy API
calls through to this backend (wherever it ends up running) — see the
README inside that package. The bot and database still need to run here,
on something that stays on; Netlify only hosts the static site.

**Don't want to pay for hosting?** See `FREE-LOCAL-SETUP.md` in this
project for a step-by-step guide to running everything on your own
computer for free, using ngrok to give it a public address that the
Netlify site can reach. The trade-off is it only works while your computer
and these programs are running.
