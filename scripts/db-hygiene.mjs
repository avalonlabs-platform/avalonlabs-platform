import dotenv from 'dotenv';
import pkg from 'pg';
const { Client } = pkg;

dotenv.config({ path: './scripts/.env.ops' });

const connectionString = process.env.SUPABASE_DB_URL;

if (!connectionString) {
  console.error('FATAL: SUPABASE_DB_URL is not defined in scripts/.env.ops');
  process.exit(1);
}

const client = new Client({ connectionString });

async function runDatabaseHygieneCheck() {
  try {
    await client.connect();
    console.log('\n==================================================');
    console.log('           SUPABASE DATA INTEGRITY AUDIT          ');
    console.log('==================================================');

    // 1. Total users count
    const totalUsersQuery = 'SELECT COUNT(*) FROM auth.users;';
    const totalUsersResult = await client.query(totalUsersQuery);
    console.log(`Total Registered Users:        ${totalUsersResult.rows[0].count}`);

    // 2. Active subscriptions breakdown
    const subBreakdownQuery = `
      SELECT subscription_status, COUNT(*) AS count
      FROM public.subscriptions
      GROUP BY subscription_status;
    `;
    const subBreakdownResult = await client.query(subBreakdownQuery);
    console.log('\nSubscriptions Breakdown by Status:');
    subBreakdownResult.rows.forEach((row) => {
      console.log(`  - ${row.subscription_status.padEnd(12)}: ${row.count}`);
    });

    // 3. Billed customers with no matching Supabase account. This app has no
    // tier_name/credits columns and no subscriptions.user_id FK — access is
    // gated entirely by matching customers.email to auth.users.email at
    // request time (see src/lib/agent-access.ts). So the real hygiene risk
    // isn't "profile tier vs subscription row", it's "someone is being
    // billed in Paddle but their email never signed up here", which would
    // silently lock a paying customer out of every agent.
    const unlinkedPayingCustomersQuery = `
      SELECT c.customer_id, c.email, s.subscription_status, s.price_id, s.updated_at
      FROM public.customers c
      JOIN public.subscriptions s ON s.customer_id = c.customer_id
      WHERE s.subscription_status IN ('active', 'trialing')
        AND NOT EXISTS (
          SELECT 1 FROM auth.users u WHERE lower(trim(u.email)) = c.email
        );
    `;
    const unlinkedPayingCustomersResult = await client.query(unlinkedPayingCustomersQuery);
    console.log('\nTier-Gate Hygiene Check (billed customers with no matching Supabase account):');
    if (unlinkedPayingCustomersResult.rows.length === 0) {
      console.log('  [PASSED] Every active/trialing Paddle customer has a matching Supabase auth user by email.');
    } else {
      console.log(`  [WARNING] Found ${unlinkedPayingCustomersResult.rows.length} active/trialing customer(s) with no matching Supabase account:`);
      unlinkedPayingCustomersResult.rows.forEach((row) => {
        console.log(`    Customer ID: ${row.customer_id} | Email: ${row.email} | Status: ${row.subscription_status} | Price: ${row.price_id}`);
      });
    }

    console.log('==================================================\n');
  } catch (error) {
    console.error('[DB Hygiene Error] Integrity audit failed:', error.message);
  } finally {
    await client.end();
  }
}

runDatabaseHygieneCheck();