import type { MetadataRoute } from "next";
import {
  LANDING_LOCALES,
  SITE_URL,
  hreflangAlternates,
} from "@/lib/i18n/landing";

/**
 * Only publicly crawlable URLs belong here. Rooms, posts, and profiles are
 * behind the login gate — listing them would just feed engines redirects.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const languages = hreflangAlternates();
  const lastModified = new Date();

  const landings: MetadataRoute.Sitemap = LANDING_LOCALES.map((l) => ({
    url: l.locale === "en" ? `${SITE_URL}/` : `${SITE_URL}/welcome/${l.locale}`,
    lastModified,
    changeFrequency: "weekly" as const,
    priority: l.locale === "en" ? 1 : 0.8,
    alternates: { languages },
  }));

  return [
    ...landings,
    {
      url: `${SITE_URL}/login`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];
}
