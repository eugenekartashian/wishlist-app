# Wishlist MVP (React + Supabase)

Simple wishlist app with:

- email magic-link auth + Google OAuth
- add product by URL
- metadata parsing (`title`, `description`, `image`, `price`, `currency`)
- personal list per user
- public read-only share link

## 1) Run SQL in Supabase

Open Supabase SQL Editor and execute [`supabase/schema.sql`](./supabase/schema.sql).

## 2) Configure Auth URLs

In Supabase Dashboard:

- `Authentication` -> `URL Configuration`
- `Site URL`: `http://localhost:5173`
- `Redirect URLs`: `http://localhost:5173/**`

## 3) Optional: Enable Google login

In Supabase Dashboard:

- `Authentication` -> `Providers` -> `Google`
- Enable provider
- Add Google OAuth Client ID and Client Secret
- In Google Cloud console add the exact callback URL shown in Supabase provider settings

## 4) Environment

`.env.local` is already created for local dev.

If you need to recreate it, copy from `.env.example`.

## 5) Start

```bash
pnpm dev
```

This runs:

- React client at `http://localhost:5173`
- API server at `http://localhost:8787`

Vite proxies `/api/*` to the API server.

## Endpoints

- `POST /api/parse` parses metadata from a product URL.
- `GET /api/shared/:token` returns public read-only shared wishlist data.
- `GET /api/health` health check.

## 6) Deploy to Vercel

1. Push this folder to GitHub.
2. In Vercel: `Add New -> Project` and import the repo.
3. Set environment variables in Vercel project settings:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Deploy.

After deploy, update auth URLs:

1. Supabase `Authentication -> URL Configuration`:
   - `Site URL`: `https://<your-vercel-domain>`
   - `Redirect URLs`: `https://<your-vercel-domain>/**`
2. Google OAuth Client (`Web application`):
   - `Authorized JavaScript origins`: `https://<your-vercel-domain>`
   - `Authorized redirect URI`: `https://gamokhikaygubcqjpizp.supabase.co/auth/v1/callback`

## Notes

- `VITE_SUPABASE_ANON_KEY` is used in browser.
- `SUPABASE_SERVICE_ROLE_KEY` is used only on server.
- If you rotate keys in Supabase, update `.env.local`.
