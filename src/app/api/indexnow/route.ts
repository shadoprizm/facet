import { NextResponse, type NextRequest } from "next/server";
import { LANDING_LOCALES, SITE_URL } from "@/lib/i18n/landing";
import { createClient } from "@/lib/supabase/server";

/**
 * Submits every public URL to IndexNow (https://www.indexnow.org), which
 * fans out to all participating engines: Bing, Yandex, Naver, Seznam, Yep.
 * Invoked daily by the Vercel cron in vercel.json, authenticated with the
 * Authorization: Bearer <CRON_SECRET> header.
 *
 * Since migration 20260815193000 the community surface is crawlable, so this
 * pushes Rooms and threads too — that is what makes new discussion reachable
 * within a day instead of whenever a crawler next wanders in.
 *
 * Google does not support IndexNow — Google discovery happens via the
 * sitemap registered in Search Console (see docs/LAUNCH-PLAYBOOK.md).
 */

const INDEXNOW_KEY = "7e3941ae7bb8eb9589bad832f9294472";

// IndexNow accepts at most 10,000 URLs per submission.
const MAX_ROOMS = 500;
const MAX_POSTS = 2000;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const noStoreHeaders = { "Cache-Control": "private, no-store" };

  if (!secret) {
    return NextResponse.json(
      { error: "service unavailable" },
      { status: 503, headers: noStoreHeaders },
    );
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: noStoreHeaders },
    );
  }

  const urlList = [
    `${SITE_URL}/`,
    `${SITE_URL}/login`,
    `${SITE_URL}/llms.txt`,
    ...LANDING_LOCALES.filter((l) => l.locale !== "en").map(
      (l) => `${SITE_URL}/welcome/${l.locale}`
    ),
  ];

  // Read through the anon key so this submits exactly what a crawler can
  // fetch. A database failure must not sink the landing-page submission.
  try {
    const supabase = await createClient();
    const [{ data: rooms }, { data: posts }] = await Promise.all([
      supabase
        .from("rooms_public")
        .select("slug")
        .order("created_at", { ascending: false })
        .limit(MAX_ROOMS),
      supabase
        .from("posts")
        .select("id")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(MAX_POSTS),
    ]);
    for (const room of rooms ?? []) urlList.push(`${SITE_URL}/r/${room.slug}`);
    for (const post of posts ?? []) urlList.push(`${SITE_URL}/post/${post.id}`);
  } catch {
    // Fall through with the landing pages alone.
  }

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

  return NextResponse.json(
    {
      submitted: urlList.length,
      indexnowStatus: res.status,
      at: new Date().toISOString(),
    },
    { headers: noStoreHeaders },
  );
}
