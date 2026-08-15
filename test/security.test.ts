import { describe, expect, it } from "vitest";
import {
  GLOBAL_SECURITY_HEADERS,
  buildContentSecurityPolicy,
  classifyAppPath,
  isForbiddenPublicArtifact,
  isSensitiveRequestPath,
  safeRedirectPath,
} from "../src/lib/security";

describe("buildContentSecurityPolicy", () => {
  const nonce = "dGVzdC1ub25jZQ==";

  it("builds a strict production policy with the exact Supabase origin", () => {
    const policy = buildContentSecurityPolicy({
      nonce,
      isDevelopment: false,
      supabaseUrl: "https://project-ref.supabase.co/rest/v1",
    });

    expect(policy).toContain(`script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`);
    expect(policy).toContain("style-src 'self' 'nonce-dGVzdC1ub25jZQ=='");
    expect(policy).toContain("https://project-ref.supabase.co");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("upgrade-insecure-requests");
    expect(policy).not.toContain("'unsafe-inline'");
    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).not.toContain("\n");
  });

  it("allows only the development evaluator and websocket transport in dev", () => {
    const policy = buildContentSecurityPolicy({
      nonce,
      isDevelopment: true,
    });

    expect(policy).toContain("'unsafe-eval'");
    expect(policy).toContain("ws: wss:");
    expect(policy).not.toContain("'unsafe-inline'");
    expect(policy).not.toContain("upgrade-insecure-requests");
  });

  it("rejects a nonce that could inject another directive", () => {
    expect(() =>
      buildContentSecurityPolicy({
        nonce: "bad'; script-src *",
        isDevelopment: false,
      }),
    ).toThrow(/base64/);
  });
});

describe("classifyAppPath", () => {
  it.each([
    "/",
    "/login",
    "/auth/confirm",
    "/welcome/fr",
    "/api/stats",
    "/api/indexnow",
    "/robots.txt",
    "/sitemap.xml",
    "/.well-known/security.txt",
    // The community surface is crawlable: reading is public, writing is not.
    "/p/example",
    "/post/00000000-0000-0000-0000-000000000000",
    "/r/security",
  ])("classifies %s as public", (pathname) => {
    expect(classifyAppPath(pathname)).toBe("public");
  });

  it.each([
    "/me",
    "/notifications",
    "/search",
    "/rooms/new",
    "/admin",
    "/admin/flags",
    // Write and configuration paths stay gated even though /r/<slug> is open.
    "/r/security/agent",
    "/r/security/submit",
  ])("classifies %s as protected", (pathname) => {
    expect(classifyAppPath(pathname)).toBe("protected");
  });

  it.each([
    "/login-evil",
    "/authentication",
    "/welcome",
    "/welcome/fr/extra",
    "/admin/unknown",
    "/api/stats-copy",
    "/definitely-not-a-route",
    "/openapi.json",
  ])("classifies %s as unknown", (pathname) => {
    expect(classifyAppPath(pathname)).toBe("unknown");
  });
});

describe("sensitive path and public artifact detection", () => {
  it.each([
    "/.git/HEAD",
    "/%2egit/config",
    "/%252egit/config",
    "/.env.bak",
    "/backup.zip",
    "/backup.tar.gz",
    "/debug",
    "/wp-admin/",
    "/wp-login.php",
    "/swagger.json",
    "/openapi.json",
  ])("detects %s as sensitive", (pathname) => {
    expect(isSensitiveRequestPath(pathname)).toBe(true);
  });

  it("allows the standardized disclosure file", () => {
    expect(isForbiddenPublicArtifact(".well-known/security.txt")).toBe(false);
  });

  it.each([".env", ".git/config", "db.sql", "backup.tar.gz", "app.js.map"])(
    "forbids %s in public",
    (path) => {
      expect(isForbiddenPublicArtifact(path)).toBe(true);
    },
  );
});

describe("global security headers", () => {
  const headers = new Map(
    GLOBAL_SECURITY_HEADERS.map(({ key, value }) => [key.toLowerCase(), value]),
  );

  it("contains the safe baseline and full HSTS policy", () => {
    expect(headers.get("strict-transport-security")).toBe(
      "max-age=63072000; includeSubDomains; preload",
    );
    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("x-frame-options")).toBe("DENY");
    expect(headers.get("referrer-policy")).toBe(
      "strict-origin-when-cross-origin",
    );
  });

  it("isolates the browsing context without opening broad CORS", () => {
    expect(headers.has("access-control-allow-origin")).toBe(false);
    expect(headers.has("access-control-allow-methods")).toBe(false);
    expect(headers.get("cross-origin-opener-policy")).toBe("same-origin");
    expect(headers.get("cross-origin-embedder-policy")).toBe("credentialless");
    expect(headers.get("cross-origin-resource-policy")).toBe("same-site");
    expect(headers.has("expect-ct")).toBe(false);
  });
});

describe("safeRedirectPath", () => {
  it.each([
    ["/me", "/me"],
    ["/post/123?notice=ok", "/post/123?notice=ok"],
    ["https://evil.example/phish", "/"],
    ["//evil.example/phish", "/"],
    ["/%2f%2fevil.example", "/"],
    ["/\\evil.example", "/"],
    ["/ok\nLocation:https://evil.example", "/"],
  ])("normalizes %s", (value, expected) => {
    expect(safeRedirectPath(value)).toBe(expected);
  });
});
