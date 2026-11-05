// Website analytics guardrails (posthog-standard.md v3.2).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { CaptureResult } from "posthog-js";
import {
  CLICK_EVENTS, PERSONA_PLACEHOLDER, SDK_QUERY_PROPERTIES, UTM_KEYS, WELCOME_LOCALES, analyticsEnabled, beforeSend,
  clickEvent, isTrackedPath, posthogConfig, sanitizeUrl,
} from "../src/lib/analytics";
import { LANDING_LOCALES } from "../src/lib/i18n/landing";
import { buildContentSecurityPolicy, classifyAppPath } from "../src/lib/security";

const ORIGIN = "https://facet.social";
const POST = "/post/123e4567-e89b-12d3-a456-426614174000";
const event = (name: string, url: string, extra: Record<string, unknown> = {}) =>
  ({ uuid: "u", event: name, properties: { $current_url: url, ...extra } }) as unknown as CaptureResult;
const read = (file: string) => readFileSync(file, "utf8");

describe("analytics configuration", () => {
  it("loads nothing unless both the key and a PostHog cloud host are configured", () => {
    expect(analyticsEnabled({})).toBe(false);
    expect(analyticsEnabled({ key: "phc_test" })).toBe(false);
    expect(analyticsEnabled({ key: "phc_test", host: "https://evil.example.com" })).toBe(false);
    expect(analyticsEnabled({ key: "phc_test", host: "https://us.i.posthog.com" })).toBe(true);
  });

  it("is cookieless, without autocapture, replay, surveys, flags or remote scripts", () => {
    const c = posthogConfig("https://us.i.posthog.com");
    expect(c).toMatchObject({
      persistence: "memory", person_profiles: "identified_only", autocapture: false, capture_pageleave: false,
      disable_session_recording: true, disable_surveys: true, disable_web_experiments: true,
      disable_external_dependency_loading: true, advanced_disable_flags: true, capture_heatmaps: false,
      capture_dead_clicks: false, rageclick: false, capture_exceptions: false, capture_performance: false,
    });
  });

  it("pins posthog-js exactly and keeps tokens and identify() out of the source", () => {
    expect(JSON.parse(read("package.json")).dependencies["posthog-js"]).toBe("1.445.6");
    for (const f of ["src/lib/analytics.ts", "src/components/WebsiteAnalytics.tsx", "src/app/layout.tsx"]) {
      expect(read(f)).not.toMatch(/phc_[A-Za-z0-9]{20,}/);
      expect(read(f)).not.toMatch(/\.identify\s*\(/);
    }
  });

  it("registers the click listener in the capture phase", () => {
    expect(read("src/components/WebsiteAnalytics.tsx")).toContain('document.addEventListener("click", onClick, true)');
  });
});

describe("only public pages are tracked", () => {
  it.each(["/", "/privacy", "/welcome/fr", "/r/security", POST, "/p/some_user"])("tracks %s", (path) => {
    expect(isTrackedPath(path)).toBe(true);
    expect(beforeSend(event("$pageview", `${ORIGIN}${path}`))).not.toBeNull();
  });

  it.each([
    "/login", "/auth/confirm", "/me", "/notifications", "/search", "/rooms/new", "/admin", "/admin/bans",
    "/r/security/submit", "/r/security/agent", "/api/stats", "/api/indexnow", "/welcome", "/welcome/xx", "/p/ab",
    "/post/not-a-uuid", "/reset-password", "/billing", "/checkout",
  ])("drops events from %s", (path) => {
    expect(isTrackedPath(path)).toBe(false);
    expect(beforeSend(event("$pageview", `${ORIGIN}${path}`))).toBeNull();
    expect(beforeSend(event("signin_click", `${ORIGIN}${path}`))).toBeNull();
  });

  it("allows only $pageview and the named clicks", () => {
    for (const name of ["$pageleave", "$autocapture", "$identify", "$rageclick", "$exception", "$web_vitals", "custom"]) {
      expect(beforeSend(event(name, `${ORIGIN}/`))).toBeNull();
    }
    for (const name of ["$pageview", "signup_click", "signin_click"]) expect(beforeSend(event(name, `${ORIGIN}/`))).not.toBeNull();
    expect(beforeSend({ uuid: "u", event: "$pageview", properties: {} } as unknown as CaptureResult)).toBeNull();
  });

  it("keeps the welcome-locale list equal to the landing locales, without bundling their copy", () => {
    expect([...WELCOME_LOCALES].sort()).toEqual(LANDING_LOCALES.map((l) => l.locale).filter((l) => l !== "en").sort());
  });

  it("every tracked page type is a public route in the app's own access map", () => {
    for (const path of ["/", "/privacy", "/welcome/fr", "/r/security", POST, "/p/some_user"]) expect(classifyAppPath(path)).toBe("public");
  });
});

describe("persona handles are never sent", () => {
  it("replaces the handle in the current URL, referrer and path properties", () => {
    const out = beforeSend(event("$pageview", `${ORIGIN}/p/secret_mask?utm_source=hn`, {
      $referrer: `${ORIGIN}/p/other_mask`, $pathname: "/p/secret_mask", $session_entry_pathname: "/p/secret_mask",
      $initial_referrer: "https://news.example.com/p/not_ours",
    }))!;
    expect(out.properties.$current_url).toBe(`${ORIGIN}/p/:handle?utm_source=hn`);
    expect(out.properties.$referrer).toBe(`${ORIGIN}/p/:handle`);
    expect(out.properties.$pathname).toBe(PERSONA_PLACEHOLDER);
    expect(out.properties.$session_entry_pathname).toBe(PERSONA_PLACEHOLDER);
    expect(JSON.stringify(out.properties)).not.toMatch(/secret_mask|other_mask/);
  });
});

describe("document titles are never sent", () => {
  it("drops the title property that posthog-js adds to page views (persona and post titles carry user content)", () => {
    for (const [path, title] of [
      ["/p/secret_mask", "Secret Mask (@secret_mask) — Facet"],
      [POST, "My very private question about my landlord · Facet"],
      ["/", "Facet — one root, many masks"],
    ] as const) {
      const out = beforeSend(event("$pageview", `${ORIGIN}${path}`, { title }))!;
      expect(out.properties).not.toHaveProperty("title");
      expect(JSON.stringify(out.properties)).not.toMatch(/secret_mask|landlord|Secret Mask/);
    }
    expect(read("node_modules/posthog-js/lib/src/posthog-core.js")).toContain("properties['title'] = ");
  });
});

describe("no codes, tokens or private paths in URLs", () => {
  it("keeps only utm_* query parameters", () => {
    expect(sanitizeUrl(`${ORIGIN}/?utm_source=hn&code=ABCD1234&token=x#frag`)).toBe(`${ORIGIN}/?utm_source=hn`);
  });

  it("reduces same-site private referrers and entry URLs to the origin, keeps outside referrers' paths", () => {
    const out = beforeSend(event("$pageview", `${ORIGIN}/privacy?session=secret`, {
      $referrer: `${ORIGIN}/me?token=SECRET`, $session_entry_url: `${ORIGIN}/admin/bans?x=1`,
      $initial_referrer: `${ORIGIN}/login?next=/me`, $initial_current_url: `https://www.facet.social/r/security/submit`,
    }))!;
    expect(out.properties.$current_url).toBe(`${ORIGIN}/privacy`);
    for (const key of ["$referrer", "$session_entry_url", "$initial_referrer"]) expect(out.properties[key]).toBe(ORIGIN);
    expect(out.properties.$initial_current_url).toBe("https://www.facet.social");
    expect(sanitizeUrl("https://news.example.com/item/42?id=7")).toBe("https://news.example.com/item/42");
  });

  it("removes person properties and path properties of private routes", () => {
    const p = beforeSend(event("$pageview", `${ORIGIN}/`, { $set: { email: "a@b.c" }, $set_once: { x: 1 }, $initial_pathname: "/admin/flags" }))!.properties;
    for (const key of ["$set", "$set_once", "$initial_pathname"]) expect(p).not.toHaveProperty(key);
  });
});

describe("campaign values and SDK-copied query properties (data-leak fix)", () => {
  it("URLs keep only safe values of the five standard utm_* keys", () => {
    const keep = (qs: string) => new URL(sanitizeUrl(`${ORIGIN}/?${qs}`) as string).search;
    expect(keep("utm_source=a%40b.c")).toBe("");
    expect(keep("utm_content=sk_live_abc123def456")).toBe("");
    expect(keep("utm_term=phc_abcdef123")).toBe("");
    expect(keep("utm_medium=my-token-value")).toBe("");
    expect(keep("utm_source=two%20words")).toBe("");
    expect(keep(`utm_source=${"a".repeat(65)}`)).toBe("");
    expect(keep(`utm_source=${"a".repeat(64)}`)).toBe(`?utm_source=${"a".repeat(64)}`);
    expect(keep("utm_x=test")).toBe("");
    expect(keep("utm_campaign=launch-2026")).toBe("?utm_campaign=launch-2026");
  });

  it("deletes unsafe utm_* properties and their $session_entry_/$initial_ copies, keeps safe ones", () => {
    const p = beforeSend(event("$pageview", `${ORIGIN}/`, {
      utm_source: "a@b.c", $session_entry_utm_content: "sk_live_abc123def456", $initial_utm_source: "a@b.c",
      utm_content: "sk_live_abc123def456", utm_medium: null, utm_campaign: "launch-2026", $session_entry_utm_source: "hn",
    }))!.properties;
    for (const key of ["utm_source", "$session_entry_utm_content", "$initial_utm_source", "utm_content", "utm_medium"]) expect(p).not.toHaveProperty(key);
    expect(p.utm_campaign).toBe("launch-2026");
    expect(p.$session_entry_utm_source).toBe("hn");
    expect(JSON.stringify(p)).not.toMatch(/a@b|sk_live/);
  });

  it("deletes click-ID and search-keyword properties copied from the URL or referrer", () => {
    const p = beforeSend(event("$pageview", `${ORIGIN}/`, {
      gclid: "SECRET", $session_entry_gclid: "SECRET", $initial_gclid: "SECRET", fbclid: "SECRET", msclkid: "SECRET",
      gad_source: "1", ph_keyword: "my secret search", $search_engine: "google", $browser: "Chrome",
    }))!.properties;
    for (const key of ["gclid", "$session_entry_gclid", "$initial_gclid", "fbclid", "msclkid", "gad_source", "ph_keyword"]) expect(p).not.toHaveProperty(key);
    expect(p.$search_engine).toBe("google");
    expect(JSON.stringify(p)).not.toMatch(/SECRET|secret search/);
  });

  it("deletes every $prev_pageview_* property (previous path can be a private route)", () => {
    const p = beforeSend(event("$pageview", `${ORIGIN}/privacy`, {
      $prev_pageview_pathname: "/me", $prev_pageview_id: "p1", $prev_pageview_duration: 12.3, $prev_pageview_max_scroll: 900,
    }))!.properties;
    expect(Object.keys(p).filter((k) => k.startsWith("$prev_pageview_"))).toEqual([]);
  });

  it("covers every campaign parameter of the installed posthog-js, plus ph_keyword", () => {
    const sdk = read("node_modules/@posthog/browser-common/dist/utils/event-utils.mjs");
    // Tolerates `const NAME = [...]` and the bundler form `const NAME = /* @__PURE__ */ (()=>[...])()`.
    const list = (name: string) => {
      const found = sdk.match(new RegExp(`const ${name}\\s*=[^\\[]*\\[([\\s\\S]*?)\\]`));
      expect(found, `${name} not found in the SDK; update this guard`).not.toBeNull();
      return [...found![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    };
    const sdkParams = [...list("PERSONAL_DATA_CAMPAIGN_PARAMS"), ...list("CAMPAIGN_PARAMS")];
    expect(sdkParams).toContain("gclid");
    expect(sdkParams).toContain("utm_source");
    for (const name of sdkParams) expect(UTM_KEYS.has(name) || SDK_QUERY_PROPERTIES.has(name), `${name} is filtered`).toBe(true);
    expect(sdk).toMatch(/ret\['ph_keyword'\] = keyword/);
    expect(SDK_QUERY_PROPERTIES.has("ph_keyword")).toBe(true);
    expect(JSON.parse(read("node_modules/posthog-js/package.json")).version).toBe("1.445.6");
  });
});

describe("click events", () => {
  it("send only the allowed event names and four data-* labels", () => {
    expect(clickEvent({ event: "signup_click", location: "hero", extra: "x" })).toEqual(["signup_click", { location: "hero" }]);
    expect(clickEvent({ event: "delete_account" })).toBeNull();
    expect(clickEvent({})).toBeNull();
  });

  it("names exactly the events that have a data-event hook in the code, and no others", () => {
    const code = ["src/components/Landing.tsx", "src/components/Nav.tsx"].map(read).join("\n");
    const hooked = new Set([...code.matchAll(/data-event="([a-z_]+)"/g)].map((m) => m[1]));
    expect(hooked).toEqual(CLICK_EVENTS);
  });
});

describe("content security policy", () => {
  it("allows the US PostHog ingestion host in connect-src and nothing else new", () => {
    const csp = buildContentSecurityPolicy({ nonce: "dGVzdA==", isDevelopment: false, supabaseUrl: "https://ref.supabase.co" });
    const connect = csp.split("; ").find((d) => d.startsWith("connect-src "))!;
    expect(connect).toBe("connect-src 'self' https://ref.supabase.co https://us.i.posthog.com");
    expect(csp).toContain("script-src 'self' 'nonce-dGVzdA==' 'strict-dynamic'");
    expect(csp).not.toMatch(/posthog[^;]*script-src|script-src[^;]*posthog/);
  });
});

describe("disclosure ships with the script", () => {
  const privacy = read("src/app/privacy/page.tsx").replace(/\s+/g, " ");
  it("names PostHog, the US region and IP processing, and rescopes nothing as absolute", () => {
    expect(privacy).toContain("uses PostHog, a product analytics service");
    expect(privacy).toContain("Analytics data is processed in the US.");
    expect(privacy).toContain("IP addresses may be processed by PostHog.");
    expect(privacy).not.toMatch(/(not|never) (store|stored|kept|collect)[^.]*IP|IP[^.]*not (stored|kept)|anonymi[sz]ed|no cookies|kept for \d+/i);
  });
  it("names only clicks that are actually instrumented, and lists PostHog as a provider", () => {
    expect(privacy).toContain("clicks on the Create your account and Sign in links");
    expect(privacy).toContain("<li>PostHog: website analytics");
  });
  it("is a public, crawlable page linked from the footer and the sitemap", () => {
    expect(classifyAppPath("/privacy")).toBe("public");
    expect(read("src/app/layout.tsx")).toContain('href="/privacy"');
    expect(read("src/app/sitemap.ts")).toContain("/privacy");
    expect(privacy).toContain("DRAFT legal wording");
  });
});
