import type { MetadataRoute } from "next";
import { BUILD, SITE } from "@/lib/site";

export const dynamic = "force-static";

// The app is a single page; both languages are served from the same URL.
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${SITE.url}/`, lastModified: BUILD.time || undefined, changeFrequency: "monthly", priority: 1 }];
}
