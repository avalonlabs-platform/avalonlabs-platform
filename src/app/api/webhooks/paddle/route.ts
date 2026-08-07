import { getPaddleInstance } from "@/lib/paddle/get-paddle-instance";
import { processEvent } from "@/lib/paddle/process-webhook";

export async function POST(request: Request) {
  const signature = request.headers.get("paddle-signature") ?? "";
  const rawBody = await request.text();
  const secret = process.env.PADDLE_WEBHOOK_SECRET ?? "";

  if (!signature || !rawBody) {
    return Response.json({ error: "Missing signature or body" }, { status: 400 });
  }

  try {
    const paddle = getPaddleInstance();
    // Throws on signature mismatch, expired timestamp, or malformed event —
    // deliberately not split into separate error branches below, since a
    // tampered request and a stale/rotated secret are indistinguishable here
    // and every non-2xx status gets the same retry treatment from Paddle.
    const eventData = await paddle.webhooks.unmarshal(rawBody, secret, signature);

    if (eventData) {
      await processEvent(eventData);
    }

    return Response.json({ received: true });
  } catch (e) {
    console.error("Paddle webhook error:", e);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
