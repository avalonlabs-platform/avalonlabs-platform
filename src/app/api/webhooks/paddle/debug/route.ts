import { createHmac } from "node:crypto";

// TEMPORARY diagnostic route — reports presence/length/fingerprint of the
// Paddle/Supabase env vars the webhook handler depends on, without ever
// exposing their values. Delete once the webhook 500 is root-caused.
function fingerprint(value: string | undefined): string | null {
  if (!value) return null;
  return createHmac("sha256", "diag-fingerprint-salt").update(value).digest("hex").slice(0, 12);
}

export async function GET() {
  return Response.json({
    PADDLE_API_KEY: {
      present: !!process.env.PADDLE_API_KEY,
      length: process.env.PADDLE_API_KEY?.length ?? 0,
      fingerprint: fingerprint(process.env.PADDLE_API_KEY),
    },
    PADDLE_WEBHOOK_SECRET: {
      present: !!process.env.PADDLE_WEBHOOK_SECRET,
      length: process.env.PADDLE_WEBHOOK_SECRET?.length ?? 0,
      fingerprint: fingerprint(process.env.PADDLE_WEBHOOK_SECRET),
    },
    SUPABASE_SERVICE_ROLE_KEY: {
      present: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      length: process.env.SUPABASE_SERVICE_ROLE_KEY?.length ?? 0,
    },
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? null,
    NEXT_PUBLIC_PADDLE_ENV: process.env.NEXT_PUBLIC_PADDLE_ENV ?? null,
    vercelEnv: process.env.VERCEL_ENV ?? null,
    gitCommitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
  });
}
