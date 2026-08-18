import dotenv from 'dotenv';
dotenv.config({ path: './scripts/.env.ops' });

const PADDLE_API_KEY = process.env.PADDLE_API_KEY;
const PADDLE_API_BASE_URL = 'https://api.paddle.com';

if (!PADDLE_API_KEY) {
  console.error('FATAL: PADDLE_API_KEY is not defined in scripts/.env.ops');
  process.exit(1);
}

const authHeaders = {
  'Authorization': `Bearer ${PADDLE_API_KEY}`,
  'Content-Type': 'application/json',
};

/**
 * Fetch and summarize active recurring subscriptions.
 */
async function inspectSubscriptions() {
  try {
    const response = await fetch(`${PADDLE_API_BASE_URL}/subscriptions`, {
      method: 'GET',
      headers: authHeaders,
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(`Paddle API responded with status ${response.status}: ${JSON.stringify(payload)}`);
    }

    const subscriptions = payload.data || [];
    const activeSubs = subscriptions.filter(
      (sub) => sub.status === 'active' || sub.status === 'trialing'
    );

    console.log('\n==================================================');
    console.log('             PADDLE SUBSCRIPTION OVERVIEW          ');
    console.log('==================================================');
    console.log(`Total Subscriptions Registered: ${subscriptions.length}`);
    console.log(`Total Active / In-Trial:         ${activeSubs.length}`);
    console.log('--------------------------------------------------');

    subscriptions.forEach((sub, index) => {
      const billingCycle = sub.billing_cycle ? `${sub.billing_cycle.frequency} ${sub.billing_cycle.interval}` : 'N/A';
      console.log(`[#${index + 1}] ID: ${sub.id}`);
      console.log(`     Customer ID:  ${sub.customer_id}`);
      console.log(`     Status:       ${sub.status.toUpperCase()}`);
      console.log(`     Billing Cycle: ${billingCycle}`);
      console.log(`     Next Billed:  ${sub.next_billed_at || 'None'}`);
      console.log(`     Created At:   ${sub.created_at}`);
      console.log('--------------------------------------------------');
    });
  } catch (error) {
    console.error('[FinOps Error] Failed to fetch subscriptions:', error.message);
  }
}

/**
 * Fetch recent transactions and revenue details.
 */
async function inspectTransactions() {
  try {
    const response = await fetch(`${PADDLE_API_BASE_URL}/transactions?per_page=15`, {
      method: 'GET',
      headers: authHeaders,
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(`Paddle API responded with status ${response.status}: ${JSON.stringify(payload)}`);
    }

    const transactions = payload.data || [];

    console.log('\n==================================================');
    console.log('              RECENT PADDLE TRANSACTIONS          ');
    console.log('==================================================');
    console.log(`Total Records Returned: ${transactions.length}`);
    console.log('--------------------------------------------------');

    transactions.forEach((tx, index) => {
      const amount = tx.details?.totals?.total ? (tx.details.totals.total / 100).toFixed(2) : '0.00';
      const currency = tx.currency_code || 'USD';
      console.log(`[#${index + 1}] ID: ${tx.id}`);
      console.log(`     Status:      ${tx.status.toUpperCase()}`);
      console.log(`     Total:       ${amount} ${currency}`);
      console.log(`     Origin:      ${tx.origin}`);
      console.log(`     Created:     ${tx.created_at}`);
      console.log('--------------------------------------------------');
    });
  } catch (error) {
    console.error('[FinOps Error] Failed to fetch transactions:', error.message);
  }
}

/**
 * Execute CLI commands based on arguments.
 */
const targetCommand = process.argv[2] || 'subs';

switch (targetCommand) {
  case 'subs':
    inspectSubscriptions();
    break;
  case 'transactions':
    inspectTransactions();
    break;
  default:
    console.log(`Unknown command: "${targetCommand}". Supported commands: "subs", "transactions"`);
    break;
}