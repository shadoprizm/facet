"use client";
// Loads PostHog only on public pages, and only when NEXT_PUBLIC_POSTHOG_KEY and NEXT_PUBLIC_POSTHOG_HOST
// are configured. See src/lib/analytics.ts for what is (not) sent.
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import type { PostHog } from "posthog-js";
import { analyticsEnabled, clickEvent, isTrackedPath, posthogConfig } from "@/lib/analytics";

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST;

export default function WebsiteAnalytics() {
  const pathname = usePathname();
  const client = useRef<PostHog | null>(null);
  const tracked = isTrackedPath(pathname ?? "");

  // Initialize lazily, the first time a visitor is on a public page. A visitor who lands directly on
  // /login, /me or an admin page never loads PostHog; events from those pages are dropped in beforeSend.
  useEffect(() => {
    if (!tracked || client.current || !analyticsEnabled({ key: KEY, host: HOST })) return;
    let cancelled = false;
    import("posthog-js").then(({ default: posthog }) => {
      if (cancelled || client.current) return;
      posthog.init(KEY!, posthogConfig(HOST!));
      client.current = posthog;
    }).catch(() => {
      // Analytics must never prevent the site from working.
    });
    return () => { cancelled = true; };
  }, [tracked]);

  // Capture phase: links navigate before a bubbling listener would run, so the click is recorded first.
  useEffect(() => {
    function onClick(event: MouseEvent) {
      const el = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-event]") : null;
      const captured = el ? clickEvent(el.dataset) : null;
      if (captured && client.current) client.current.capture(...captured);
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
