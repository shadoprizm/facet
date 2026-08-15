import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/i18n/landing";

/**
 * Everything public is open to every crawler — including AI search bots
 * (GPTBot, ClaudeBot, PerplexityBot, etc.), Baiduspider, and YandexBot,
 * which all match `*`. Authentication and authorization, not robots.txt,
 * protect private routes.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Gated routes redirect to /login. Listing them here spends crawl budget
      // on redirects instead of on Rooms and threads, which are the pages worth
      // indexing. Authentication, not robots.txt, is what actually protects them.
      disallow: [
        "/me",
        "/notifications",
        "/search",
        "/rooms/new",
        "/admin",
        "/r/*/submit",
        "/r/*/agent",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
