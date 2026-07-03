import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Server-side truth check — the RPC re-derives auth.uid(), never trusts the client. */
export async function isPlatformAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("is_platform_admin");
  return data === true;
}

/** Call at the top of any /admin page or layout. */
export async function requireAdmin() {
  if (!(await isPlatformAdmin())) redirect("/");
}
