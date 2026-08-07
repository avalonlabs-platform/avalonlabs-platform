-- AvalonLabs Platform — Paddle sync tables.
-- Run once in the Supabase SQL editor (Project > SQL Editor > New query).
--
-- These mirror Paddle's customer/subscription/transaction state via webhooks
-- (see src/app/api/webhooks/paddle/route.ts). Webhook writes use the service
-- role key and bypass RLS; RLS is enabled here so the public anon key can't
-- read these tables until you add explicit SELECT policies for an account
-- page (e.g. scoped to the authenticated user's email).

CREATE TABLE IF NOT EXISTS customers (
  customer_id TEXT PRIMARY KEY,        -- Paddle "ctm_..."
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS customers_email_idx ON customers(email);

CREATE TABLE IF NOT EXISTS subscriptions (
  subscription_id TEXT PRIMARY KEY,    -- Paddle "sub_..."
  customer_id TEXT NOT NULL REFERENCES customers(customer_id),
  subscription_status TEXT NOT NULL,   -- active | trialing | past_due | paused | canceled
  price_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  scheduled_change TIMESTAMPTZ,        -- non-null when a pause/cancel is pending
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS subscriptions_customer_id_idx ON subscriptions(customer_id);
CREATE INDEX IF NOT EXISTS subscriptions_status_idx ON subscriptions(subscription_status);

-- Covers both subscription-initiating transactions and one-time
-- microservice purchases (subscription_id is null for the latter).
CREATE TABLE IF NOT EXISTS transactions (
  transaction_id TEXT PRIMARY KEY,     -- Paddle "txn_..."
  customer_id TEXT REFERENCES customers(customer_id),
  subscription_id TEXT REFERENCES subscriptions(subscription_id),
  status TEXT NOT NULL,
  price_id TEXT,
  product_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS transactions_customer_id_idx ON transactions(customer_id);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
-- No policies defined yet: RLS enabled with zero policies denies all access
-- to the anon/authenticated roles by default. The service-role key used by
-- the webhook handler bypasses RLS entirely, so writes still work. Add
-- SELECT policies here once an account page needs to read a user's own rows.
