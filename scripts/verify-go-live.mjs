import dotenv from 'dotenv';
import { readFileSync } from 'fs';

// Ops credentials (Paddle, Vercel) live here — same convention as every
// other scripts/*.mjs controller.
dotenv.config({ path: './scripts/.env.ops' });
// Price env vars (NEXT_PUBLIC_PADDLE_PRICE_*) live in the app's own env
// file, not .env.ops — loaded without `override`, so anything already set
// (e.g. by a CI environment) wins over what's in the file.
dotenv.config({ path: './.env.local' });

const PADDLE_API_KEY = process.env.PADDLE_API_KEY;
const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const PADDLE_API_BASE_URL = 'https://api.paddle.com';
const VERCEL_API_BASE_URL = 'https://api.vercel.com';
const VERCEL_PROJECT_NAME = 'avalonlabs-platform';
const PRODUCTION_URL = 'https://avalonlabs-platform.vercel.app';

const REQUIRED_PRODUCTION_ENV_VARS = [
  'PADDLE_API_KEY',
  'PADDLE_WEBHOOK_SECRET',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ANTHROPIC_API_KEY',
];

const MANDATORY_MERCHANT_PATHS = ['/terms', '/privacy', '/refund'];

let failures = 0;
let warnings = 0;

function pass(message) {
  console.log(`  [PASS] ${message}`);
}
function fail(message) {
  console.log(`  [FAIL] ${message}`);
  failures++;
}
function warn(message) {
  console.log(`  [WARN] ${message}`);
  warnings++;
}

async function fetchAllPaddlePages(path) {
  const items = [];
  let url = `${PADDLE_API_BASE_URL}${path}`;
  while (url) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${PADDLE_API_KEY}`, 'Content-Type': 'application/json' },
    });
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

/** 1. Every NEXT_PUBLIC_PADDLE_PRICE_* configured locally must exist, and be
 *  active, in the live Paddle catalog — mirrors scripts/verify-paddle-
 *  catalog.mjs but reads the expected set dynamically from .env.local
 *  instead of a hardcoded list, so it can't silently drift from what's
 *  actually configured. */
async function checkPricingCatalog() {
  console.log('\n1. Pricing tier catalog (local config vs. live Paddle catalog)');

  if (!PADDLE_API_KEY) {
    fail('PADDLE_API_KEY not set (scripts/.env.ops) — cannot check the catalog.');
    return;
  }

  const expected = Object.entries(process.env).filter(([key]) =>
    key.startsWith('NEXT_PUBLIC_PADDLE_PRICE_')
  );
  if (expected.length === 0) {
    fail('No NEXT_PUBLIC_PADDLE_PRICE_* variables found in .env.local — pricing table would ship with empty price IDs.');
    return;
  }

  let products;
  try {
    products = await fetchAllPaddlePages('/products?include=prices&per_page=200');
  } catch (error) {
    fail(`Could not reach Paddle API: ${error.message}`);
    return;
  }

  const livePrices = new Map();
  for (const product of products) {
    for (const price of product.prices ?? []) {
      livePrices.set(price.id, { productStatus: product.status, priceStatus: price.status });
    }
  }

  for (const [envVar, priceId] of expected) {
    if (!priceId) {
      fail(`${envVar} is set but empty.`);
      continue;
    }
    const match = livePrices.get(priceId);
    if (!match) {
      fail(`${envVar} = ${priceId} — not found in the live Paddle catalog.`);
    } else if (match.productStatus !== 'active' || match.priceStatus !== 'active') {
      warn(`${envVar} = ${priceId} — found, but product is "${match.productStatus}" / price is "${match.priceStatus}" (expected both "active").`);
    } else {
      pass(`${envVar} = ${priceId} — active in the live catalog.`);
    }
  }
}

/** 2. Confirms required secrets are actually configured on the deployed
 *  Vercel project — not just present in a local .env file, which tells you
 *  nothing about what production is actually running with. Uses the env
 *  list endpoint, which returns key/target/type metadata but never the
 *  decrypted value for sensitive vars — a presence check, not a leak. */
async function checkProductionEnvVars() {
  console.log('\n2. Required secrets configured on the deployed Vercel project');

  if (!VERCEL_TOKEN) {
    fail('VERCEL_TOKEN not set (scripts/.env.ops) — cannot check production env vars.');
    return;
  }

  let payload;
  try {
    const response = await fetch(
      `${VERCEL_API_BASE_URL}/v9/projects/${VERCEL_PROJECT_NAME}/env`,
      { headers: { Authorization: `Bearer ${VERCEL_TOKEN}` } }
    );
    payload = await response.json();
    if (!response.ok) {
      throw new Error(`Vercel API error [${response.status}]: ${JSON.stringify(payload)}`);
    }
  } catch (error) {
    fail(`Could not reach Vercel API: ${error.message}`);
    return;
  }

  const envVars = payload.envs ?? [];
  for (const name of REQUIRED_PRODUCTION_ENV_VARS) {
    const entries = envVars.filter((e) => e.key === name);
    const inProduction = entries.some((e) => (e.target ?? []).includes('production'));
    if (entries.length === 0) {
      fail(`${name} is not configured on this Vercel project at all.`);
    } else if (!inProduction) {
      fail(`${name} is configured, but not targeting "production" (targets: ${entries.flatMap((e) => e.target ?? []).join(', ') || 'none'}).`);
    } else {
      pass(`${name} is configured for production.`);
    }
  }
}

/** Pulls the currently-configured legal entity name and support email
 *  straight out of src/lib/site-config.ts (a plain `as const` object, so a
 *  simple field regex is reliable) instead of guessing at what "looks like
 *  a placeholder" — a generic bracket/regex heuristic would false-positive
 *  constantly on a real Next.js page, since hydration data embedded in
 *  <script> tags is full of legitimate JSON arrays. Checking that the live
 *  page actually contains today's configured values is both more precise
 *  and more meaningful: it catches config *and* deployment drift in one
 *  check, not just placeholder-shaped text. */
function readSiteConfigField(fieldName) {
  const source = readFileSync('./src/lib/site-config.ts', 'utf-8');
  const match = source.match(new RegExp(`${fieldName}:\\s*"([^"]+)"`));
  return match ? match[1] : null;
}

