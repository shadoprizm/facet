// Website analytics (PostHog) for the public pages only. Standard: posthog-standard.md v3.2.
// Only page views and three named link clicks are sent. The visitor is never identified, nothing is
// stored in the browser, and persona handles in /p/<handle> addresses are replaced by a placeholder.
import type { BeforeSendFn, CaptureResult, PostHogConfig } from "posthog-js";

/** Explicit event names allowed from `[data-event]` elements. Anything else is ignored. */
export const CLICK_EVENTS = new Set(["signup_click", "signin_click"]);
/** Only these data-* labels are sent with click events. */
export const CLICK_PROPERTIES = ["platform", "target", "plan", "location"] as const;
/** Only page views are captured automatically (no pageleave, no scroll or engagement events). */
const AUTOMATIC_EVENTS = new Set(["$pageview"]);

/** Landing-page languages (`/welcome/<locale>`). A test keeps this equal to LANDING_LOCALES without bundling the copy. */
export const WELCOME_LOCALES = [
  "fr", "es", "de", "it", "pt", "nl", "pl", "tr", "ru", "uk", "ar", "hi", "id", "ja", "ko", "zh", "vi",
] as const;

/** Public pages that may send page views. Signed-in, admin, auth, API and write routes are not listed. */
const STATIC_PATHS = new Set(["/", "/privacy"]);
const DYNAMIC_PATHS = [
  new RegExp(`^/welcome/(?:${WELCOME_LOCALES.join("|")})$`),
  /^\/r\/[a-z0-9-]{2,32}$/,
  /^\/post\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  /^\/p\/[a-z0-9_]{3,24}$/,
];
const PERSONA_PATH = /^\/p\/[a-z0-9_]{3,24}$/;
/** Persona profile pages are counted, but the handle is never sent. */
export const PERSONA_PLACEHOLDER = "/p/:handle";

const SITE_HOSTS = new Set(["facet.social", "www.facet.social"]);

export type AnalyticsEnv = { key?: string; host?: string };

/** Both values must be configured (NEXT_PUBLIC_POSTHOG_KEY, NEXT_PUBLIC_POSTHOG_HOST); otherwise nothing loads. */
export function analyticsEnabled({ key, host }: AnalyticsEnv): boolean {
  return Boolean(key && host && /^https:\/\/(us|eu)\.i\.posthog\.com$/.test(host));
}

function stripSlash(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
}

export function isTrackedPath(pathname: string): boolean {
  const path = stripSlash(pathname);
  return STATIC_PATHS.has(path) || DYNAMIC_PATHS.some((pattern) => pattern.test(path));
}

/** The path as it is sent: persona handles become a placeholder, everything else is unchanged. */
export function publicPath(pathname: string): string {
  const path = stripSlash(pathname);
  return PERSONA_PATH.test(path) ? PERSONA_PLACEHOLDER : path;
}

