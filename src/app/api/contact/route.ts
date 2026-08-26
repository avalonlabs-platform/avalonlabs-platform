import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email/provider";
import { siteConfig } from "@/lib/site-config";

interface ContactPayload {
  name?: string;
  email?: string;
  message?: string;
}

// Best-effort per-IP rate limit, same pattern as src/app/api/demo-chat/route.ts.
// In-memory, so it only holds within a warm serverless instance — a real
// deterrent against casual abuse, not a hard guarantee against a determined
// attacker distributing across cold starts. Slightly tighter than demo-chat's
// limit since every request here costs a real Resend send, not just tokens.
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 5;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) return false;
  entry.count += 1;
  return true;
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: "Too many requests — please wait a few minutes and try again." },
      { status: 429 }
    );
  }

  const body: ContactPayload | null = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { name, email, message } = body;

  if (!name || !email || !message) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  // Goes through the shared src/lib/email/provider.ts abstraction (Revenue
  // Recovery Track B step 3) instead of instantiating Resend directly, so
  // this and the lifecycle nurture sequence (src/lib/email/lifecycle.ts)
  // share one place to swap providers via EMAIL_PROVIDER. Still Resend, same
  // shared unverified-domain sender as before. One deliberate behavior
  // change: a missing RESEND_API_KEY now surfaces as this function's generic
  // 502 "Failed to send message" instead of the previous dedicated 500
  // "Contact form is not configured" — the specific reason is still logged
  // server-side (see provider.ts's own console.error), just no longer
  // distinguished in the HTTP response.
  const result = await sendEmail({
    from: "AvalonLabs Contact Form <onboarding@resend.dev>",
    to: siteConfig.supportEmail,
    replyTo: email,
    subject: `New contact form message from ${name}`,
    text: `From: ${name} <${email}>\n\n${message}`,
  });

  if (!result.ok) {
    console.error("Contact form: send failed —", result.error);
    return NextResponse.json({ error: "Failed to send message." }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
