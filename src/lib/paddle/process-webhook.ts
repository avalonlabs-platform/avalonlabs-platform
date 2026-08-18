import {
  type EventEntity,
  EventName,
  type SubscriptionCreatedEvent,
  type SubscriptionUpdatedEvent,
  type SubscriptionCanceledEvent,
  type SubscriptionActivatedEvent,
  type SubscriptionTrialingEvent,
  type SubscriptionPausedEvent,
  type SubscriptionResumedEvent,
  type SubscriptionPastDueEvent,
  type SubscriptionImportedEvent,
  type TransactionCompletedEvent,
  type CustomerCreatedEvent,
  type CustomerUpdatedEvent,
} from "@paddle/paddle-node-sdk";
import { createInternalClient } from "@/lib/supabase/server-internal";
import { getPaddleInstance } from "@/lib/paddle/get-paddle-instance";
import { normalizeEmail } from "@/lib/normalize-email";

// Paddle's subscription lifecycle fires distinct event types for each status
// transition — trialing -> active goes out as `subscription.activated`, not
// `subscription.updated`, and paused/resumed/past_due/imported are separate
// events too. All of them share the same SubscriptionNotification payload
// shape (id/customerId/status/items/customData/scheduledChange), so every one
// of them needs to reach upsertSubscription or the `subscriptions` mirror
// table silently stops tracking that transition and drifts from Paddle.
type SubscriptionEvent =
  | SubscriptionCreatedEvent
  | SubscriptionUpdatedEvent
  | SubscriptionCanceledEvent
  | SubscriptionActivatedEvent
  | SubscriptionTrialingEvent
  | SubscriptionPausedEvent
  | SubscriptionResumedEvent
  | SubscriptionPastDueEvent
  | SubscriptionImportedEvent;
type CustomerEvent = CustomerCreatedEvent | CustomerUpdatedEvent;

/** custom_data set at checkout time (see pricing-table.tsx / tool-checkout-
 *  buttons.tsx: `Checkout.open({ customData: { userEmail, userId } })`) — the
 *  most direct source of truth, since it's tied to the exact Supabase account
 *  that started checkout rather than whatever Paddle has on file. */
function emailFromCustomData(customData: unknown): string | null {
  if (!customData || typeof customData !== "object") return null;
  const value = (customData as Record<string, unknown>).userEmail;
  return typeof value === "string" ? normalizeEmail(value) : null;
}

/**
 * Paddle doesn't guarantee `customer.created` is delivered (or processed)
 * before `subscription.created` / `transaction.completed` for the same
 * customer, and neither of those payloads reliably carries the customer's
 * email — so inserting a subscription/transaction row can hit the FK
 * constraint on `customers` before a customer row exists, or exist with a
 * null email. Called first in both handlers below, in priority order:
 *
 * 1. A customers row that already has an email — nothing to do.
 * 2. `custom_data.userEmail` attached at checkout — no API call needed.
 * 3. Live Paddle API fetch (`customers.get`) as the last resort.
 */
async function ensureCustomerHasEmail(customerId: string | null, customData?: unknown) {
  if (!customerId) return;

  const supabase = createInternalClient();
  const { data: existing } = await supabase
    .from("customers")
    .select("email")
    .eq("customer_id", customerId)
    .maybeSingle();
  if (existing?.email) return;

  let email = emailFromCustomData(customData);

  if (!email) {
    const paddle = getPaddleInstance();
    const customer = await paddle.customers.get(customerId);
    email = normalizeEmail(customer.email);
  }
  if (!email) return; // nothing to backfill with — leave as-is rather than write another null

  const { error } = await supabase.from("customers").upsert({
    customer_id: customerId,
    email,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

/**
 * Paddle delivers at-least-once with the same event.eventId on every retry,
 * so every handler here is written as an idempotent UPSERT keyed on the
 * Paddle resource id — repeated deliveries converge on the same end state.
 */
export async function processEvent(event: EventEntity) {
  switch (event.eventType) {
    case EventName.SubscriptionCreated:
    case EventName.SubscriptionUpdated:
    case EventName.SubscriptionCanceled:
    case EventName.SubscriptionActivated:
    case EventName.SubscriptionTrialing:
    case EventName.SubscriptionPaused:
    case EventName.SubscriptionResumed:
    case EventName.SubscriptionPastDue:
    case EventName.SubscriptionImported:
      return upsertSubscription(event);
    case EventName.TransactionCompleted:
      return upsertTransaction(event);
    case EventName.CustomerCreated:
    case EventName.CustomerUpdated:
      return upsertCustomer(event);
    default:
      // Subscribed to an event we don't act on yet — no-op, not an error.
      return;
  }
}

async function upsertSubscription(event: SubscriptionEvent) {
  const sub = event.data;
  await ensureCustomerHasEmail(sub.customerId, sub.customData);

  const supabase = createInternalClient();
  const firstItem = sub.items[0];

  const { error } = await supabase.from("subscriptions").upsert({
    subscription_id: sub.id,
    customer_id: sub.customerId,
    subscription_status: sub.status,
    price_id: firstItem?.price?.id ?? "",
    product_id: firstItem?.price?.productId ?? "",
    scheduled_change: sub.scheduledChange?.effectiveAt ?? null,
    updated_at: new Date().toISOString(),
  });

  if (error) throw error;
}

async function upsertTransaction(event: TransactionCompletedEvent) {
  const txn = event.data;
  await ensureCustomerHasEmail(txn.customerId, txn.customData);

  const supabase = createInternalClient();
  const firstItem = txn.items[0];

  const { error } = await supabase.from("transactions").upsert({
    transaction_id: txn.id,
    customer_id: txn.customerId,
    subscription_id: txn.subscriptionId ?? null,
    status: txn.status,
    price_id: firstItem?.price?.id ?? null,
    product_id: firstItem?.price?.productId ?? null,
    updated_at: new Date().toISOString(),
  });

  if (error) throw error;
}

async function upsertCustomer(event: CustomerEvent) {
  // Priority: the payload's own email, then custom_data (covers the same
  // out-of-order/replay cases as ensureCustomerHasEmail), then a live fetch.
  let email = normalizeEmail(event.data.email) ?? emailFromCustomData(event.data.customData);

  if (!email) {
    const paddle = getPaddleInstance();
    const customer = await paddle.customers.get(event.data.id);
    email = normalizeEmail(customer.email);
  }
  if (!email) return; // still nothing usable — skip rather than write a null

  const supabase = createInternalClient();
  const { error } = await supabase.from("customers").upsert({
    customer_id: event.data.id,
    email,
    updated_at: new Date().toISOString(),
  });

  if (error) throw error;
}
