import { Hero } from "@/components/home/hero";
import { ActionCalloutSection } from "@/components/home/action-callout-section";
import { PricingTable } from "@/components/paddle/pricing-table";
import { ContactSection } from "@/components/home/contact-section";

export default function Home() {
  return (
    <>
      <Hero />
      <ActionCalloutSection />
      <PricingTable />
      <ContactSection />
    </>
  );
}
