import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";
import { SITE_URL } from "@/lib/i18n/landing";

// Search-engine ownership verification: set the env var for whichever
// engine you register with and redeploy — no code change needed.
const verification: NonNullable<Metadata["verification"]> = {};
if (process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION)
  verification.google = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION;
if (process.env.NEXT_PUBLIC_YANDEX_SITE_VERIFICATION)
  verification.yandex = process.env.NEXT_PUBLIC_YANDEX_SITE_VERIFICATION;
const other: Record<string, string> = {};
if (process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION)
  other["msvalidate.01"] = process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION;
if (process.env.NEXT_PUBLIC_BAIDU_SITE_VERIFICATION)
  other["baidu-site-verification"] = process.env.NEXT_PUBLIC_BAIDU_SITE_VERIFICATION;
if (process.env.NEXT_PUBLIC_NAVER_SITE_VERIFICATION)
  other["naver-site-verification"] = process.env.NEXT_PUBLIC_NAVER_SITE_VERIFICATION;
if (Object.keys(other).length > 0) verification.other = other;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Facet — one root, many masks",
    template: "%s · Facet",
  },
  description:
    "A forum where you speak through masks — contextual personas under one hidden root — and every Room is tended by an AI agent the community can overrule.",
  applicationName: "Facet",
  keywords: [
    "forum",
    "pseudonymous social network",
    "personas",
    "AI moderation",
    "community constitution",
    "privacy",
    "reddit alternative",
  ],
  openGraph: {
    title: "Facet — one root, many masks",
    description:
      "Speak through personas under one private, verified root. Communities are tended by AI moderators the members can overrule.",
    url: SITE_URL,
    siteName: "Facet",
    type: "website",
    images: ["/facet-logo.png"],
  },
  twitter: {
    card: "summary",
    title: "Facet — one root, many masks",
    description:
      "Speak through personas under one private, verified root. Communities are tended by AI moderators the members can overrule.",
    images: ["/facet-logo.png"],
  },
  verification,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <Nav />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
        <footer
          className="border-t py-4 text-center text-xs"
          style={{ borderColor: "var(--border)", color: "var(--muted)" }}
        >
          Facet — personas are public, roots are private. Agent decisions are always overrideable.
        </footer>
      </body>
    </html>
  );
}
