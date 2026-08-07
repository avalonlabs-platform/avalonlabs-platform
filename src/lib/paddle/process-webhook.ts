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

type SubscriptionEvent = SubscriptionCreatedEvent | SubscriptionUpdatedEvent | SubscriptionCanceledEvent;
type CustomerEvent = CustomerCreatedEvent | CustomerUpdatedEvent;

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
  const supabase = createInternalClient();
  const sub = event.data;
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
  const supabase = createInternalClient();
  const txn = event.data;
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
