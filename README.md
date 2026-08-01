# Shiftus — Shift Tracker Bot

A multi-tenant Discord bot + web dashboard for tracking staff shifts: clock
on/off, different shift types (Patrol, Supervisory, or anything you add),
weekly quotas, and a website where people can see their hours. One Shiftus
install can serve many independent Discord servers ("communities") at once —
each with its own shift types, quotas, roles, and roster, invite-linked from
the dashboard rather than configured per-deployment.

## What you get

- **`/shift on [type]`** — clock on to a shift (dropdown if the server has more than one type)
- **`/shift off`** — clock off, see how long you were on and this week's totals
- **`/shift break`** — start or end a break during an active shift
- **`/shift status`** — quick check of your current shift + weekly progress
- **`/leaderboard [type]`** — weekly leaderboard, optionally filtered to one shift type
- **`/loa request`** — opens a modal to submit a Leave of Absence request (reason + duration) for admin review
- **`/activeshifts`** — admin-only: everyone currently on shift, each with a Force End button
  (ends the shift, removes on-shift roles, and DMs the member who ended it and why)
- **`/admin shifttype add|remove|restrict|list`** — manage shift types, including
  restricting one to a specific Discord role (e.g. only Supervisors can start
  a Supervisory Shift)
- **`/admin quota set|list`** — set a weekly hour quota, either overall or per shift type
- **`/admin roles onshift|supervisor|activesupervisor|loa|list`** — configure the
  Discord roles assigned on clock-on/off and on LOA approval (see "On-shift roles" below)
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

Everything lives in one local SQLite database file (`data.sqlite`), so
anything logged in Discord shows up on the site immediately.

## 1. Create the Discord application

1. Go to https://discord.com/developers/applications → **New Application**.
2. **Bot** tab → **Reset Token** → copy it. This is `DISCORD_TOKEN`.
3. **OAuth2 → General** → copy **Client ID** (`DISCORD_CLIENT_ID`) and
   **Client Secret** (`DISCORD_CLIENT_SECRET`).
4. **OAuth2 → General → Redirects** → add `http://localhost:3000/auth/callback`
   (must match `OAUTH_REDIRECT_URI` in your `.env` exactly).
5. **OAuth2 → URL Generator** → scopes: `bot`, `applications.commands` →
   permissions: at least `Send Messages`, `Use Slash Commands` → open the
   generated URL. You don't invite the bot to a fixed server up front —
   anyone can invite it to a server they manage and link it from the
   dashboard (see "Communities" below).
6. Put your own Discord user ID in `PLATFORM_OWNER_DISCORD_ID` — any
   community you create is auto-activated (no subscription needed), and
   you can access every community for support/debugging.

## 2. Install & configure

```bash
npm install
cp env.example .env
# then fill in .env with the values from step 1
```

## 3. Register the slash commands

Run this once, and again any time you change a command's options — it
registers them globally, so they work in every server the bot is in
(new servers also get them instantly the moment their community is created):

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

Open `http://localhost:3000`, click **Sign in with Discord**, then use the
**+** button next to the community switcher to create a community from a
Discord server you manage (or join one you've been given an invite code
for).

## Communities

Shiftus is multi-tenant: one install can serve many Discord servers, each
as its own **community** with its own shift types, quotas, roles, and
roster. To set one up:

- **Create** — from the dashboard, pick a Discord server where you have
  **Manage Server** permission. This deploys Shiftus's slash commands to
  that server instantly and seeds nothing by default — add shift types
  from the Admin page or `/admin shifttype add`.
- **Join** — anyone with a community's invite code (shown on its Admin
  page) and Discord membership in that server can join it from the
  dashboard's **+** panel.
- Communities you've created or joined show up in the sidebar switcher on
  both the Dashboard and Admin pages.

## Default data

New communities start with no shift types or quotas configured. Add some
(e.g. "Patrol", "Supervisory Shift", "Training Shift") with
`/admin shifttype add` or from the Admin page — no code changes needed.

## Notes on quotas

- A quota can apply to one specific shift type, or be left as "Overall" to
  require a certain number of hours across *all* shift types combined per week.
  You can set both an overall quota and per-type quotas at the same time.
- Each community has its own week boundary (defaults to Monday 00:00 UTC).
- Removing a shift type just hides it from `/shift on` and the admin lists —
  past shifts logged under it are kept for history/roster purposes.

## Roles and permissions

