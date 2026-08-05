import { Hero } from "@/components/home/hero";
import { PricingTable } from "@/components/paddle/pricing-table";
import { ContactSection } from "@/components/home/contact-section";

export default function Home() {
  return (
    <>
      <Hero />
      <PricingTable />
      <ContactSection />
    </>
  );
}
