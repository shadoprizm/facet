import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/i18n/landing";

/**
 * Everything public is open to every crawler — including AI search bots
 * (GPTBot, ClaudeBot, PerplexityBot, etc.), Baiduspider, and YandexBot,
 * which all match `*`. Gated app routes are disallowed so engines don't
 * waste crawl budget on login redirects.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/api/",
        "/auth/",
        "/me",
        "/notifications",
        "/search",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
