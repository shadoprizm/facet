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
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
