# Running your Duty Log backend for free (using your own computer)

This walks through getting everything working without paying for hosting.
The trade-off: it only works while your computer is on and these programs
are running. If you turn your computer off, the login button on your
Netlify site will stop working until you turn it back on and start things
back up again.

You'll end up with **two windows open** at the same time: one running the
bot + website, one running a small program called ngrok that gives your
computer a public web address. Both need to stay open while you want the
site to work.

---

## 1. Install Node.js (if you haven't already)

1. Go to https://nodejs.org
2. Download the button that says **LTS** (not "Current")
3. Run the installer, clicking Next/Agree through the defaults

To check it worked, open:
- **Windows:** search for "Command Prompt" in the Start menu, open it
- **Mac:** search for "Terminal" in Spotlight (Cmd+Space), open it

Type this and press Enter:
```
node --version
```
If you see something like `v22.x.x`, you're good.

## 2. Unzip the backend project

Unzip `shift-tracker-bot.zip` somewhere you'll remember, like your Desktop.

In your Command Prompt / Terminal, navigate into that folder. If you
unzipped it to your Desktop, that's usually:

```
cd Desktop/shift-tracker-bot
```

Then install its dependencies (this downloads everything it needs — only
has to be done once):

```
npm install
```

This can take a minute or two.

## 3. Set up an ngrok account (this gives you a free public web address)

1. Go to https://ngrok.com and click Sign Up (free, no credit card needed
   for this)
2. Once logged in, go to https://dashboard.ngrok.com/get-started/setup and
   follow the "Install" step for your operating system — it'll have you
   download ngrok and run one command with an authtoken it gives you,
   something like:
   ```
   ngrok config add-authtoken YOUR_TOKEN_HERE
   ```
3. In the ngrok dashboard, find your free domain: look for **Domains** in
   the left sidebar (under Universal Gateway/Cloud Edge). You'll see one
   already assigned to you, looking like:
   ```
   your-name-123.ngrok-free.dev
   ```
   Copy that down — you'll need it twice below.

## 4. Set up the Discord application (if you haven't already)

Follow steps 1–8 in the main `README.md` inside the backend project to
create the Discord application, bot token, client ID/secret, and role IDs.

**Two settings need your ngrok address instead of localhost:**

- In the Discord Developer Portal → OAuth2 → Redirects, add:
  ```
  https://your-name-123.ngrok-free.dev/auth/callback
  ```
- In your `.env` file (copy `.env.example` to `.env` first if you haven't),
  set:
  ```
  OAUTH_REDIRECT_URI=https://your-name-123.ngrok-free.dev/auth/callback
  ```

## 5. Register the Discord slash commands (one-time)

Still in your Command Prompt/Terminal, inside the `shift-tracker-bot`
folder:

```
npm run deploy-commands
```

You should see "Slash commands registered."

## 6. Start the tunnel

Open a **new** Command Prompt/Terminal window (keep it separate) and run:

```
ngrok http --url=https://your-name-123.ngrok-free.dev 3000
```

(swap in your actual domain from step 3). Leave this window open — closing
it turns off your public address.

## 7. Start the bot + website

Back in your **first** Command Prompt/Terminal window (in the
`shift-tracker-bot` folder), run:

```
npm start
```

You should see something like "Logged in as YourBot#1234" and "Dashboard
running at http://localhost:3000". Leave this window open too.

## 8. Point your Netlify site at your ngrok address

Open `netlify.toml` inside your `shift-tracker-website` folder with any
plain text editor (Notepad on Windows, TextEdit on Mac — make sure TextEdit
is in plain text mode, Format menu → Make Plain Text). Replace **both**
occurrences of `YOUR-BACKEND-URL` with your ngrok domain:

```toml
[[redirects]]
  from = "/api/*"
  to = "https://your-name-123.ngrok-free.dev/api/:splat"
  status = 200
  force = true

[[redirects]]
  from = "/auth/*"
  to = "https://your-name-123.ngrok-free.dev/auth/:splat"
  status = 200
  force = true
```

Save the file, then drag the whole `shift-tracker-website` folder into
https://app.netlify.com/drop again to redeploy it with the updated setting.

## 9. Test it

With both windows (ngrok + npm start) still running, visit your Netlify
site and click **Sign in with Discord**. It should now work.

## Every time you want to use it again

You'll need to repeat steps 6 and 7 (start the ngrok tunnel, then run
`npm start`) — both windows have to be open and running at the same time.
Everything else (installing, .env, Netlify) only needs to be done once.

**Note:** ngrok's free plan shows visitors a one-time "you're visiting an
ngrok site" click-through page the first time they open your link in a
browser (not on API calls, just plain browser visits) — that's expected and
just something to click past, not an error.
