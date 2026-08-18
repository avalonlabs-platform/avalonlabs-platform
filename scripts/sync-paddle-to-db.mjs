import dotenv from 'dotenv';
import pkg from 'pg';
const { Client } = pkg;

dotenv.config({ path: './scripts/.env.ops' });

const PADDLE_API_KEY = process.env.PADDLE_API_KEY;
const PADDLE_API_BASE_URL = 'https://api.paddle.com';
const connectionString = process.env.SUPABASE_DB_URL;

if (!PADDLE_API_KEY) {
  console.error('FATAL: PADDLE_API_KEY is not defined in scripts/.env.ops');
  process.exit(1);
}
if (!connectionString) {
  console.error('FATAL: SUPABASE_DB_URL is not defined in scripts/.env.ops');
  process.exit(1);
}

const authHeaders = {
  Authorization: `Bearer ${PADDLE_API_KEY}`,
  'Content-Type': 'application/json',
};

/**
 * Page through a Paddle list endpoint and return every item. Paddle's REST
 * API uses cursor pagination: meta.pagination.next is a *complete* URL for
 * the next page (not just a cursor token), and has_more tells us when to
 * stop. See https://developer.paddle.com/api-reference/about/pagination.
 */
async function fetchAllPaddlePages(path) {
  const items = [];
  let url = `${PADDLE_API_BASE_URL}${path}`;

  while (url) {
    const response = await fetch(url, { method: 'GET', headers: authHeaders });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(`Paddle API error [${response.status}] on ${url}: ${JSON.stringify(payload)}`);
    }
    items.push(...(payload.data || []));

    const pagination = payload.meta?.pagination;
    url = pagination?.has_more ? pagination.next : null;
  }

  return items;
}

/**
 * One-time (or occasional, safe-to-rerun) reconciliation: pulls the current
 * state directly from Paddle and upserts it into the Supabase mirror tables
 * (public.customers / public.subscriptions) that src/lib/paddle/process-
 * webhook.ts normally keeps in sync incrementally via webhooks. Use this to
 * backfill history from before the webhook existed, or to recover from a
 * period where webhook delivery was broken/incomplete (see scripts/db-
 * hygiene.mjs's tier-gate check, and the SubscriptionEvent gap fixed in
 * process-webhook.ts, for exactly the kind of drift this repairs).
 *
 * Every write is an idempotent UPSERT keyed on the Paddle resource id, same
 * pattern as the webhook handlers — rerunning this is always safe and just
 * converges the mirror tables back to Paddle's current state.
 */
async function main() {
  console.log('\n==================================================');
  console.log('     PADDLE -> SUPABASE ONE-TIME RECONCILIATION    ');
  console.log('==================================================');
  console.log('Fetching live customers and subscriptions from Paddle...');

  const [customers, subscriptions] = await Promise.all([
    fetchAllPaddlePages('/customers?per_page=200'),
    fetchAllPaddlePages('/subscriptions?per_page=200'),
  ]);

  console.log(`Fetched ${customers.length} customer(s) and ${subscriptions.length} subscription(s) from Paddle.`);

  const client = new Client({ connectionString });
  await client.connect();

  let customersWritten = 0;
  let customersSkipped = 0;
  let subscriptionsWritten = 0;
  let subscriptionsSkipped = 0;

  try {
    await client.query('BEGIN');

    // Customers first — subscriptions.customer_id has a FK to customers, so
    // every referenced customer needs to exist before its subscriptions do.
    for (const customer of customers) {
      const email = customer.email?.trim().toLowerCase();
      if (!email) {
        console.log(`  [SKIP] Customer ${customer.id} has no email on file — customers.email is NOT NULL.`);
        customersSkipped++;
        continue;
      }

      await client.query(
        `INSERT INTO public.customers (customer_id, email, created_at, updated_at)
         VALUES ($1, $2, COALESCE($3, NOW()), NOW())
         ON CONFLICT (customer_id) DO UPDATE
           SET email = EXCLUDED.email,
               updated_at = NOW();`,
        [customer.id, email, customer.created_at ?? null]
      );
      customersWritten++;
    }

    // Then subscriptions, now that every customer_id they reference exists.
    for (const sub of subscriptions) {
      const firstItem = sub.items?.[0];
      const priceId = firstItem?.price?.id ?? null;
      const productId = firstItem?.price?.product_id ?? null;

      if (!priceId || !productId) {
        console.log(`  [SKIP] Subscription ${sub.id} has no price/product on its first item — skipping.`);
        subscriptionsSkipped++;
        continue;
      }

      await client.query(
        `INSERT INTO public.subscriptions
           (subscription_id, customer_id, subscription_status, price_id, product_id, scheduled_change, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, NOW()), NOW())
         ON CONFLICT (subscription_id) DO UPDATE
           SET customer_id = EXCLUDED.customer_id,
               subscription_status = EXCLUDED.subscription_status,
               price_id = EXCLUDED.price_id,
               product_id = EXCLUDED.product_id,
               scheduled_change = EXCLUDED.scheduled_change,
               updated_at = NOW();`,
        [
          sub.id,
          sub.customer_id,
          sub.status,
          priceId,
          productId,
          sub.scheduled_change?.effective_at ?? null,
          sub.created_at ?? null,
        ]
      );
      subscriptionsWritten++;
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }

  console.log('\n--------------------------------------------------');
  console.log(`Customers upserted:      ${customersWritten} (${customersSkipped} skipped — no email)`);
  console.log(`Subscriptions upserted:  ${subscriptionsWritten} (${subscriptionsSkipped} skipped — missing price/product)`);
  console.log('==================================================\n');
  console.log('Run `node scripts/db-hygiene.mjs` to confirm Supabase now matches Paddle.');
}

main().catch((error) => {
  console.error('[Reconciliation Error] Sync failed:', error.message);
  process.exit(1);
});
