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

-- ---------------------------------------------------------------------------
-- Freemium credits — one row per Supabase Auth user (see
-- src/app/api/chat/route.ts). `auth.users` is Supabase-managed, so app data
-- lives in this separate `profiles` table keyed 1:1 by id, populated
-- automatically by the trigger below for both OAuth and email/password
-- signups (Supabase Auth inserts into auth.users the same way either way).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  free_credits INTEGER NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users may read their own credit balance (dashboard badge). No INSERT/
-- UPDATE/DELETE policy for anon/authenticated — rows are created by the
-- trigger below and credits are only ever decremented server-side via the
-- service-role client, so a user can never grant themselves more credits
-- by calling the Supabase REST API directly with their own session.
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, free_credits)
  VALUES (NEW.id, 3)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- One-time backfill for accounts that signed up before this table existed.
-- Safe to re-run — ON CONFLICT skips anyone who already has a row.
INSERT INTO public.profiles (id, free_credits)
SELECT id, 3 FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- Atomic, race-safe decrement used by /api/chat after a successful
-- free-credit response: the WHERE guard means two concurrent requests can
-- never both succeed off the last credit, and it returns NULL (rather than
-- going negative) once the balance is already 0.
CREATE OR REPLACE FUNCTION public.decrement_free_credit(user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  remaining INTEGER;
BEGIN
  UPDATE public.profiles
  SET free_credits = free_credits - 1, updated_at = NOW()
  WHERE id = user_id AND free_credits > 0
  RETURNING free_credits INTO remaining;
  RETURN remaining;
END;
$$;
