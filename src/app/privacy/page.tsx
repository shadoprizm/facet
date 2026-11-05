import type { Metadata } from "next";
import { SITE_URL } from "@/lib/i18n/landing";

// DRAFT legal wording for owner review (not reviewed by a lawyer). It describes only what the code does today.
// Update LAST_UPDATED whenever the text or the tracking changes.
const LAST_UPDATED = "5 November 2026";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "What Facet collects when you create an account, post, or visit the public pages, and which service providers help run it.",
  alternates: { canonical: `${SITE_URL}/privacy` },
};

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-2xl space-y-6 py-6 text-sm leading-relaxed">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Privacy</h1>
        <p className="text-[var(--muted)]">Last updated {LAST_UPDATED}.</p>
      </header>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Accounts and your root</h2>
        <p>
          To join Facet you create a root account with an email address and a password, or you sign in with a magic
          link sent to your email. We use the email to verify that you exist and to enforce bans and other abuse
          rules. It is not shown to other members. Sign-in is handled by Supabase, our authentication and database
          provider.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Personas and what you post</h2>
        <p>
          In public you act through personas. A persona&rsquo;s name, avatar, bio, karma, posts, comments and votes
          are visible to anyone, including people who are not signed in and search engines. Images you attach to a
          post or avatar are stored with Supabase and are public. Your root account is not shown on personas.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Cookies and browser storage</h2>
        <p>
          Signing in sets session cookies that keep you signed in. Your light or dark theme choice is saved in your
          browser. The website analytics described below are not used to set cookies.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Website analytics</h2>
        <p>
          This website uses PostHog, a product analytics service, to understand how the public pages are used. We
          measure page views of the home page, the language pages, this page, and public room, post and persona
          pages, and clicks on the Create your account and Sign in links. A persona page is counted without the
          persona&rsquo;s name. Analytics events are not sent from pages that require signing in, such as your account,
          notifications, admin pages and the sign-in page.
        </p>
        <p>
          We do not send account identifiers, persona handles or page titles to analytics, and we do not identify
          visitors. PostHog may associate page views from the same browser session. Page addresses and referrers
          keep their path and only standard campaign tags that are short plain labels; other query values are
          removed. Analytics data is processed in the US. IP addresses may be processed by PostHog.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Service providers</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Supabase: sign-in, database and file storage.</li>
          <li>Vercel: hosting of this website.</li>
          <li>PostHog: website analytics, as described above.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Changes</h2>
        <p>
          We may update this page from time to time. The date above shows the last change, and where the law requires
          it we will tell you directly.
        </p>
      </section>
    </article>
  );
}
