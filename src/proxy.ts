import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  applySecurityHeaders,
  buildContentSecurityPolicy,
  classifyAppPath,
  isSensitiveRequestPath,
} from "@/lib/security";

function secureResponse(
  response: NextResponse,
  csp: string,
  noStore = false,
): NextResponse {
  applySecurityHeaders(response.headers, csp);
  if (noStore || response.cookies.getAll().length > 0) {
    response.headers.set("Cache-Control", "private, no-store");
  }
  return response;
}

function copyCookies(source: NextResponse, destination: NextResponse): void {
  for (const cookie of source.cookies.getAll()) {
    destination.cookies.set(cookie);
  }
}

/**
 * Refreshes the Supabase session on every request (Next 16 proxy, formerly
 * middleware) and gates the app behind login.
 */
export default async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildContentSecurityPolicy({
    nonce,
    isDevelopment: process.env.NODE_ENV === "development",
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
  const pathAccess = classifyAppPath(request.nextUrl.pathname);

  // Return a real 404 before auth for probes and for paths that do not map to
  // an application route. This also prevents accidental login-page 200s from
  // being mistaken for exposed backups, VCS metadata, or admin consoles.
  if (
    pathAccess === "unknown" ||
    isSensitiveRequestPath(request.nextUrl.pathname)
  ) {
    return secureResponse(new NextResponse(null, { status: 404 }), csp, true);
  }

  const makePassThroughResponse = () => {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-nonce", nonce);
    // Next parses the request CSP to apply the nonce to framework scripts.
    requestHeaders.set("Content-Security-Policy", csp);

    return secureResponse(
      NextResponse.next({ request: { headers: requestHeaders } }),
      csp,
    );
  };

  let response = makePassThroughResponse();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          // Rebuild from the now-updated request so refreshed cookies, the CSP
          // request header, and the nonce all reach the Server Components.
          response = makePassThroughResponse();
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // @supabase/ssr 0.12 supports getClaims(): it refreshes near-expiry tokens
  // and verifies asymmetric JWTs locally against the project's cached JWKS.
  const { data: claimsData } = await supabase.auth.getClaims();
  const isAuthenticated = Boolean(claimsData?.claims?.sub);

  if (!isAuthenticated && pathAccess === "protected") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.hash = "";

    const redirect = NextResponse.redirect(url);
    copyCookies(response, redirect);
    return secureResponse(redirect, csp, true);
  }

  return secureResponse(response, csp);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|_next/webpack-hmr|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff|woff2)$).*)",
  ],
};
