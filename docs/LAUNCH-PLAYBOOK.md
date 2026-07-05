# Facet Launch Playbook — 100 users in 7 days

Goal: **100 registered roots within 7 days** of launch. Progress is measured by
`https://facet.social/api/stats` (the `members` counter).

## What runs by itself (already wired)

| Piece | What it does | Cadence |
|---|---|---|
| Public landing at `/` + 17 localized pages at `/welcome/<locale>` | Crawlable, hreflang-linked marketing surface in 18 languages | always on |
| `robots.txt` / `sitemap.xml` / `llms.txt` | Open to all crawlers incl. AI search bots (GPTBot, ClaudeBot, PerplexityBot), Baiduspider, YandexBot | always on |
| `/api/indexnow` + Vercel cron | Pushes all public URLs to **IndexNow** → Bing, Yandex, Naver, Seznam, Yep | daily 06:17 UTC |
| Daily marketing pulse (Claude scheduled routine) | Checks `/api/stats` vs the 100-user pace line, verifies the site is up and crawlable, reports what to do next | daily |

## One-time manual registrations (~20 minutes total)

These need a human because they require account creation. Each engine's
verification meta tag is already plumbed: paste the token into the matching
Vercel env var and redeploy — no code change.

1. **Google Search Console** (biggest payoff, ~5 min)
   https://search.google.com/search-console → Add property `facet.social`
   (domain property via DNS TXT, or URL-prefix via meta tag →
   `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`). Then **Sitemaps → submit
   `https://facet.social/sitemap.xml`** and use *URL Inspection → Request
   Indexing* on `/`. Google has no IndexNow — this is the only reliable path.
