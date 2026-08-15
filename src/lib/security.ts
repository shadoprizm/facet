export type AppPathAccess = "public" | "protected" | "unknown";

export type SecurityHeader = Readonly<{
  key: string;
  value: string;
}>;

/**
 * Static response headers that are safe for HTML, API responses, errors, and
 * public assets. CSP is request-specific and is added separately by proxy.ts.
 */
export const GLOBAL_SECURITY_HEADERS: readonly SecurityHeader[] = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-XSS-Protection", value: "0" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
  { key: "X-Download-Options", value: "noopen" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
  { key: "Cross-Origin-Resource-Policy", value: "same-site" },
];

const PUBLIC_EXACT_PATHS = new Set([
  "/",
  "/login",
  "/auth/confirm",
  "/api/indexnow",
  "/api/stats",
  "/robots.txt",
  "/sitemap.xml",
  "/llms.txt",
  "/7e3941ae7bb8eb9589bad832f9294472.txt",
  "/googlecc8e26327b14309f.html",
  "/.well-known/security.txt",
]);

const PROTECTED_EXACT_PATHS = new Set([
  "/me",
  "/notifications",
  "/search",
  "/rooms/new",
  "/admin",
  "/admin/admins",
  "/admin/bans",
  "/admin/flags",
  "/admin/rooms",
]);

// Reading is public: Rooms, threads, and persona profiles are crawlable so the
// community is discoverable from search. Writing and anything root-scoped stays
// behind the login gate — note /r/<slug> is public but /r/<slug>/submit and
// /r/<slug>/agent are not.
const PUBLIC_DYNAMIC_PATHS = [
  /^\/welcome\/[^/]+$/,
  /^\/p\/[^/]+$/,
  /^\/post\/[^/]+$/,
  /^\/r\/[^/]+$/,
];
const PROTECTED_DYNAMIC_PATHS = [/^\/r\/[^/]+\/(?:agent|submit)$/];

const SENSITIVE_ROUTE_PREFIXES = [
  "/debug",
  "/actuator",
  "/_debugbar",
  "/wp-admin",
  "/wp-login.php",
  "/wp-content",
  "/swagger",
  "/swagger.json",
  "/openapi.json",
  "/api-docs",
  "/backup",
];

const FORBIDDEN_FILE_SUFFIX =
  /(?:\.(?:bak|old|orig|save|swp|swo|sql|dump|zip|tar|tgz|gz|7z|rar|map)|~)$/i;

function stripOneTrailingSlash(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function isWithin(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function decodePath(pathname: string): string {
  let decoded = pathname;
  // Decode twice so common double-encoded probe paths cannot hide dotfiles.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }
  return decoded.replaceAll("\\", "/");
}

/** Classifies only routes that actually exist in this application. */
export function classifyAppPath(pathname: string): AppPathAccess {
  if (
    !pathname.startsWith("/") ||
    pathname.includes("\\") ||
    pathname.includes("//") ||
    pathname.includes("?") ||
    pathname.includes("#")
  ) {
    return "unknown";
  }

  const normalized = stripOneTrailingSlash(pathname);
  if (PUBLIC_EXACT_PATHS.has(normalized)) return "public";
  if (PROTECTED_EXACT_PATHS.has(normalized)) return "protected";
  if (PUBLIC_DYNAMIC_PATHS.some((pattern) => pattern.test(normalized))) {
    return "public";
  }
  if (PROTECTED_DYNAMIC_PATHS.some((pattern) => pattern.test(normalized))) {
    return "protected";
  }
  return "unknown";
}

/** Detects common secret, VCS, debug, backup, and framework-probe paths. */
export function isSensitiveRequestPath(pathname: string): boolean {
  const normalized = stripOneTrailingSlash(decodePath(pathname)).toLowerCase();
  if (normalized.includes("\0")) return true;

  const segments = normalized.split("/").filter(Boolean);
  if (
    segments.some(
      (segment) =>
        segment === ".git" ||
        segment === ".hg" ||
        segment === ".svn" ||
        segment === ".ds_store" ||
        segment.startsWith(".env"),
    )
  ) {
    return true;
  }

  if (SENSITIVE_ROUTE_PREFIXES.some((prefix) => isWithin(normalized, prefix))) {
    return true;
  }

  return FORBIDDEN_FILE_SUFFIX.test(normalized);
}

/** Used by CI/tests to keep sensitive artifacts out of Next's public folder. */
export function isForbiddenPublicArtifact(relativePath: string): boolean {
  const normalized = relativePath.replaceAll("\\", "/").toLowerCase();
  const segments = normalized.split("/").filter(Boolean);

  if (
    segments.some(
      (segment) => segment.startsWith(".") && segment !== ".well-known",
    )
  ) {
    return true;
  }

  return FORBIDDEN_FILE_SUFFIX.test(normalized);
}

function httpOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function buildContentSecurityPolicy({
  nonce,
  isDevelopment,
  supabaseUrl,
}: {
  nonce: string;
  isDevelopment: boolean;
  supabaseUrl?: string;
}): string {
  if (!/^[A-Za-z0-9+/_=-]+$/.test(nonce)) {
    throw new Error("CSP nonce must be base64 encoded");
  }

  const supabaseOrigin = httpOrigin(supabaseUrl);
  const remoteSources = supabaseOrigin ? ` ${supabaseOrigin}` : "";
  const developmentScriptSource = isDevelopment ? " 'unsafe-eval'" : "";
  const developmentConnectSource = isDevelopment ? " ws: wss:" : "";

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${developmentScriptSource}`,
    `style-src 'self' 'nonce-${nonce}'`,
    `img-src 'self' data: blob:${remoteSources}`,
    `media-src 'self'${remoteSources}`,
    `connect-src 'self'${remoteSources}${developmentConnectSource}`,
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
    "worker-src 'self' blob:",
    ...(isDevelopment ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export function applySecurityHeaders(headers: Headers, csp?: string): void {
  for (const { key, value } of GLOBAL_SECURITY_HEADERS) {
    headers.set(key, value);
  }
  if (csp) headers.set("Content-Security-Policy", csp);
}

/** Normalizes an untrusted form return target to a same-origin path. */
export function safeRedirectPath(
  value: FormDataEntryValue | string | null | undefined,
  fallback = "/",
): string {
  const candidate = typeof value === "string" ? value.trim() : "";
  if (
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(candidate)
  ) {
    return fallback;
  }

  let decoded = candidate;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      return fallback;
    }
  }
  if (decoded.startsWith("//") || decoded.includes("\\")) return fallback;

  try {
    const url = new URL(candidate, "https://facet.invalid");
    if (url.origin !== "https://facet.invalid") return fallback;
    return `${url.pathname}${url.search}`;
  } catch {
    return fallback;
  }
}
