import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventName, type EventEntity } from "@paddle/paddle-node-sdk";

/** Fixtures below are minimal shapes (only the fields the handlers actually
 *  read), not full SDK payloads — cast through `unknown`, not `any`, to
 *  reach the real EventEntity parameter type. */
function asEvent(event: unknown): EventEntity {
  return event as EventEntity;
}

// This module syncs Paddle's billing state into Supabase and is the only
// thing standing between a webhook retry storm and duplicate/drifted
// billing rows. These tests cover the three behaviors most likely to
// silently cost someone money or access if they regress: (1) every
// subscription-lifecycle event still reaches the same handler, (2)
// ensureCustomerHasEmail's three-source priority order (own doc comment
// calls this out as load-bearing), and (3) a Supabase write failure still
// throws so Paddle's at-least-once retry actually retries.
//
// Test fixtures below are intentionally minimal shapes — only the fields
// processEvent's handlers actually read — not full Paddle SDK payloads,
// hence the `as any` casts into processEvent's EventEntity parameter.

const mockSupabase = vi.hoisted(() => ({ from: vi.fn() }));
const mockPaddle = vi.hoisted(() => ({ customers: { get: vi.fn() } }));

vi.mock("@/lib/supabase/server-internal", () => ({
  createInternalClient: () => mockSupabase,
}));
vi.mock("@/lib/paddle/get-paddle-instance", () => ({
  getPaddleInstance: () => mockPaddle,
}));

import { processEvent } from "./process-webhook";

type SelectResult = { data: unknown; error: unknown };

interface MockTable {
  select: (...args: unknown[]) => MockTable;
  eq: (...args: unknown[]) => MockTable;
  maybeSingle: () => Promise<SelectResult>;
  upsert: (...args: unknown[]) => Promise<{ error: unknown }>;
}

function makeTable({
  selectResult = { data: null, error: null } as SelectResult,
  upsertError = null as unknown,
} = {}): MockTable {
  const chain: MockTable = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(() => Promise.resolve(selectResult)),
    upsert: vi.fn(() => Promise.resolve({ error: upsertError })),
  };
  return chain;
}

function setupSupabase(tables: Record<string, ReturnType<typeof makeTable>>) {
  mockSupabase.from.mockImplementation(
    (table: string) => tables[table] ?? makeTable()
  );
}

const subEvent = (overrides: Record<string, unknown> = {}) => ({
  eventType: EventName.SubscriptionCreated,
  data: {
    id: "sub_1",
    customerId: "ctm_1",
    status: "active",
    items: [{ price: { id: "price_1", productId: "prod_1" } }],
    scheduledChange: null,
    customData: null,
    ...overrides,
  },
});

const txnEvent = (overrides: Record<string, unknown> = {}) => ({
  eventType: EventName.TransactionCompleted,
  data: {
    id: "txn_1",
    customerId: "ctm_1",
    subscriptionId: "sub_1",
    status: "completed",
    items: [{ price: { id: "price_1", productId: "prod_1" } }],
    customData: null,
    ...overrides,
  },
});

const customerEvent = (overrides: Record<string, unknown> = {}) => ({
  eventType: EventName.CustomerCreated,
  data: { id: "ctm_1", email: "user@example.com", customData: null, ...overrides },
});

beforeEach(() => {
  vi.clearAllMocks();
});

// Customers row already has an email in every routing test below, so
// ensureCustomerHasEmail short-circuits on step 1 and these tests isolate
// pure event-routing behavior from the email-resolution logic (covered
// separately further down).
const customerHasEmail = () =>
  makeTable({ selectResult: { data: { email: "user@example.com" }, error: null } });

