"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

function getOrCreateSessionId(): string {
  try {
    let sid = localStorage.getItem("_sid");
    if (!sid) {
      sid = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem("_sid", sid);
    }
    return sid;
  } catch {
    return Math.random().toString(36).slice(2);
  }
}

export function Tracker() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    sessionIdRef.current = getOrCreateSessionId();
  }, []);

  useEffect(() => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    const userId = (session?.user as { id?: string } | undefined)?.id ?? undefined;

    fetch("/api/track/pageview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: pathname, sessionId: sid, referrer: document.referrer || null, userId }),
    }).catch(() => {});
  }, [pathname, session]);

  useEffect(() => {
    const sid = sessionIdRef.current;
    if (!sid) return;

    const interval = setInterval(() => {
      const userId = (session?.user as { id?: string } | undefined)?.id ?? undefined;
      fetch("/api/track/heartbeat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: sid, path: window.location.pathname, userId }),
      }).catch(() => {});
    }, 30000);

    return () => clearInterval(interval);
  }, [session]);

  useEffect(() => {
    const sid = sessionIdRef.current ?? "";

    function handleError(event: ErrorEvent) {
      fetch("/api/track/error", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          path: window.location.pathname,
          errorType: event.error?.name ?? "Error",
          errorMessage: event.message,
          stackTrace: event.error?.stack ?? null,
          sessionId: sid,
        }),
      }).catch(() => {});
    }

    function handleUnhandledRejection(event: PromiseRejectionEvent) {
      fetch("/api/track/error", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          path: window.location.pathname,
          errorType: "UnhandledRejection",
          errorMessage: String(event.reason),
          stackTrace: event.reason?.stack ?? null,
          sessionId: sid,
        }),
      }).catch(() => {});
    }

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  return null;
}
