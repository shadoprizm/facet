# GEO + SEO Audit — facet.social

**Date:** 2026-07-07
**Composite GEO Score: 42/100** — Poor-to-Fair
**Site type:** Pseudonymous community forum (pre-growth stage)
**Public surface audited:** `/`, 17 × `/welcome/{locale}`, `/login`, robots.txt, sitemap.xml, llms.txt

---

## Composite Score

| Category | Weight | Score | Weighted |
|---|---|---|---|
| AI Citability & Visibility | 25% | 68 | 17.0 |
| Brand Authority Signals | 20% | 5 | 1.0 |
| Content Quality & E-E-A-T | 20% | 29 | 5.8 |
| Technical Foundations | 15% | 76 | 11.4 |
| Structured Data | 10% | 40 | 4.0 |
| Platform Optimization | 10% | 32 | 3.2 |
| **Composite** | | | **42/100** |

The pattern is unambiguous: **the plumbing is good, the shelves are empty.** Technical SEO (76) and crawler access (90) are genuinely ahead of the curve for a site this size — sitemap with full hreflang, llms.txt, daily IndexNow cron, SSR, valid JSON-LD. But brand authority is 5/100 and content is 29/100 because there is effectively **one unique page of indexable content** and zero external footprint.

---

## Direct Answers to the Founding Questions

**Does facet.social have a sitemap?** Yes — `src/app/sitemap.ts` serves `/sitemap.xml`, referenced from robots.txt, with correct hreflang clusters and x-default. It contains **19 URLs**: the homepage, 17 locale landing pages, and `/login`.

**Are new rooms/pages/posts being indexed?** **No — and they cannot be.** `src/proxy.ts` 307-redirects every anonymous request to `/r/*`, `/post/*`, `/p/*`, `/rooms` to `/login`. Googlebot, Bingbot, GPTBot, ClaudeBot, and PerplexityBot all receive the redirect. No sitemap change can fix this; the auth wall is the blocker. The sitemap excludes rooms/posts deliberately and correctly given the gate ("listing them would just feed engines redirects").

**Is anything indexed at all?** `site:facet.social` returned zero observable organic results on both Google and Bing at audit time. Search Console / Bing Webmaster Tools verification could not be confirmed externally.

---

## Findings by Severity

### CRITICAL

1. **Login wall hides ~100% of unique content.** The product *is* the UGC — every Room, thread, comment, and constitution is invisible to every search engine and AI crawler. Reddit is the most-cited domain in AI answers precisely because threads are open; Facet forfeits that entire mechanism. This is the single dominating constraint — nothing else moves the needle much until it's addressed (or consciously accepted).
2. **Privacy Policy and Terms of Service are login-gated.** `/privacy`, `/terms`, `/about`, `/contact` all redirect to `/login`. For a verified-identity platform marketing in EU languages (fr/de/it/es/nl/pl), users cannot review the privacy policy before signup — likely GDPR/pre-contractual disclosure problem, plus no German Impressum despite a `/welcome/de` page. Legal exposure first, E-E-A-T failure second.
3. **Zero brand footprint + entity collision.** No Wikipedia, Hacker News, Product Hunt, LinkedIn, Crunchbase, press, or "Reddit alternatives" listicle presence. Worse: "Facet" is already owned in LLM training data by Facet Wealth (facet.com); facet.org (Ethereum) and faceted.social also contest the name. Ask any AI "what is Facet?" and it answers with the financial planner.

### HIGH

4. **Canonical host split.** Vercel 308-redirects apex → `www.facet.social`, but every self-declared URL — canonical tag, all 19 sitemap `<loc>`s, hreflang ×19, og:url, JSON-LD `url`/`@id`, robots `Host:`, and the daily IndexNow payload — declares the **apex**. Every URL the site tells engines about answers with a redirect; the canonical points at a URL that redirects back to the page. Root cause: `NEXT_PUBLIC_SITE_URL` unset in Vercel, falling back to `https://facet.social` in `src/lib/i18n/landing.ts:28`.
5. **Soft-404s.** Any unknown URL 307s to `/login` (200) — garbage paths, typos, dead links all "succeed." Google classifies these as soft 404s; it also blocks `/manifest.json`. Redirect only known gated prefixes; let the rest hit `notFound()`.
6. **No security headers beyond bare HSTS.** No CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, or Permissions-Policy — off-brand for a privacy product.
7. **No answer-shaped public content.** ~180 words of unique copy; no FAQ, no docs, no about, no blog. The site cannot be cited for "Reddit alternative," "pseudonymous forum," or "AI moderated community" — terminology Facet invented (root, persona, constitution, override vote) and could own outright in AI retrieval.

### MEDIUM

8. **Organization schema has no `sameAs`** — the primary entity-disambiguation mechanism against Facet Wealth is empty (no GitHub/X/LinkedIn/Crunchbase/Wikidata links exist to point at).
9. **Sitemap `lastmod` is `new Date()` at build time** — all 19 URLs claim to change every deploy; Google learns to ignore it.
10. **`<html lang="en">` on all 17 locale pages** — contradicts the hreflang cluster (`/welcome/fr` serves French content with `lang="en"`).
11. **`/login` in the sitemap with the homepage's exact title** and no noindex — a thin duplicate that every soft-404 also lands on.
12. **Scaled AI-content risk (latent).** The community seed engine generates AI-persona posts. If ever indexed by default at volume, that sits near the centre of Google's scaled-content-abuse policy and invites "dead internet" reputational damage. Policy needed *before* opening content.

### LOW