/** The five standard campaign parameters; any other query parameter is dropped. */
export const UTM_KEYS = new Set(["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]);

/**
 * A campaign value is kept only if it is a short, plain label (letters, digits and . _ ~ + -, at most 64 chars)
 * and not key- or token-like. This drops values that could carry an email address, a key/token or free text.
 */
export function isSafeCampaignValue(value: string): boolean {
  return /^[A-Za-z0-9._~+-]{1,64}$/.test(value) && !/(^|[_-])(sk|pk|rk|phc|ghp|gho|key|token|secret)[_-]/i.test(value);
}

function isSiteHost(hostname: string): boolean {
  const current = typeof location === "undefined" ? "" : location.hostname.toLowerCase();
  const name = hostname.toLowerCase();
  return SITE_HOSTS.has(name) || (current !== "" && name === current);
}

/**
 * Keep only the origin, path and safe standard utm_* parameters of a URL; other query values and the hash are dropped.
 * Addresses on this site that are not public pages (account, admin, sign-in, write routes) are reduced to the origin,
 * and persona handles are replaced by a placeholder.
 */
export function sanitizeUrl(value: unknown): unknown {
  if (typeof value !== "string" || !/^https?:\/\//.test(value)) return value;
  try {
    const url = new URL(value);
    if (isSiteHost(url.hostname) && !isTrackedPath(url.pathname)) return url.origin;
    const kept = new URLSearchParams();
    url.searchParams.forEach((v, k) => { if (UTM_KEYS.has(k) && isSafeCampaignValue(v)) kept.set(k, v); });
    url.search = kept.toString();
    url.hash = "";
    url.pathname = publicPath(url.pathname);
    return url.toString();
  } catch {
    return undefined;
  }
}

/**
 * Query values posthog-js 1.445.6 also copies out of the page URL or referrer into separate properties
 * (@posthog/browser-common event-utils: CAMPAIGN_PARAMS minus utm_*, and the search-engine keyword `ph_keyword`),
 * each also as `$session_entry_<name>` / `$initial_<name>`. Cleaning URLs alone would not remove them.
 * A test checks this list against the installed SDK, so an upgrade that adds a parameter fails the tests.
 */
export const SDK_QUERY_PROPERTIES = new Set([
  "gad_source", "mc_cid", "gclid", "gclsrc", "dclid", "gbraid", "wbraid", "fbclid", "msclkid", "twclid", "li_fat_id",
  "igshid", "ttclid", "rdt_cid", "epik", "qclid", "sccid", "oppref", "bfcid", "irclid", "_kx", "ph_keyword",
]);

const propertyBase = (key: string) => key.replace(/^\$(session_entry_|initial_)/, "").replace(/^\$/, "");

/**
 * utm_* properties keep only safe values; other URL-derived query properties are removed; every URL value is cleaned;
 * path-only values (`$pathname`, `$session_entry_pathname`, ...) are kept only for public pages.
 * `$prev_pageview_*` (previous page's path, which can be a private route, its duration and scroll depth) is removed.
 * `title` (the document title posthog-js adds to every page view) is removed: persona pages and posts carry the
 * persona handle and user-written post titles in it.
 */
export function sanitizeProperties(props: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(props)) {
    const base = propertyBase(key);
    if (key.startsWith("$prev_pageview_") || key === "title") {
      delete props[key];
    } else if (UTM_KEYS.has(base)) {
      if (!(typeof value === "string" && isSafeCampaignValue(value))) delete props[key];
    } else if (SDK_QUERY_PROPERTIES.has(base)) {
      delete props[key];
    } else if (typeof value === "string" && value.startsWith("/") && !value.startsWith("//")) {
      const pathname = value.split(/[?#]/, 1)[0];
      if (isTrackedPath(pathname)) props[key] = publicPath(pathname);
      else delete props[key];
    } else if (typeof value === "string" && /^https?:\/\//.test(value)) {
      props[key] = sanitizeUrl(value);
    }
  }
}

/** Drops events from non-public pages or with unknown names, strips URLs to safe utm_* only and removes SDK-copied query properties. */
export const beforeSend: BeforeSendFn = (event: CaptureResult | null) => {
  if (!event) return null;
  const props = (event.properties ?? {}) as Record<string, unknown>;
  const current = typeof props.$current_url === "string" ? props.$current_url : "";
  let pathname = "";
  try { pathname = new URL(current).pathname; } catch { return null; }
  if (!isTrackedPath(pathname)) return null;
  if (!AUTOMATIC_EVENTS.has(event.event) && !CLICK_EVENTS.has(event.event)) return null;
  sanitizeProperties(props);
  delete props.$set;
  delete props.$set_once;
  event.properties = props as CaptureResult["properties"];
  return event;
};

export function posthogConfig(host: string): Partial<PostHogConfig> {
  return {
    api_host: host,
    persistence: "memory",              // no cookies, no localStorage
    person_profiles: "identified_only", // identify() is never called, so no person profiles
    autocapture: false,                 // only the explicit [data-event] clicks
    capture_pageview: "history_change",
    capture_pageleave: false,
    disable_session_recording: true,
    disable_surveys: true,
    disable_web_experiments: true,
    disable_external_dependency_loading: true, // no recorder, toolbar or other remote scripts
    advanced_disable_flags: true,       // no feature-flag requests
    capture_heatmaps: false,
    capture_dead_clicks: false,
    rageclick: false,
    capture_exceptions: false,
    capture_performance: false,
    before_send: beforeSend,
  };
}

/** Builds the capture call for a click on a `[data-event]` element, or null if it is not allowed. */
export function clickEvent(dataset: Record<string, string | undefined>): [string, Record<string, string>] | null {
  const name = dataset.event;
  if (!name || !CLICK_EVENTS.has(name)) return null;
  const props: Record<string, string> = {};
  for (const key of CLICK_PROPERTIES) if (dataset[key]) props[key] = String(dataset[key]).slice(0, 40);
  return [name, props];
}