There are three kinds of access, granted per-community and effective
immediately (no restart needed) — from inside the app (`/admin permissions
add` in Discord, or the Permissions section on the Admin page), or as a
global fallback listed in `.env` (`ADMIN_ROLE_IDS` / `ADD_TIME_ROLE_IDS`,
mainly useful for the platform operator's own communities):

- **Admin** — manage shift types, quotas, restrictions, and permissions;
  view the roster. The Discord server's owner, and anyone with Discord's own
  **Administrator** permission on that server, always count as admin too.
- **Add Time** — can use the "Log Time" form on the website to add a
  completed shift by hand.
- **Shift-type restrictions** — separate from the above, any individual
  shift type can be locked to one role (e.g. only **Supervisor** can start
  a Supervisory Shift) via `/admin shifttype add`/`restrict`, or the
  dropdown next to each shift type on the Admin page. Leave it unrestricted
  and anyone can start it. This is checked everywhere someone can start a
  shift: `/shift on`, and the website.

## On-shift roles

Configure up to four roles per community with `/admin roles ...` or the
Admin page's **On-Shift Roles** section:

- **On-Shift Role** — assigned to anyone currently on any shift, removed the
  moment they clock off (including a Force End).
- **Supervisor Check Role** — a role members already have; if someone with it
  clocks on, they also get the **Active Supervisor Role**.
- **Active Supervisor Role** — assigned alongside the On-Shift Role, only for
  members who hold the Supervisor Check Role.
- **LOA Role** — assigned automatically when an LOA request is approved.

All of this is best-effort: if the bot's own role is ranked below the one
it's trying to assign, or it lacks Manage Roles, the role change is skipped
and logged rather than blocking the clock-on/off itself.

## Quota periods and the admin panel

Each quota (overall or per shift type) has its own period — Weekly,
Biweekly (a rolling 14-day window), or Monthly (calendar month, UTC) — set
from the Admin page's **Quotas** section. Progress against a quota is always
computed over that quota's own period, everywhere it's shown: the dashboard,
`/shift on|off|status`, and the roster's Met/Below badge.

The rest of the Admin page: **Live Now** (with a Force End button per
active shift — ends it, removes on-shift roles, and DMs the member),
**Remove Time** (deducts hours from a member's most recent shifts, newest
first), **Week Schedule** (when the quota week resets, plus **Force End
Week Now** to close the current week early and start a fresh one — this
saves a snapshot report of the week so far), and **Quota Reminders**
(a once-a-day DM to anyone below a hours threshold, plus a manual "send one
now" for a specific member) round out the rest of what `/admin` covers from
Discord.

## Leave of Absence (LOA)

Members submit a request with `/loa request` (a modal: reason + duration in
days). Admins review it from the Admin page's **LOA Requests** section:
**Approve** assigns the configured LOA role and renames the member to
`LOA | <name>` (capped at 32 characters, original nickname remembered for
later), while still recording the approval even if the role/rename fails
(a warning banner explains why). **Deny** just marks it denied. A
**History** tab shows every past decision and who made it.

## Weekly reports and the background scheduler

A background job (`npm start` runs it in the same process as the bot and
website — `npm run bot-only`/`web-only` don't) checks every community once
an hour for two things:

- **Quota reminders** — if it's the configured reminder day and hour, and a
  reminder hasn't already gone out today, every member below the configured
  hour threshold gets a DM (hours logged, goal, progress bar, hours still
  needed). The Admin page's **Quota Reminders** section also has a "send one
  now" for any individual member, any time, regardless of the schedule.
- **Week rollover** — once a community's week has moved on, the previous
  week gets snapshotted into a report automatically (same as clicking Force
  End Week Now, just triggered by time passing instead of a click).

The Admin page's **Weekly Reports** section lets you pick any past week (or
jump to one by date) to see a summary — total hours, active members, how
many met the quota — and the full per-member breakdown. A week that was
never snapshotted still loads instantly, computed on demand from the raw
shift data and saved at that point; **Regenerate** recomputes a week after
backdating or correcting shifts.

Discord API hiccups (rate limits, a DM to someone with DMs closed, an
interaction that got answered a moment too late) are caught globally and
logged rather than crashing the process.

## Clocking on and off

- `/shift on` / `/shift off` / `/shift break` / `/shift status` are the
  primary way to clock on Discord. `/shift on` shows a dropdown if the
  server has more than one shift type you're allowed to start.
- **Breaks** pause the clock without ending the shift: time spent on break
  is subtracted from the shift's duration when it's totaled up. If a shift
  is ended while still on break, the in-progress break is automatically
  closed out first so nothing is double-counted.
- The **website's Start Shift/Start Break/End Break/End Shift buttons use
  the exact same clock** as the Discord commands, so someone can start a
  shift on Discord and end it from the website (or vice versa) with no
  issues.

## Leaderboard and quota colors

- `/leaderboard` shows a dropdown of every shift type plus "Overall" (or pass
  `type` directly to skip straight to it). Ranks the top 15 people by hours
  logged **this week** for that type, with progress bars and a ✅ for anyone
  who's met the quota.
- The same "over quota = green, under quota = red" treatment is used on the
  website's Admin roster page, and every quota bar on the dashboard has an
  explicit "Quota met" / "Below quota" label rather than relying on color alone.

## Manual time entries

Time added through the "Log Time" form is stored the same as clocked shifts
and counts toward weekly totals, quotas, and the leaderboard — it's just
tagged internally as `manual` (vs `clock`) so you can tell the two apart if
you ever query the database directly.

## Deploying

Shiftus is one Node.js process (bot + website + scheduler) plus a SQLite
file — one instance serves every community that links a Discord server to
it, so there's nothing for individual communities to host themselves. It
runs as-is on a small VPS or a host like Railway/Render/Fly: set the
environment variables from `env.example`, point `OAUTH_REDIRECT_URI` (and
the matching Discord Developer Portal redirect) at your real domain, run
`npm run deploy-commands` once, then `npm start`. Keep `data.sqlite`
(and the `sessions` table alongside it) on a persistent volume — it's the
only state that isn't reconstructible from Discord.
