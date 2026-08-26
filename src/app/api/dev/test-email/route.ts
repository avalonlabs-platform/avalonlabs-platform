import { NextResponse } from "next/server";
import { sendEmail, buildFromAddress } from "@/lib/email/provider";

/**
 * TEMPORARY dev-only route — Resend integration smoke test.
 *
 * Purpose: confirm RESEND_API_KEY is valid and mail actually delivers,
 * without going anywhere near scheduleActionOnboardingSequence /
 * scheduleLifecycleSequence (both fire multiple emails, one of them
 * immediately, with no cancellation path once started — see the
 * dedupe/cancellation gap noted in lifecycle.ts). This route sends exactly
 * one email, right now, and nothing else.
 *
 * Before RESEND_FROM_EMAIL points at a verified domain, Resend's sandbox
 * sender (`onboarding@resend.dev`) can only deliver to the email address
 * on the Resend account itself — so `to` must be that address for this to
 * succeed pre-verification. Once a domain is verified and RESEND_FROM_EMAIL
 * is set, `to` can be any address, so this same route re-confirms the new
 * sender works too.
 *
 * Blocked outside development on purpose: this is an unauthenticated route
 * that triggers a real Resend send, which is a bad thing to leave reachable
 * in production (spam-relay surface, quota burn). Delete this file once the
 * domain migration is verified — it has done its job at that point.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const to = new URL(request.url).searchParams.get("to");
  if (!to || !EMAIL_PATTERN.test(to)) {
    return NextResponse.json(
      { error: "Pass a recipient: /api/dev/test-email?to=you@example.com" },
      { status: 400 }
    );
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json(
      { error: "RESEND_API_KEY is not set in .env.local" },
      { status: 500 }
    );
  }

  const from = buildFromAddress("AvalonLabs Dev Test");
  const usingVerifiedDomain = Boolean(process.env.RESEND_FROM_EMAIL);

  const result = await sendEmail({
    from,
    to,
    subject: "AvalonLabs — Resend test email",
    text:
      `This is a one-off test send from /api/dev/test-email.\n\n` +
      `Sender used: ${from}\n` +
      `RESEND_FROM_EMAIL set: ${usingVerifiedDomain ? "yes (verified domain)" : "no (using Resend's onboarding@resend.dev sandbox — only deliverable to your own Resend account email)"}\n\n` +
      `If this arrived, RESEND_API_KEY is valid and delivery through this sender is working.`,
  });

  if (!result.ok) {
    console.error("dev/test-email: send failed —", result.error);
    return NextResponse.json({ ok: false, from, error: result.error }, { status: 502 });
  }

  return NextResponse.json({ ok: true, from, usingVerifiedDomain, to });
}
