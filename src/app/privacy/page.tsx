import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection, LegalList } from "@/components/legal/legal-page";
import { siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: `Privacy Policy — ${siteConfig.name}`,
  description: `How ${siteConfig.name} collects, uses, and protects personal data, including AI processing and checkout security.`,
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" lastUpdated="August 5, 2026">
      <LegalSection heading="1. Who we are">
        <p>
          {siteConfig.legalEntityName} (&quot;{siteConfig.shortName}&quot;, &quot;we&quot;,
          &quot;us&quot;) is the data controller for personal data processed through the{" "}
          {siteConfig.name} website and Service, unless stated otherwise. This policy explains our
          data practices for individuals, minors (with guardian consent), and business users
          worldwide, and is designed to meet GDPR, UK GDPR, CCPA/CPRA, and other applicable data
          protection standards.
        </p>
      </LegalSection>

      <LegalSection heading="2. What we collect">
        <LegalList
          items={[
            <>
              <strong>Account data:</strong> name, email address, password hash, company name
              (for business accounts), and authentication identifiers.
            </>,
            <>
              <strong>Conversation and usage data:</strong> prompts, messages, and content you
              submit to AI Mentor Agents and Microservices, along with resulting outputs and
              interaction logs, to operate and improve the Service.
            </>,
            <>
              <strong>Payment data:</strong> handled directly by Paddle (see Section 6) — we do
              not receive or store full card numbers.
            </>,
            <>
              <strong>Technical data:</strong> IP address, device/browser type, and cookies (see
              Section 9).
            </>,
            <>
              <strong>Support communications:</strong> messages you send via our contact form or
              to {siteConfig.supportEmail}.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection heading="3. How we use personal data">
        <LegalList
          items={[
            "To provide, operate, and secure the AI Mentor Agents and SaaS Microservices you request.",
            "To process subscriptions and one-time purchases via Paddle and manage your account.",
            "To respond to support and contact form requests.",
            "To monitor, debug, and improve model outputs, reliability, and safety of the Service.",
            "To comply with legal obligations, prevent fraud, and enforce our Terms of Service.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="4. AI-specific data handling">
        <p>
          Content you submit to an AI Mentor Agent (prompts, uploaded files, conversation history)
          is processed by our AI infrastructure — which may include third-party model providers
          acting as our processors under data processing agreements — solely to generate responses
          and operate the Service.
        </p>
        <LegalList
          items={[
            "We do not sell conversation content, and we do not use it to train third-party foundation models without your explicit, separate consent.",
            "We may use de-identified or aggregated interaction data to evaluate and improve AvalonLabs-operated models and safety systems.",
            "Automated AI outputs are not subject to human review before delivery; you may request human support review of a specific interaction by contacting us.",
            "You can request deletion of your conversation history at any time, subject to Section 8 (retention for legal/security purposes).",
          ]}
        />
      </LegalSection>

      <LegalSection heading="5. Minors' data">
        <p>
          Where a minor uses the Service under a parent or guardian&apos;s account as described in
          our <Link href="/terms">Terms of Service</Link>, we collect the minimum data necessary
          to provide the Service, do not knowingly serve targeted advertising to minors, and treat
          the consenting parent or guardian as the account holder and primary contact for privacy
          requests concerning that account. We do not knowingly collect personal data directly
          from children under {siteConfig.minimumAgeWithoutConsent} without such consent; if we
          learn this has occurred we will delete the data promptly.
        </p>
      </LegalSection>

      <LegalSection heading="6. Payments and checkout security">
        <p>
          All purchases are processed by {siteConfig.paddleMerchantName}, our Merchant of Record.
          Paddle collects and processes your payment details (card, PayPal, Apple Pay, Google Pay,
          or IBAN/wire information) directly, under its own PCI DSS-compliant infrastructure and
          privacy policy. We receive only transaction confirmation, order details, and the billing
          contact information necessary to provision your subscription or purchase — we do not
          store full card numbers on our systems.
        </p>
      </LegalSection>

      <LegalSection heading="7. Legal bases for processing (GDPR)">
        <LegalList
          items={[
            "Performance of a contract — to deliver the Service you subscribed to or purchased.",
            "Consent — for optional communications and certain AI training uses.",
            "Legitimate interests — to secure, debug, and improve the Service.",
            "Legal obligation — tax, accounting, and regulatory compliance.",
          ]}
        />
      </LegalSection>

      <LegalSection heading="8. Retention">
        <p>
          We retain personal data for as long as your account is active or as needed to provide
          the Service, comply with legal/tax obligations (including records Paddle requires us to
          retain), resolve disputes, and enforce agreements. Conversation data is retained
          according to your account settings and deleted upon verified deletion requests, subject
          to legal hold requirements.
        </p>
      </LegalSection>

      <LegalSection heading="9. Cookies and tracking">
        <p>
          We use essential cookies to operate the Service (authentication, security) and, where
          you consent, analytics cookies to understand usage. You can control cookies through your
          browser settings.
        </p>
      </LegalSection>

      <LegalSection heading="10. International data transfers">
        <p>
          Where personal data is transferred outside your country (including to the United
          States), we rely on appropriate safeguards such as the EU Standard Contractual Clauses
          and equivalent mechanisms with our processors, including Paddle and our AI and hosting
          infrastructure providers.
        </p>
      </LegalSection>

      <LegalSection heading="11. Your rights">
        <p>
          Subject to applicable law, you (or, for a minor&apos;s account, the consenting parent or
          guardian) may request access, correction, deletion, restriction, portability, or object
          to processing of personal data, and may withdraw consent at any time. You may also lodge
          a complaint with your local data protection authority. To exercise these rights, contact{" "}
          <a href={`mailto:${siteConfig.privacyEmail}`}>{siteConfig.privacyEmail}</a>.
        </p>
      </LegalSection>

      <LegalSection heading="12. Security">
        <p>
          We use industry-standard technical and organizational measures — including encryption in
          transit, access controls, and vendor due diligence — to protect personal data. No system
          is completely secure, and we cannot guarantee absolute security.
        </p>
      </LegalSection>

      <LegalSection heading="13. Changes to this policy">
        <p>
          We may update this Privacy Policy from time to time. Material changes will be notified
          via the Service or by email before they take effect.
        </p>
      </LegalSection>

      <LegalSection heading="14. Contact">
        <p>
          Privacy questions or rights requests:{" "}
          <a href={`mailto:${siteConfig.privacyEmail}`}>{siteConfig.privacyEmail}</a>. General
          support: <a href={`mailto:${siteConfig.supportEmail}`}>{siteConfig.supportEmail}</a>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