13. llms.txt is well-written but not spec-complete: no markdown link lists, `llms-full.txt` 404s.
14. HSTS lacks `includeSubDomains`/`preload`; robots `Host:` directive is deprecated/non-standard.
15. No web app manifest; 726 KB logo PNG; `twitter:card` is `summary` not `summary_large_image`; English twitter meta on non-English locale pages; first H2 duplicates the H1.
16. Landing page is fully dynamic (`no-store`) and awaits a Supabase `auth.getUser()` on every anonymous hit — could short-circuit public paths and static-serve.

---

## Prioritized Action Plan

### P0 — This week (low effort, immediate)

| # | Action | Effort | Where |
|---|---|---|---|
| 1 | Set `NEXT_PUBLIC_SITE_URL=https://www.facet.social` in Vercel (or flip the redirect so apex is canonical). One env var fixes ~40 wrong URLs across canonical/hreflang/sitemap/schema/IndexNow. | XS | Vercel env / `src/lib/i18n/landing.ts:28` |
| 2 | Make `/privacy` and `/terms` public; add a footer (Privacy / Terms / About / Contact) on landing + all locales; add German Impressum. | S | `src/proxy.ts` allowlist + new pages |
| 3 | Verify Google Search Console + Bing Webmaster Tools; submit the host-corrected sitemap; confirm IndexNow key serves on the canonical host. | XS | External |
| 4 | Real 404s: in `src/proxy.ts`, redirect only known gated prefixes (`/r/`, `/post/`, `/p/`, `/rooms`, `/me`, `/notifications`, `/search`, `/admin`); everything else → `notFound()`. | S | `src/proxy.ts` |
| 5 | Noindex `/login` + remove from sitemap (or give it a distinct title/canonical). Fix `lastmod` to real content dates or drop it. | XS | `src/app/sitemap.ts`, login page meta |

### P1 — The strategic decision (this is the whole ballgame)

**6. Open a public read-only surface for community content.** The only change that can move indexing materially. Recommended shape:

- **Proxy:** allow anonymous GET on `/r/{slug}`, `/post/{id}`, `/p/{handle}`, `/rooms` (interaction still login-gated).
- **Data:** anon-role RLS SELECT policies on rooms/posts/comments/personas (public fields only — personas are already the public layer by design; pseudonymity is not a blocker).
- **Privacy control:** per-Room public/private visibility written into each constitution (opt-in or opt-out — product call), so communities choose.
- **Seed-content policy (required before opening):** default `noindex` on all thread pages; lift only past a human-engagement threshold (e.g. ≥N human replies/votes); visibly label AI personas; publish a "How Facet uses AI personas" disclosure page. This converts a Google spam risk into a transparency feature.
- **Sitemap:** switch to `generateSitemaps()` (sitemap index) querying Supabase — rooms + index-eligible posts + profiles, with real `lastmod` from `updated_at`.
- **Schema:** `DiscussionForumPosting` (+ nested `Comment`, `InteractionCounter`) on post pages, `ProfilePage` on personas, `BreadcrumbList` everywhere, `CollectionPage`+`ItemList` on rooms. (Ready-to-adapt JSON-LD templates are in the schema section of the subagent output — Google's forum rich results are exactly built for this.)
- **IndexNow:** submit new/updated post URLs on creation instead of re-submitting the same 19 landing URLs daily.

### P2 — Next 30 days (authority building)

| # | Action |
|---|---|
| 7 | Public "How Facet works" docs hub (5–8 answer-shaped pages: root, personas, Rooms, constitutions, override votes, threat model / what the platform can and can't see). Question H2s + 2–3 sentence direct answers + FAQPage schema. Fastest path to owning "AI moderated community" queries. |
| 8 | About page with named operator/entity, jurisdiction, contact — a privacy platform must be maximally transparent about who runs it. Mirror in Organization schema (`founder`, `contactPoint`). |
| 9 | Entity-building sprint under the disambiguated name "Facet (facet.social)": LinkedIn company page, GitHub org, Crunchbase, Wikidata item, Product Hunt launch, Show HN, pitches to Reddit-alternative roundups. Then populate `sameAs` with all of them. |
| 10 | Security headers via `headers()` in `next.config.ts` (CSP report-only first, XFO, nosniff, Referrer-Policy, Permissions-Policy, HSTS upgrade). |
| 11 | Fix `<html lang>` per locale; add `manifest.ts`; visible FAQ on landing with the hard numbers (10 personas, 17 languages) currently only in llms.txt; llms.txt link lists + `llms-full.txt`. |
| 12 | Quarterly AI-moderation transparency reports (agent actions, override votes, overrule rates) — proprietary data nobody else has; the strongest citation magnet available to this product. |

### Platform readiness snapshot (current → post-P1 potential)

| Platform | Now | Blocker |
|---|---|---|
| Google AI Overviews | 30 | No indexed corpus, no forum markup |
| ChatGPT Search | 42 | Empty Bing index despite open access + strong llms.txt |
| Perplexity | 38 | Zero community content — the exact content type it cites most |
| Gemini | 15 | No Google-ecosystem footprint, entity lost to Facet Wealth |
| Bing Copilot | 37 | IndexNow submits 19 redirecting URLs daily |

---

## Bottom Line

The SEO infrastructure someone built here is real and mostly correct — sitemap, robots, llms.txt, IndexNow, hreflang, SSR, JSON-LD. But it's marketing a locked building. Fix the host split and the legal pages this week; then make the actual product decision: **either open a read-only, engagement-gated public surface (Reddit's growth model, with the seed-content guardrails above) or accept that facet.social will only ever rank for its own name.**
