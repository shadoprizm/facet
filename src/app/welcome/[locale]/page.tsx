import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Landing from "@/components/Landing";
import {
  LANDING_LOCALES,
  SITE_URL,
  getLandingCopy,
  hreflangAlternates,
} from "@/lib/i18n/landing";

/**
 * Localized landing pages. English lives at `/`; every other locale is
 * statically generated here with localized metadata + hreflang alternates.
 */

export const dynamicParams = false;

export function generateStaticParams() {
  return LANDING_LOCALES.filter((l) => l.locale !== "en").map((l) => ({
    locale: l.locale,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const copy = getLandingCopy(locale);
  if (!copy) return {};
  return {
    title: { absolute: copy.title },
    description: copy.description,
    alternates: {
      canonical: `${SITE_URL}/welcome/${copy.locale}`,
      languages: hreflangAlternates(),
    },
    openGraph: {
      title: copy.title,
      description: copy.description,
      url: `${SITE_URL}/welcome/${copy.locale}`,
      siteName: "Facet",
      locale: copy.locale,
      type: "website",
      images: [`${SITE_URL}/facet-logo.png`],
    },
  };
}

export default async function WelcomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const copy = getLandingCopy(locale);
  if (!copy) notFound();
  return <Landing copy={copy} />;
}
