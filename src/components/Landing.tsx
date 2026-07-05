import Link from "next/link";
import {
  LANDING_LOCALES,
  SITE_URL,
  type LandingCopy,
} from "@/lib/i18n/landing";

/**
 * Public marketing landing page, rendered at `/` (English, logged-out) and
 * `/welcome/<locale>` for every other language. Pure server component —
 * no client JS, fully crawlable.
 */
export default function Landing({ copy }: { copy: LandingCopy }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#org`,
        name: "Facet",
        url: SITE_URL,
        logo: `${SITE_URL}/facet-logo.png`,
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        name: "Facet",
        url: SITE_URL,
        inLanguage: copy.locale,
        description: copy.description,
        publisher: { "@id": `${SITE_URL}/#org` },
      },
      {
        "@type": "WebApplication",
        name: "Facet",
        url: SITE_URL,
        applicationCategory: "SocialNetworkingApplication",
        operatingSystem: "Web",
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        description: copy.description,
      },
    ],
  };

  return (
    <div lang={copy.locale} dir={copy.dir} className="mx-auto max-w-3xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <section className="py-10 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/facet-logo.png"
          alt="Facet"
          className="mx-auto mb-6 h-16 w-16 rounded-2xl object-contain"
          style={{ background: "#fff", padding: 6 }}
        />
        <h1 className="text-3xl font-bold sm:text-4xl">{copy.tagline}</h1>
        <p className="mx-auto mt-4 max-w-2xl text-base" style={{ color: "var(--muted)" }}>
          {copy.hero}
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link href="/login" className="btn btn-primary">
            {copy.cta}
          </Link>
          <Link href="/login" className="btn btn-ghost">
            {copy.signIn}
          </Link>
        </div>
        <p className="mt-4 text-xs" style={{ color: "var(--muted)" }}>
          {copy.freeNote}
        </p>
      </section>

      <section className="grid gap-4 pb-10 sm:grid-cols-3">
        {copy.features.map((f) => (
          <div key={f.title} className="panel p-5">
            <h2 className="mb-2 font-semibold">{f.title}</h2>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              {f.body}
            </p>
          </div>
        ))}
      </section>

      <nav aria-label="Languages" className="pb-10 text-center text-xs" style={{ color: "var(--muted)" }}>
        <span className="mr-2">🌐</span>
        {LANDING_LOCALES.map((l, i) => (
          <span key={l.locale}>
            {i > 0 && <span className="mx-1">·</span>}
            {l.locale === copy.locale ? (
              <span className="font-semibold" style={{ color: "var(--text)" }}>
                {l.nativeName}
              </span>
            ) : (
              <Link
                href={l.locale === "en" ? "/" : `/welcome/${l.locale}`}
                className="hover:underline"
                lang={l.locale}
              >
                {l.nativeName}
              </Link>
            )}
          </span>
        ))}
      </nav>
    </div>
  );
}
