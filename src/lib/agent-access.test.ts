import { beforeEach, describe, expect, it, vi } from "vitest";

// getAgentAccess is the real, fail-closed gate behind /api/chat — this is
// the function that decides whether a paying customer's request is served
// or blocked. It's mocked at the Supabase-client boundary (not a live DB),
// so these tests exercise the actual decision logic: tier lookup,
// microservice-vs-general-agent branching, and the subscription ->
// standalone-purchase -> free-credit fallback chain.

const mockSupabase = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabase/server-internal", () => ({
  createInternalClient: () => mockSupabase,
}));

// Fixed, test-owned pricing fixtures instead of the real module — the real
// one resolves priceId from process.env.NEXT_PUBLIC_PADDLE_PRICE_*, which
// is unset in a test run and would make every tier's priceId collapse to
// "", making tier lookups ambiguous. Full required fields are included so
// this stays type-compatible with the real PricingTier/MicroserviceProduct
// shapes.
vi.mock("@/constants/pricing-tiers", () => ({
  pricingTiers: [
    {
      name: "Starter", id: "starter", description: "", audience: "",
      features: [], featured: false,
      priceId: { month: "price_starter_month", year: "price_starter_year" },
    },
    {
      name: "Pro", id: "pro", description: "", audience: "",
      features: [], featured: true,
      priceId: { month: "price_pro_month", year: "price_pro_year" },
    },
  ],
  microserviceProducts: [
    {
      name: "SQL Optimizer", description: "", agentId: "sql-optimizer",
      priceId: "price_sql_optimizer",
    },
  ],
}));

import { getAgentAccess } from "./agent-access";

type Result = { data: unknown; error: unknown };

interface QueryChain {
  select: (...args: unknown[]) => QueryChain;
  eq: (...args: unknown[]) => QueryChain;
  order: (...args: unknown[]) => QueryChain;
  limit: (...args: unknown[]) => QueryChain;
  single: () => Promise<Result>;
  maybeSingle: () => Promise<Result>;
}

function makeChain(result: Result): QueryChain {
  const chain: QueryChain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    single: vi.fn(() => Promise.resolve(result)),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
  };
  return chain;
}

/** Wires mockSupabase.from(table) to per-table canned responses. Tables not
 *  passed resolve to { data: null, error: null } — the "nothing found"
 *  case, matching what a real .single()/.maybeSingle() with no match
 *  returns, so a test only needs to specify the tables it cares about. */
function setupSupabase(tables: {
  customers?: Result;
  subscriptions?: Result;
  transactions?: Result;
  profiles?: Result;
}) {
  const empty: Result = { data: null, error: null };
  const builders: Record<string, ReturnType<typeof makeChain>> = {
    customers: makeChain(tables.customers ?? empty),
    subscriptions: makeChain(tables.subscriptions ?? empty),
    transactions: makeChain(tables.transactions ?? empty),
    profiles: makeChain(tables.profiles ?? empty),
  };
  mockSupabase.from.mockImplementation((table: string) => builders[table]);
  return builders;
}

const USER = { id: "user-1", email: "user@example.com" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getAgentAccess", () => {
  it("falls back to free credits when no customer row exists", async () => {
    setupSupabase({ profiles: { data: { free_credits: 2 }, error: null } });

    const access = await getAgentAccess(USER, "sql-optimizer");

    expect(access).toEqual({
      hasActiveSubscription: false,
      subscriptionPriceId: "",
      subscriptionGrantsThisAgent: false,
      hasStandalonePurchase: false,
      freeCredits: 2,
    });
  });

  it("grants a Pro-tier subscription access to a microservice agent, without checking purchases or credits", async () => {
    const { transactions, profiles } = setupSupabase({
      customers: { data: { customer_id: "ctm_1" }, error: null },
      subscriptions: {
        data: { subscription_status: "active", price_id: "price_pro_month" },
        error: null,
      },
    });

    const access = await getAgentAccess(USER, "sql-optimizer");

    expect(access.hasActiveSubscription).toBe(true);
    expect(access.subscriptionGrantsThisAgent).toBe(true);
    expect(transactions.maybeSingle).not.toHaveBeenCalled();
    expect(profiles.maybeSingle).not.toHaveBeenCalled();
  });

  it("trialing counts as active", async () => {
    setupSupabase({
      customers: { data: { customer_id: "ctm_1" }, error: null },
      subscriptions: {
        data: { subscription_status: "trialing", price_id: "price_pro_month" },
        error: null,
      },
    });

    const access = await getAgentAccess(USER, "sql-optimizer");
    expect(access.hasActiveSubscription).toBe(true);
  });
});

describe("getAgentAccess — Starter tier does not include microservices", () => {
  it("falls back to checking a standalone purchase for a microservice agent", async () => {
    const { profiles } = setupSupabase({
      customers: { data: { customer_id: "ctm_1" }, error: null },
      subscriptions: {
        data: { subscription_status: "active", price_id: "price_starter_month" },
        error: null,
      },
      transactions: { data: { transaction_id: "txn_1" }, error: null },
    });

    const access = await getAgentAccess(USER, "sql-optimizer");

    expect(access.subscriptionGrantsThisAgent).toBe(false);
    expect(access.hasStandalonePurchase).toBe(true);
    // Already resolved via purchase — the free-credit fallback should never
    // be consulted for a paying customer.
    expect(profiles.maybeSingle).not.toHaveBeenCalled();
  });

  it("covers a general (non-microservice) agent on Starter without a standalone purchase", async () => {
    setupSupabase({
      customers: { data: { customer_id: "ctm_1" }, error: null },
      subscriptions: {
        data: { subscription_status: "active", price_id: "price_starter_month" },
        error: null,
      },
    });

    const access = await getAgentAccess(USER, "some-general-agent");

    expect(access.subscriptionGrantsThisAgent).toBe(true);
    expect(access.hasStandalonePurchase).toBe(false);
  });

  it("falls through to free credits when Starter doesn't cover the agent and there's no purchase", async () => {
    setupSupabase({
      customers: { data: { customer_id: "ctm_1" }, error: null },
      subscriptions: {
        data: { subscription_status: "active", price_id: "price_starter_month" },
        error: null,
      },
      profiles: { data: { free_credits: 1 }, error: null },
    });

    const access = await getAgentAccess(USER, "sql-optimizer");

    expect(access.subscriptionGrantsThisAgent).toBe(false);
    expect(access.hasStandalonePurchase).toBe(false);
    expect(access.freeCredits).toBe(1);
  });

  it("treats a canceled subscription as inactive and falls through to free credits", async () => {
    setupSupabase({
      customers: { data: { customer_id: "ctm_1" }, error: null },
      subscriptions: {
        data: { subscription_status: "canceled", price_id: "price_pro_month" },
        error: null,
      },
      profiles: { data: { free_credits: 0 }, error: null },
    });

    const access = await getAgentAccess(USER, "sql-optimizer");

    expect(access.hasActiveSubscription).toBe(false);
    expect(access.freeCredits).toBe(0);
  });
});
