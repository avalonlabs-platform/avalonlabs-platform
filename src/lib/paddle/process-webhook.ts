import {
  type EventEntity,
  EventName,
  type SubscriptionCreatedEvent,
  type SubscriptionUpdatedEvent,
  type SubscriptionCanceledEvent,
  type TransactionCompletedEvent,
  type CustomerCreatedEvent,
  type CustomerUpdatedEvent,
} from "@paddle/paddle-node-sdk";
import { createInternalClient } from "@/lib/supabase/server-internal";
import { getPaddleInstance } from "@/lib/paddle/get-paddle-instance";

type SubscriptionEvent = SubscriptionCreatedEvent | SubscriptionUpdatedEvent | SubscriptionCanceledEvent;
type CustomerEvent = CustomerCreatedEvent | CustomerUpdatedEvent;

/**
 * Paddle doesn't guarantee `customer.created` is delivered (or processed)
 * before `subscription.created` / `transaction.completed` for the same
 * customer — and neither of those payloads carries the customer's email —
 * so inserting a subscription/transaction row can hit the FK constraint on
 * `customers` before a customer row exists. Called first in both handlers
 * below: if the row is already there (the common case), this is a single
 * cheap SELECT; only missing customers cost a Paddle API round-trip.
 */
async function ensureCustomerExists(customerId: string | null) {
  if (!customerId) return;

  const supabase = createInternalClient();
  const { data: existing } = await supabase
    .from("customers")
    .select("customer_id")
    .eq("customer_id", customerId)
    .maybeSingle();
  if (existing) return;

  const paddle = getPaddleInstance();
  const customer = await paddle.customers.get(customerId);

  const { error } = await supabase.from("customers").upsert({
    customer_id: customer.id,
    email: customer.email,
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
  await ensureCustomerExists(sub.customerId);

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
  await ensureCustomerExists(txn.customerId);

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
  const supabase = createInternalClient();

  const { error } = await supabase.from("customers").upsert({
    customer_id: event.data.id,
    email: event.data.email,
    updated_at: new Date().toISOString(),
  });

  if (error) throw error;
}
