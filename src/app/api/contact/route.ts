import { NextResponse } from "next/server";

interface ContactPayload {
  name?: string;
  email?: string;
  message?: string;
}

export async function POST(request: Request) {
  const body: ContactPayload = await request.json();
  const { name, email, message } = body;

  if (!name || !email || !message) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  // TODO: wire up an email/notification provider (e.g. Resend, Postmark) or
  // insert into Supabase here. Logged for now so submissions aren't silently lost.
  console.info("Contact form submission", { name, email, message });

  return NextResponse.json({ ok: true });
}
