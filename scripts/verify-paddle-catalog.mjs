// One-off verification script — checks that the pri_/pro_ IDs currently wired
// into .env.local actually exist in the live Paddle catalog and reports their
// name/amount/currency/tax category. Does not create or modify anything.
// Run: PADDLE_API_KEY=<live key> node scripts/verify-paddle-catalog.mjs
import { Environment, Paddle } from "@paddle/paddle-node-sdk";

const apiKey = process.env.PADDLE_API_KEY;
if (!apiKey) {
  console.error("Set PADDLE_API_KEY in the environment before running this script.");
  process.exit(1);
}

const paddle = new Paddle(apiKey, { environment: Environment.production });

const expected = {
  NEXT_PUBLIC_PADDLE_PRICE_STARTER_MONTH: "pri_01kz76zmahn4ttj7eeppmaxk1t",
  NEXT_PUBLIC_PADDLE_PRICE_STARTER_YEAR: "pri_01kz76zmg0bp05m8eh02hqb7xg",
  NEXT_PUBLIC_PADDLE_PRICE_PRO_MONTH: "pri_01kz76zmwv124hwmbzxjrsxfb4",
  NEXT_PUBLIC_PADDLE_PRICE_PRO_YEAR: "pri_01kz76zn261phmewc2j7ga6j0n",
  NEXT_PUBLIC_PADDLE_PRICE_ADVANCED_MONTH: "pri_01kz76znekqqzqxsh6teeh577k",
  NEXT_PUBLIC_PADDLE_PRICE_ADVANCED_YEAR: "pri_01kz76znktby973wxyf4e6xazs",
  NEXT_PUBLIC_PADDLE_PRICE_MS_PLAN_REVIEW: "pri_01kzbh267jtf7g3wtxn5fckawb",
  NEXT_PUBLIC_PADDLE_PRICE_MS_CONTRACT: "pri_01kzbh9r2gw4502kb9bjmjc46x",
};

async function main() {
  const foundPrices = new Map();
  const products = [];

  let productsIter = paddle.products.list({ include: ["prices"] });
  for await (const product of productsIter) {
    products.push({
      id: product.id,
      name: product.name,
      status: product.status,
      taxCategory: product.taxCategory,
    });
    for (const price of product.prices ?? []) {
      foundPrices.set(price.id, {
        productName: product.name,
        productStatus: product.status,
        description: price.description,
        amount: price.unitPrice?.amount,
        currency: price.unitPrice?.currencyCode,
        billingCycle: price.billingCycle
          ? `${price.billingCycle.frequency}/${price.billingCycle.interval}`
          : "one-time",
        status: price.status,
      });
    }
  }

  console.log(`\nLive products found: ${products.length}`);
  for (const p of products) {
    console.log(`  - ${p.name} (${p.id}) [${p.status}, tax: ${p.taxCategory}]`);
  }

  console.log(`\nChecking ${Object.keys(expected).length} configured price IDs against live catalog:\n`);
  for (const [envVar, priceId] of Object.entries(expected)) {
    const match = foundPrices.get(priceId);
    if (!match) {
      console.log(`  MISSING  ${envVar} = ${priceId}  <-- not found in live catalog`);
    } else {
      console.log(
        `  OK       ${envVar} = ${priceId}  -> "${match.productName}" / "${match.description}" ` +
          `${match.amount} ${match.currency} (${match.billingCycle}) [product: ${match.productStatus}, price: ${match.status}]`
      );
    }
  }
  console.log("");
}

main().catch((e) => {
  console.error("Verification failed:", e?.message ?? e);
  process.exit(1);
});
