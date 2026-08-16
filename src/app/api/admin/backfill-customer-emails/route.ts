import { createInternalClient } from "@/lib/supabase/server-internal";
import { getPaddleInstance } from "@/lib/paddle/get-paddle-instance";

/**
 * TEMPORARY one-time repair route — remove after use. Backfills email for
 * every `customers` row left with a NULL/empty email by the webhook FK bug
 * (see process-webhook.ts ensureCustomerHasEmail), fixing every affected
 * account in one pass instead of one manual SQL statement per user.
 *
 * Protected by reusing PADDLE_WEBHOOK_SECRET as a shared secret — good
 * enough for a route that only exists for a few minutes.
 */
export async function POST(request: Request) {
  const secret = new URL(request.url).searchParams.get("secret");
  if (!secret || secret !== process.env.PADDLE_WEBHOOK_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createInternalClient();
  const { data: rows, error } = await supabase
    .from("customers")
    .select("customer_id, email")
    .or("email.is.null,email.eq.");

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const paddle = getPaddleInstance();
  const results: Array<{ customer_id: string; status: string; email?: string; message?: string }> = [];

  for (const row of rows ?? []) {
    try {
      const customer = await paddle.customers.get(row.customer_id);
      if (!customer.email) {
        results.push({ customer_id: row.customer_id, status: "no-email-from-paddle" });
        continue;
      }
      const { error: updateError } = await supabase
        .from("customers")
        .update({ email: customer.email, updated_at: new Date().toISOString() })
        .eq("customer_id", row.customer_id);
      results.push({
        customer_id: row.customer_id,
        status: updateError ? "update-failed" : "fixed",
        email: customer.email,
        message: updateError?.message,
      });
    } catch (e) {
      results.push({ customer_id: row.customer_id, status: "paddle-fetch-failed", message: String(e) });
    }
  }

  return Response.json({ affectedRowsFound: rows?.length ?? 0, results });
}
