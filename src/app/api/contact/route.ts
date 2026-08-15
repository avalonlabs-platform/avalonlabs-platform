import { NextResponse } from "next/server";
import { Resend } from "resend";
import { siteConfig } from "@/lib/site-config";

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

  if (!process.env.RESEND_API_KEY) {
    console.error("Contact form: RESEND_API_KEY is not set — submission was not delivered.", {
      name,
      email,
    });
    return NextResponse.json({ error: "Contact form is not configured." }, { status: 500 });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    // Unverified custom domain yet, so send from Resend's shared test sender —
    // works for delivery to the account owner's own verified address.
    from: "AvalonLabs Contact Form <onboarding@resend.dev>",
    to: siteConfig.supportEmail,
    replyTo: email,
    subject: `New contact form message from ${name}`,
    text: `From: ${name} <${email}>\n\n${message}`,
  });

  if (error) {
    console.error("Contact form: Resend send failed —", error);
    return NextResponse.json({ error: "Failed to send message." }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
