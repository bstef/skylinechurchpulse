# Skyline Church · Service Ledger — Deployment Guide

Two files, no build step required:
- `index.html` — the whole app (Supabase JS + Chart.js loaded from CDN)
- `schema.sql` — run this once in Supabase to create the table

## 1. Create the Supabase project
1. Go to https://supabase.com → New project (free tier is plenty).
2. Once it's created, go to **SQL Editor** → paste the contents of `schema.sql` → Run.
3. Go to **Project Settings → API**. Copy:
   - **Project URL**
   - **anon public** key

## 2. Connect the app to Supabase
Open `index.html`, find these two lines near the top of the `<script>` block:

```js
const SUPABASE_URL = "YOUR_SUPABASE_PROJECT_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
```

Replace with the values from step 1. Save the file. (These are safe to expose publicly — access is controlled by the Row Level Security policies in `schema.sql`, not by hiding the key.)

## 3. Deploy to Cloudflare Pages
**Option A — drag and drop (fastest, no git needed):**
1. Go to the Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Upload assets**.
2. Drag in `index.html` (just that one file).
3. Deploy. Cloudflare gives you a URL like `skyline-ledger.pages.dev`.

**Option B — connect a GitHub repo:**
1. Push `index.html` to a new GitHub repo.
2. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git → pick the repo.
3. Build settings: no framework, no build command, output directory `/`.
4. Deploy.

## 4. (Optional) Custom domain
In the Pages project → **Custom domains** → add something like `ledger.skylinechurchnj.org` if you own that domain and it's on Cloudflare DNS.

## 5. Share it
Send the `.pages.dev` (or custom) URL to the pastor and worship leader. No login required — anyone with the link can add or view entries, matching what you asked for.

## Notes
- To lock it down later (e.g. require login), you'd add Supabase Auth and change the RLS policies in `schema.sql` from `using (true)` to check `auth.uid()`.
- All charts and data logic run client-side; Supabase is just the shared database.
