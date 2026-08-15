import { renderOgImage, ogImageSize } from "@/lib/og-image";
import { siteConfig } from "@/lib/site-config";

export const alt = `${siteConfig.name} — ${siteConfig.tagline}`;
export const size = ogImageSize;
export const contentType = "image/png";

export default function Image() {
  return renderOgImage();
}
