import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection, LegalList } from "@/components/legal/legal-page";
import { siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: `Refund & Cancellation Policy — ${siteConfig.name}`,
  description: `Refund windows and cancellation terms for ${siteConfig.name} subscriptions and one-time SaaS Microservices.`,
};

export default function RefundPolicyPage() {
  return (
    <LegalPage title="Refund & Cancellation Policy" lastUpdated="August 5, 2026">
      <LegalSection heading="1. Overview">
        <p>
          All purchases on {siteConfig.name} are processed by {siteConfig.paddleMerchantName}, our
          reseller and Merchant of Record. Paddle handles billing, invoicing, and refund
          processing on our behalf. This policy explains when refunds are available and how to
          request one; it works together with{" "}
          <a href="https://www.paddle.com/legal/checkout-buyer-terms" target="_blank" rel="noopener noreferrer">
            Paddle&apos;s Buyer Terms
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection heading="2. Subscription plans">
        <LegalList
          items={[
            "First-time subscribers may request a full refund within 14 days of the initial charge for any plan, no questions asked.",
            "After the initial 14-day window, subscription charges for the current billing period are non-refundable, except as required by applicable law or at our discretion for verified service failures.",
            "You may cancel your subscription at any time. Cancellation stops future renewals; you retain access through the end of the billing period you already paid for. We do not provide prorated refunds for the unused portion of a billing period, except where required by law.",
            "Switching between plans takes effect based on the option you choose at checkout (immediate or at renewal); any applicable proration is calculated and disclosed by Paddle at the time of change.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="3. One-time SaaS Microservices">
        <LegalList
          items={[
            "If a one-time microservice has not yet been delivered or the AI Agent has not yet generated the requested output, you may request a full refund at any time before delivery.",
            "Once the AI Agent has generated the requested output (e.g., a completed document, report, or file), the purchase is non-refundable, except where the deliverable was materially defective, was not delivered due to a technical failure on our side, or where required by applicable consumer law.",
            "Duplicate charges or verified billing errors are always eligible for a full refund.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="4. Statutory withdrawal rights (EU/UK/other consumers)">
        <p>
          If you are a consumer in the EU, UK, or another jurisdiction granting a statutory right
          of withdrawal for digital purchases, you may have a right to withdraw within 14 days of
          purchase. Because AI Agent outputs and Microservice deliverables are digital
          content delivered immediately upon your request, you acknowledge and consent that
          immediate access/delivery may cause you to lose this withdrawal right once performance
          has begun, to the extent permitted by local law. Nothing in this section limits
          non-waivable statutory rights.
        </p>
      </LegalSection>

      <LegalSection heading="5. How to request a refund or cancel">
        <p>
          To cancel a subscription, use the account/billing management link in your Paddle receipt
          email, or contact us directly. To request a refund, email{" "}
          <a href={`mailto:${siteConfig.supportEmail}`}>{siteConfig.supportEmail}</a> with your
          order/transaction ID (found in your Paddle receipt) and the reason for your request. We
          aim to respond within 2 business days; approved refunds are issued by Paddle to your
          original payment method and may take 5–10 business days to appear depending on your
          bank or payment provider.
        </p>
      </LegalSection>

      <LegalSection heading="6. Chargebacks">
        <p>
          If you believe you were charged in error, please contact us before filing a chargeback
          with your bank or card issuer — most billing issues can be resolved faster and more
          reliably by working directly with us or Paddle.
        </p>
      </LegalSection>

      <LegalSection heading="7. Enterprise and custom agreements">
        <p>
          Enterprise plans purchased under a separately negotiated order form or contract are
          governed by the refund and cancellation terms stated in that agreement, which take
          precedence over this policy where they conflict.
        </p>
      </LegalSection>

      <LegalSection heading="8. Changes to this policy">
        <p>
          We may update this policy from time to time; the version in effect at the time of your
          purchase applies to that purchase. See also our{" "}
          <Link href="/terms">Terms of Service</Link> and <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </LegalSection>

      <LegalSection heading="9. Contact">
        <p>
          Questions about billing or refunds:{" "}
          <a href={`mailto:${siteConfig.supportEmail}`}>{siteConfig.supportEmail}</a>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
