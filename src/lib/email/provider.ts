/**
 * Thin outbound-email abstraction shared by /api/contact and the lifecycle
 * nurture sequence (src/lib/email/lifecycle.ts). Extracted from the
 * Resend-specific code that used to live directly in
 * src/app/api/contact/route.ts so both callers go through one place, and so
 * swapping providers (Resend -> Postmark, or vice versa) is a one-file,
 * one-env-var change instead of a find-and-replace across every send site.
 *
 * Scaffolding only, per Revenue Recovery Track B step 3: Resend is fully
 * wired (same RESEND_API_KEY /api/contact already used) since it's already
 * live in this project; PostmarkProvider is a stub that fails loudly until
 * someone actually adds the `postmark` package and a real implementation —
 * intentionally not a silent no-op, so a misconfigured EMAIL_PROVIDER value
 * is caught immediately instead of quietly dropping mail.
 *
 * Sender address: every call site used to hardcode the literal
 * `onboarding@resend.dev` (Resend's shared sandbox domain, which can only
 * deliver to the email address on the Resend account itself — see
 * RESEND_FROM_EMAIL below). buildFromAddress() centralizes that so switching
 * to a verified domain is one env var, not a find-and-replace across
 * lifecycle.ts and contact/route.ts.
 */
import { Resend } from "resend";

/** Sandbox sender — works today with zero setup, but Resend restricts it to
 *  delivering only to the email address tied to the Resend account. Not a
 *  real "from" for mail going to arbitrary recipients (e.g. the Action
 *  onboarding sequence, or contact-form replies to a support address). */
const DEFAULT_FROM_EMAIL = "onboarding@resend.dev";

/**
 * Builds a `"Display Name <address>"` sender string, using the verified
 * domain address from RESEND_FROM_EMAIL when it's set, falling back to
 * Resend's `onboarding@resend.dev` sandbox address otherwise. Every send
 * site should go through this instead of hardcoding an address directly, so
 * verifying a real domain in Resend and setting RESEND_FROM_EMAIL is enough
 * to flip every outbound email over — no code change needed.
 */
export function buildFromAddress(displayName: string): string {
  const address = process.env.RESEND_FROM_EMAIL || DEFAULT_FROM_EMAIL;
  return `${displayName} <${address}>`;
}

export interface SendEmailParams {
  to: string;
  subject: string;
  /** Plain-text body. Every current template (contact form notifications,
   *  lifecycle emails) is plain text — add an optional `html` field here if
   *  a future template needs it. */
  text: string;
  replyTo?: string;
  /**
   * Defer delivery to a future time — used by the lifecycle sequence for
   * Day 2/4/6 sends. Resend accepts either an ISO-8601 timestamp or a
   * natural-language string ("in 2 days"), up to 30 days out (verified
   * against Resend's current scheduling docs, Aug 2026). This scaffolding
   * always passes ISO timestamps computed in lifecycle.ts. Not supported by
   * the PostmarkProvider stub below — Postmark's scheduling story is
   * different (its batch/outbound API doesn't take a per-message future
   * timestamp the way Resend does) and needs its own design if that
   * provider is ever actually wired up.
   */
  scheduledAt?: string;
}

export interface EmailSendResult {
  ok: boolean;
  error?: string;
}

interface EmailProvider {
  send(params: SendEmailParams & { from: string }): Promise<EmailSendResult>;
}

class ResendProvider implements EmailProvider {
  async send(params: SendEmailParams & { from: string }): Promise<EmailSendResult> {
    if (!process.env.RESEND_API_KEY) {
      console.error("email/provider: RESEND_API_KEY is not set — email was not sent.", {
        to: params.to,
        subject: params.subject,
      });
      return { ok: false, error: "RESEND_API_KEY is not set" };
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: params.from,
      to: params.to,
      replyTo: params.replyTo,
      subject: params.subject,
      text: params.text,
      ...(params.scheduledAt && { scheduledAt: params.scheduledAt }),
    });

    if (error) {
      console.error("email/provider: Resend send failed —", error);
      return { ok: false, error: error.message ?? "Resend send failed" };
    }
    return { ok: true };
  }
}

/**
 * Not implemented — placeholder so EMAIL_PROVIDER=postmark fails loudly and
 * immediately (in dev/CI, ideally, not silently in production) rather than
 * pretending to send. To actually wire this up: add the `postmark` package,
 * a POSTMARK_API_KEY env var, and replace this body with a real
 * `new postmark.ServerClient(...).sendEmail(...)` call.
 */
class PostmarkProvider implements EmailProvider {
  async send(): Promise<EmailSendResult> {
    throw new Error(
      "email/provider: EMAIL_PROVIDER=postmark is set but PostmarkProvider is not implemented yet — " +
        "this is scaffolding (Revenue Recovery Track B step 3). Either implement it in " +
        "src/lib/email/provider.ts or unset EMAIL_PROVIDER to fall back to Resend."
    );
  }
}

function getProvider(): EmailProvider {
  const providerName = (process.env.EMAIL_PROVIDER ?? "resend").toLowerCase();
  if (providerName === "postmark") return new PostmarkProvider();
  if (providerName !== "resend") {
    console.error(
      `email/provider: unrecognized EMAIL_PROVIDER "${providerName}" — falling back to Resend.`
    );
  }
  return new ResendProvider();
}

/**
 * Sends one email through whichever provider EMAIL_PROVIDER selects
 * (default: Resend). `from` is required on every call site rather than
 * defaulting here, since the right "From" address differs by use case
 * (contact-form notifications vs. lifecycle nurture mail) and a shared
 * default is an easy way to accidentally send customer-facing mail from an
 * internal-notification address.
 */
export async function sendEmail(params: SendEmailParams & { from: string }): Promise<EmailSendResult> {
  return getProvider().send(params);
}
