import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Public growth counters (members, personas, rooms, posts, comments),
 * backed by the `public_stats` security-definer RPC. Used by the daily
 * marketing routine to track progress toward launch goals.
 */
export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("public_stats");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
  });
}
