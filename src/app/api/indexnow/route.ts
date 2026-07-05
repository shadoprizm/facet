import { NextResponse, type NextRequest } from "next/server";
import { LANDING_LOCALES, SITE_URL } from "@/lib/i18n/landing";

/**
 * Submits every public URL to IndexNow (https://www.indexnow.org), which
 * fans out to all participating engines: Bing, Yandex, Naver, Seznam, Yep.
 * Invoked daily by the Vercel cron in vercel.json; can also be triggered
 * manually with ?secret=<CRON_SECRET>.
 *
 * Google does not support IndexNow — Google discovery happens via the
 * sitemap registered in Search Console (see docs/LAUNCH-PLAYBOOK.md).
 */

const INDEXNOW_KEY = "7e3941ae7bb8eb9589bad832f9294472";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authorized =
    !secret ||
    request.headers.get("authorization") === `Bearer ${secret}` ||
    request.nextUrl.searchParams.get("secret") === secret;
  if (!authorized) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const urlList = [
    `${SITE_URL}/`,
    `${SITE_URL}/login`,
    `${SITE_URL}/llms.txt`,
    ...LANDING_LOCALES.filter((l) => l.locale !== "en").map(
      (l) => `${SITE_URL}/welcome/${l.locale}`
    ),
  ];

  const res = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host: new URL(SITE_URL).host,
      key: INDEXNOW_KEY,
      keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`,
      urlList,
    }),
  });

  return NextResponse.json({
    submitted: urlList.length,
    indexnowStatus: res.status,
    at: new Date().toISOString(),
  });
}