/** 3. Live-fetches the production site and each mandatory legal page —
 *  confirms TLS actually works (not just that the URL starts with
 *  "https://"), that each page responds, and that it reflects the entity
 *  name/support email currently configured in site-config.ts rather than a
 *  stale build or the pre-launch example.com placeholder domain. */
async function checkMerchantUrls() {
  console.log('\n3. SSL and mandatory merchant pages (live fetch)');

  if (!PRODUCTION_URL.startsWith('https://')) {
    fail(`Production URL "${PRODUCTION_URL}" is not https.`);
  } else {
    try {
      const response = await fetch(PRODUCTION_URL);
      pass(`${PRODUCTION_URL} resolves over TLS (HTTP ${response.status}).`);
    } catch (error) {
      fail(`Could not reach ${PRODUCTION_URL} over HTTPS: ${error.message}`);
      return;
    }
  }

  let legalEntityName = null;
  let supportEmail = null;
  try {
    legalEntityName = readSiteConfigField('legalEntityName');
    supportEmail = readSiteConfigField('supportEmail');
    if (!legalEntityName || !supportEmail) {
      warn('Could not parse legalEntityName/supportEmail out of src/lib/site-config.ts — skipping content checks below.');
    }
  } catch (error) {
    warn(`Could not read src/lib/site-config.ts (${error.message}) — skipping content checks below.`);
  }

  for (const path of MANDATORY_MERCHANT_PATHS) {
    const url = `${PRODUCTION_URL}${path}`;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        fail(`${path} returned HTTP ${response.status}.`);
        continue;
      }
      const html = await response.text();
      if (/@.*\.example\b/i.test(html)) {
        fail(`${path} still references an "*.example" placeholder domain.`);
      } else if (legalEntityName && !html.includes(legalEntityName)) {
        fail(`${path} responded, but doesn't contain the configured legal entity name ("${legalEntityName}") — check for a stale deployment.`);
      } else {
        pass(`${path} responds (HTTP 200) and reflects the currently configured entity name.`);
      }
    } catch (error) {
      fail(`${path} — request failed: ${error.message}`);
    }
  }

  // No standalone /contact route by design — support contact lives on the
  // homepage (footer + "#contact" section). Check for the configured
  // support email's mailto: link rather than a path that was never meant
  // to exist.
  try {
    const response = await fetch(PRODUCTION_URL);
    const html = await response.text();
    if (supportEmail && html.includes(`mailto:${supportEmail}`)) {
      pass(`Homepage exposes a mailto: link for the configured support email (${supportEmail}).`);
    } else if (/mailto:/.test(html)) {
      warn('Homepage has a mailto: link, but not one matching the currently configured supportEmail — check for a stale deployment.');
    } else {
      fail('Homepage has no mailto: support contact link.');
    }
  } catch (error) {
    fail(`Could not check homepage for a support contact link: ${error.message}`);
  }
}

async function main() {
  console.log('\n==================================================');
  console.log('           PADDLE GO-LIVE READINESS CHECK          ');
  console.log('==================================================');

  await checkPricingCatalog();
  await checkProductionEnvVars();
  await checkMerchantUrls();

  console.log('\n==================================================');
  if (failures > 0) {
    console.log(`RESULT: ${failures} failing check(s), ${warnings} warning(s) — not ready to go live.`);
  } else if (warnings > 0) {
    console.log(`RESULT: All checks passed, but ${warnings} warning(s) worth a look before going live.`);
  } else {
    console.log('RESULT: All checks passed.');
  }
  console.log('==================================================\n');

  process.exit(failures > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('[Go-Live Check Error]', error.message);
  process.exit(1);
});
