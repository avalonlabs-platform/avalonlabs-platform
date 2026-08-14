# AvalonLabs Platform

AI Mentor Agents & SaaS Microservices — homepage, pricing, legal pages, and Paddle checkout
scaffolding built with Next.js (App Router, TypeScript, Tailwind CSS v4).

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in real Supabase/Paddle values
npm run dev
```

Open [http://localhost:3001](http://localhost:3000). If that port is already in use, Next.js will
pick the next free one (check the terminal output).

## What's here

- `src/app/page.tsx` — homepage: hero, pricing table, contact form.
- `src/app/terms`, `/privacy`, `/refund` — mandatory legal pages, linked from the footer.
- `src/components/paddle/pricing-table.tsx` — subscription tiers + one-time microservices,
  wired to `Paddle.PricePreview()` and `Paddle.Checkout.open()`.
- `src/constants/pricing-tiers.ts` — plan definitions and Paddle price ID env var mapping.
- `src/lib/site-config.ts` — single source of truth for site copy, support email, and legal
  entity details used across the footer and legal pages.
- `src/lib/supabase/` — browser/server Supabase client helpers (auth prep).
- `src/app/api/contact/route.ts` — contact form handler (currently logs; wire up an email
  provider or Supabase insert before go-live).

## Before going live

The legal pages and site config use bracketed placeholders that must be replaced with real
values before submitting for Paddle's Go-Live Readiness Audit:

- `siteConfig.legalEntityName`, `legalEntityAddress`, `governingLawJurisdiction` in
  `src/lib/site-config.ts`.
- Real support/legal/privacy email addresses (currently `*@avalonlabs.example`).
- Populate all `NEXT_PUBLIC_PADDLE_PRICE_*` env vars once products/prices exist in your Paddle
  catalog (see the `paddle:catalog-setup` skill).
- Set `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`, `NEXT_PUBLIC_PADDLE_ENV`, `PADDLE_API_KEY`, and
  `PADDLE_WEBHOOK_SECRET` — sandbox while testing, live only once approved.
- Fill in `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
  `SUPABASE_SERVICE_ROLE_KEY` once the Supabase project exists.

## Scripts

- `npm run dev` — start the dev server (Turbopack).
- `npm run build` — production build.
- `npm run lint` — ESLint.
