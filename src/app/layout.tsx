import type { Metadata, Viewport } from "next";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { BUILD, SITE } from "@/lib/site";
import "./globals.css";

const ogImage = { url: "/og-image.png", width: 1200, height: 630, alt: "ScreenBloom — privacy-first video to GIF converter that runs in your browser" };

// The language is chosen on the client after load (one URL serves both languages), so there is
// a single canonical URL and no hreflang alternates.
export const metadata: Metadata = {
  metadataBase: new URL(SITE.url + "/"),
  title: SITE.title,
  description: SITE.description,
  applicationName: SITE.name,
  alternates: { canonical: SITE.url + "/" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    url: SITE.url + "/",
    siteName: SITE.name,
    title: SITE.title,
    description: SITE.description,
    images: [ogImage],
    locale: "en_US",
    alternateLocale: ["zh_CN"],
  },
  twitter: { card: "summary_large_image", title: SITE.title, description: SITE.description, images: [ogImage.url] },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

// Only verifiable facts: no ratings, review counts or download numbers.
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: SITE.name,
  url: SITE.url + "/",
  description: SITE.description,
  applicationCategory: "MultimediaApplication",
  operatingSystem: "Any",
  browserRequirements: "Requires WebCodecs, OffscreenCanvas and module Web Workers in a secure context (for example current desktop Chrome or Edge).",
  softwareVersion: BUILD.version,
  license: "https://opensource.org/licenses/MIT",
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  inLanguage: ["en", "zh-CN"],
  image: SITE.url + ogImage.url,
  sameAs: [SITE.repo],
  featureList: ["Trim", "Crop", "Resize", "Frame rate and speed", "GIF export", "Silent MP4 export", "Local processing without uploads"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
