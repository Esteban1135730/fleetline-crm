"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import {
  getOrCreateQaSessionId,
  isQaTraceClientEnabled,
} from "@/lib/qa-trace";

/**
 * Envía cambios de ruta al backend QA Trace (staging).
 * Silencioso: errores no interrumpen la UI.
 */
export function useQaTraceBeacon() {
  const pathname = usePathname();
  const { user } = useAuth();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (!user || !isQaTraceClientEnabled()) return;
    if (!pathname || pathname === "/login") return;
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;

    const sessionId = getOrCreateQaSessionId();
    void api
      .post(
        "/api/v1/qa-trace/events",
        {
          sessionId,
          kind: "route",
          path: pathname,
          meta: { source: "web_beacon" },
        },
        { confirm: { skip: true } },
      )
      .catch(() => undefined);
  }, [pathname, user]);

  useEffect(() => {
    if (!user || !isQaTraceClientEnabled()) return;
    const onHide = () => {
      if (document.visibilityState !== "hidden") return;
      const sessionId = getOrCreateQaSessionId();
      const token = localStorage.getItem("fsg_token");
      if (!token) return;
      const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
      void fetch(`${base}/api/v1/qa-trace/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          sessionId,
          kind: "heartbeat",
          path: window.location.pathname,
          meta: { visibility: "hidden" },
        }),
        keepalive: true,
      }).catch(() => undefined);
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [user]);
}
