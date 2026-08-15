import type { MetadataRoute } from "next";
import {
  LANDING_LOCALES,
  SITE_URL,
  hreflangAlternates,
} from "@/lib/i18n/landing";
import { createClient } from "@/lib/supabase/server";

/**
 * Landing pages plus the public community surface. Rooms, threads, and persona
 * profiles became crawlable in migration 20260815193000_public_read — before
 * that everything here 307'd to /login, so the sitemap held only the landings.
 *
 * Read through the anon key, so this lists exactly what a crawler can fetch:
 * removed Rooms and removed posts are filtered out by RLS, not by this code.
 */

// Sitemaps cap at 50k URLs; stay well inside it and prefer recent content.
const MAX_ROOMS = 1000;
const MAX_POSTS = 5000;
const MAX_PERSONAS = 1000;

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const languages = hreflangAlternates();
  const lastModified = new Date();

  const landings: MetadataRoute.Sitemap = LANDING_LOCALES.map((l) => ({
    url: l.locale === "en" ? `${SITE_URL}/` : `${SITE_URL}/welcome/${l.locale}`,
    lastModified,
    changeFrequency: "weekly" as const,
    priority: l.locale === "en" ? 1 : 0.8,
    alternates: { languages },
  }));

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/login`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];

  let community: MetadataRoute.Sitemap = [];
  try {
    const supabase = await createClient();
    const [{ data: rooms }, { data: posts }, { data: personas }] =
      await Promise.all([
        supabase
          .from("rooms_public")
          .select("slug, created_at")
          .order("created_at", { ascending: false })
          .limit(MAX_ROOMS),
        supabase
          .from("posts")
          .select("id, created_at")
          .eq("status", "active")
          .order("created_at", { ascending: false })
          .limit(MAX_POSTS),
        supabase
          .from("personas_public")
          .select("handle, created_at")
          .eq("status", "active")
          .order("karma", { ascending: false })
          .limit(MAX_PERSONAS),
      ]);

    community = [
      ...(rooms ?? []).map((r) => ({
        url: `${SITE_URL}/r/${r.slug}`,
        lastModified: new Date(r.created_at),
        changeFrequency: "daily" as const,
        priority: 0.9,
      })),
      ...(posts ?? []).map((p) => ({
        url: `${SITE_URL}/post/${p.id}`,
        lastModified: new Date(p.created_at),
        changeFrequency: "weekly" as const,
        priority: 0.7,
      })),
      ...(personas ?? []).map((p) => ({
        url: `${SITE_URL}/p/${p.handle}`,
        lastModified: new Date(p.created_at),
        changeFrequency: "weekly" as const,
        priority: 0.4,
      })),
    ];
  } catch {
    // A database hiccup must not take the sitemap down entirely — serving the
    // landing pages alone beats returning a 500 to a crawler.
  }

  return [...landings, ...staticPages, ...community];
}