2. **Bing Webmaster Tools** (~3 min) — https://www.bing.com/webmasters →
   "Import from Google Search Console" (one click after #1), or verify via
   `NEXT_PUBLIC_BING_SITE_VERIFICATION`. Bing also powers DuckDuckGo, Ecosia,
   and Brave Search results. IndexNow already pings Bing daily.
3. **Yandex Webmaster** (Russia, ~3 min) — https://webmaster.yandex.com →
   add site → meta-tag verify (`NEXT_PUBLIC_YANDEX_SITE_VERIFICATION`) →
   submit sitemap. IndexNow already pings Yandex daily.
4. **Baidu** (China, ~5 min, tempered expectations) —
   https://ziyuan.baidu.com → verify (`NEXT_PUBLIC_BAIDU_SITE_VERIFICATION`)
   → submit sitemap. Reality check: without an ICP licence and China hosting,
   Baidu will index but rank the site poorly, and Vercel is intermittently
   reachable from mainland China. The `/welcome/zh` page still serves the
   Chinese-speaking diaspora via Google/Bing.
5. **Naver** (Korea, optional) — https://searchadvisor.naver.com →
   `NEXT_PUBLIC_NAVER_SITE_VERIFICATION`. IndexNow already pings Naver.
6. **Seznam** (Czechia) — nothing to do; covered by IndexNow.

AI search engines (ChatGPT, Perplexity, Claude, Gemini) need no registration —
they crawl via the bots that `robots.txt` explicitly welcomes and read
`llms.txt`.

## The 7-day plan

Pace line: ~15 signups/day. Directories and search take days 3–7 to compound,
so days 1–2 lean on communities and direct outreach.

### Day 0 (today) — infrastructure
- [x] Public multilingual landing pages, robots, sitemap, llms.txt, IndexNow
- [ ] Google Search Console + Bing import (items 1–2 above)
- [ ] Apply migration `0008_public_stats.sql` (Supabase SQL editor or `supabase db push`) so `/api/stats` works

### Day 1 — the launch posts (biggest single lever)
Post once per venue, personally, and stay in the thread answering questions
all day. Ready-to-paste copy is in the appendix.
- **Hacker News** — "Show HN: Facet – a forum where you have one root identity and many unlinkable masks". Privacy + AI-moderation-with-democratic-override is squarely HN-shaped. A front-page Show HN alone can clear 100 signups.
- **Product Hunt** — schedule for 12:01 AM PT; ask a few friends to be first commenters (commenting is fine; vote-begging is not).
- **Reddit, as yourself, flaired appropriately**: r/SideProject, r/InternetIsBeautiful, r/privacy (concept discussion, not an ad), r/selfhosted-adjacent communities. One post per subreddit, follow each sub's self-promo rules, engage in comments. **Do not** post the same text everywhere or use alt accounts — cross-posting spam and vote manipulation get domains banned platform-wide.
- **Lobste.rs / Tildes** if you have (or can be invited to) an account.

### Day 2 — directories (permanent backlinks, drip traffic)
Submit once each (~5 min each): AlternativeTo (as Reddit alternative),
Indie Hackers (product + launch post), BetaList, SaaSHub, Uneed, Peerlist,
LibHunt, ProductHunt-alternatives lists. These backlinks are also what makes
Google index and rank the domain faster.

### Day 3 — niche communities & the fediverse
- Mastodon/Bluesky intro thread from your own account with the `/welcome` links in relevant languages.
- Privacy-focused communities: Privacy Guides forum, Techlore forum — post as a discussion of the identity model, invite critique.
- Discord/Slack groups you're genuinely in (indie hackers, dev communities): share in #show-your-work channels.

### Day 4 — content flywheel
- Write one deep-dive post ("How Facet's AI moderator recalibrates from community votes" or "Personas without sockpuppets: one root, one vote") on the site or dev.to/Hashnode with canonical links back. HN/Reddit second wave.
- Answer 2–3 existing questions (Reddit, HN "Ask", Stack-adjacent) about pseudonymity/moderation where Facet is a genuinely relevant answer — link only where it truly answers the question.

### Day 5 — press & newsletters
- Email 5 newsletters/blogs that cover new social platforms and privacy tools (e.g. TLDR, The Prepared-style indie lists, privacy newsletters). Two paragraphs + one screenshot; the llms.txt/README copy is the pitch.
- Submit to "startup launch" aggregators: Launching Next, StartupBase, MicroLaunch.

### Day 6 — seed the destination
Traffic without live conversation bounces. Make sure the front page shows
5–10 active Rooms with real threads (your own personas may found Rooms and
post openly — that's the product working as designed, label yourself as the
founder). Pin a "welcome — what would you like Facet to be?" thread.

### Day 7 — measure and double down
- `/api/stats` vs 100. Check GSC coverage + Bing/Yandex webmaster dashboards.
- Whatever venue drove the most signups gets a follow-up (HN comment activity, a "what we learned" post, PH update).

## Hard rules (what we deliberately don't do)

- No fake accounts, no vote manipulation, no mass DM/cold-email blasts, no
  cross-posting identical text to dozens of venues. Every major platform
  detects this, and a new domain that trips spam filters is effectively dead
  — it would cost far more than 100 users.
- Every community post is made by a human, follows the venue's self-promotion
  rules, and stays to answer questions.

## Appendix — ready-to-paste copy

### Show HN
> **Show HN: Facet – a forum with one private root identity and many unlinkable public masks**
>
> I built a Reddit-style forum around two ideas. First, contextual identity: you verify one "root" account that only the platform knows, then act in public through personas — separate names, avatars, karma, histories. Nobody can link them to each other or to you, but bans land on the root, so pseudonymity doesn't mean zero accountability (one root = one vote, max 10 personas, root-scoped bans).
>
> Second, accountable AI moderation: every community is tended by an agent governed by a constitution its members write. It can nudge, collapse, or escalate — never ban — and every action it takes opens a community vote. Overrule it and it recalibrates its own thresholds. The moderation engine is deterministic TypeScript (lexicon heat + hashed BoW drift), no LLM calls in the hot path.
>
> Stack: Next.js 16 + Supabase (RLS does the "root is enforceable but invisible" work). https://facet.social — would love critique of the identity model.

### Product Hunt tagline
> **Facet — one root, many masks.** A forum where your identities stay separate but accountability doesn't. AI moderators follow a community-written constitution, and every decision they make can be overruled by member vote.

### Reddit (r/SideProject flavour — adapt per sub, don't paste verbatim everywhere)
> I got tired of choosing between "one account that follows you everywhere" and "throwaways with zero accountability", so I built Facet. You verify one private root, then post through unlinkable personas — but bans hit the root, and votes are deduplicated per root so masks can't brigade. Each community is moderated by an AI agent with a member-written constitution, and the community can overrule any decision it makes (it actually recalibrates when overruled). Free, no ads, email used only for verification. Happy to answer anything about how the RLS/identity model works.

### Newsletter pitch (2 paragraphs)
> Facet is a new community forum that splits identity from accountability: users hold one private, verified root account and speak through unlinkable public personas — yet bans and vote-deduplication apply to the real person underneath. It's an answer to both real-name policies and throwaway-account chaos.
>
> Its second bet is AI moderation with democratic oversight: every community writes a constitution for its resident AI moderator, every action the agent takes goes to a member vote, and the agent retunes itself when overruled. Live at https://facet.social, free, launched this week.