describe("processEvent routing", () => {
  it.each([
    EventName.SubscriptionCreated,
    EventName.SubscriptionUpdated,
    EventName.SubscriptionCanceled,
    EventName.SubscriptionActivated,
    EventName.SubscriptionTrialing,
    EventName.SubscriptionPaused,
    EventName.SubscriptionResumed,
    EventName.SubscriptionPastDue,
    EventName.SubscriptionImported,
  ])("routes %s to the subscriptions upsert", async (eventType) => {
    const subscriptions = makeTable();
    setupSupabase({ customers: customerHasEmail(), subscriptions });

    await processEvent(asEvent({ ...subEvent({ status: "past_due" }), eventType }));

    expect(subscriptions.upsert).toHaveBeenCalledTimes(1);
    expect(subscriptions.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ subscription_id: "sub_1", customer_id: "ctm_1" })
    );
  });

  it("routes TransactionCompleted to the transactions upsert", async () => {
    const transactions = makeTable();
    setupSupabase({ customers: customerHasEmail(), transactions });

    await processEvent(asEvent(txnEvent()));

    expect(transactions.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ transaction_id: "txn_1", subscription_id: "sub_1" })
    );
  });


  it.each([EventName.CustomerCreated, EventName.CustomerUpdated])(
    "routes %s to the customers upsert",
    async (eventType) => {
      const customers = makeTable();
      setupSupabase({ customers });

      await processEvent(asEvent({ ...customerEvent(), eventType }));

      expect(customers.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ customer_id: "ctm_1", email: "user@example.com" })
      );
    }
  );

  it("no-ops on an event type it doesn't act on, without touching Supabase", async () => {
    setupSupabase({});

    await expect(
      processEvent(asEvent({ eventType: "some.unhandled.event", data: {} }))
    ).resolves.toBeUndefined();

    expect(mockSupabase.from).not.toHaveBeenCalled();
  });
});

describe("ensureCustomerHasEmail priority order (via a subscription event)", () => {
  it("1. does nothing further when the customers row already has an email", async () => {
    const customers = customerHasEmail();
    const subscriptions = makeTable();
    setupSupabase({ customers, subscriptions });

    await processEvent(asEvent(subEvent({ customData: { userEmail: "checkout@example.com" } })));

    expect(customers.upsert).not.toHaveBeenCalled();
    expect(mockPaddle.customers.get).not.toHaveBeenCalled();
    expect(subscriptions.upsert).toHaveBeenCalled();
  });

  it("2. backfills from checkout custom_data before calling the Paddle API", async () => {
    const customers = makeTable(); // no existing row/email
    setupSupabase({ customers, subscriptions: makeTable() });

    await processEvent(asEvent(subEvent({ customData: { userEmail: "Checkout@Example.com" } })));

    expect(mockPaddle.customers.get).not.toHaveBeenCalled();
    expect(customers.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ customer_id: "ctm_1", email: "checkout@example.com" })
    );
  });

  it("3. falls back to a live Paddle API fetch as the last resort", async () => {
    const customers = makeTable();
    mockPaddle.customers.get.mockResolvedValue({ email: "Fetched@Example.com" });
    setupSupabase({ customers, subscriptions: makeTable() });

    await processEvent(asEvent(subEvent({ customData: null })));

    expect(mockPaddle.customers.get).toHaveBeenCalledWith("ctm_1");
    expect(customers.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ email: "fetched@example.com" })
    );
  });

  it("skips the customers upsert entirely when no email is available anywhere", async () => {
    const customers = makeTable();
    mockPaddle.customers.get.mockResolvedValue({ email: null });
    const subscriptions = makeTable();
    setupSupabase({ customers, subscriptions });

    await processEvent(asEvent(subEvent({ customData: null })));

    expect(customers.upsert).not.toHaveBeenCalled();
    // The subscription itself still gets written — a missing email here is
    // a data-quality gap to backfill later, not a reason to drop the event.
    expect(subscriptions.upsert).toHaveBeenCalled();
  });
});

describe("write failures propagate (so Paddle's at-least-once delivery retries)", () => {
  it("throws when the subscriptions upsert returns an error", async () => {
    setupSupabase({
      customers: customerHasEmail(),
      subscriptions: makeTable({ upsertError: new Error("db unavailable") }),
    });

    await expect(processEvent(asEvent(subEvent()))).rejects.toThrow("db unavailable");
  });

  it("throws when the transactions upsert returns an error", async () => {
    setupSupabase({
      customers: customerHasEmail(),
      transactions: makeTable({ upsertError: new Error("constraint violation") }),
    });

    await expect(processEvent(asEvent(txnEvent()))).rejects.toThrow("constraint violation");
  });
});
