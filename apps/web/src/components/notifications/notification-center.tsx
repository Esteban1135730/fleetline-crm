"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useNotifications } from "@/lib/notifications-context";

export function NotificationBell() {
  const router = useRouter();
  const {
    items,
    unread,
    markRead,
    markAllRead,
    enableWebPush,
    webPushSupported,
    refresh,
  } = useNotifications();
  const [open, setOpen] = useState(false);
  const [pushMsg, setPushMsg] = useState("");
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        className="flt-help-btn relative"
        aria-label="Centro de notificaciones"
        title="Centro de notificaciones"
        onClick={() => {
          setOpen((v) => !v);
          void refresh();
        }}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0v1a3 3 0 1 1-6 0v-1m6 0H9"
          />
        </svg>
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--brand-signal,#FF2A5F)] px-1 font-data text-[9px] text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-[min(92vw,360px)] overflow-hidden rounded-lg border border-[var(--brand-line)] bg-[var(--brand-surface,#121722)] shadow-xl">
          <div className="flex items-center justify-between border-b border-[var(--brand-line)] px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--brand-muted)]">
              Inbox · alertas
            </p>
            <button
              type="button"
              className="text-[11px] text-[var(--brand-primary)]"
              onClick={() => void markAllRead()}
            >
              Marcar leídas
            </button>
          </div>

          {webPushSupported ? (
            <div className="border-b border-[var(--brand-line)] px-3 py-2">
              <button
                type="button"
                className="text-[11px] font-semibold text-[var(--brand-amber,#FFB800)]"
                onClick={() => {
                  void enableWebPush().then((r) => setPushMsg(r.message));
                }}
              >
                Activar Web Push del navegador
              </button>
              {pushMsg ? (
                <p className="mt-1 text-[10px] text-[var(--brand-muted)]">
                  {pushMsg}
                </p>
              ) : null}
            </div>
          ) : null}

          <ul className="max-h-[420px] overflow-auto">
            {items.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-[var(--brand-muted)]">
                Sin notificaciones
              </li>
            ) : (
              items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={`w-full border-b border-[var(--brand-line)] px-3 py-2.5 text-left hover:bg-[var(--brand-primary)]/10 ${
                      n.readAt ? "opacity-70" : ""
                    }`}
                    onClick={() => {
                      void markRead(n.id);
                      if (n.href) {
                        setOpen(false);
                        router.push(n.href);
                      }
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-[var(--brand-fg,#F8FAFC)]">
                        {n.title}
                      </p>
                      {!n.readAt ? (
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--brand-primary)]" />
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--brand-muted)]">
                      {n.body}
                    </p>
                    <p className="mt-1 font-data text-[10px] text-[var(--brand-muted)]">
                      {n.kind} ·{" "}
                      {new Date(n.createdAt).toLocaleString("es-CO", {
                        hour12: false,
                      })}
                    </p>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function NotificationToasts() {
  const { toasts, dismissToast, markRead } = useNotifications();
  const router = useRouter();

  if (!toasts.length) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(92vw,360px)] flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.toastId}
          className="pointer-events-auto rounded-lg border border-[var(--brand-line)] bg-[var(--brand-surface,#121722)] p-3 shadow-2xl"
          role="status"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-[var(--brand-fg)]">
                {t.title}
              </p>
              <p className="mt-1 text-xs text-[var(--brand-muted)]">{t.body}</p>
            </div>
            <button
              type="button"
              className="text-[var(--brand-muted)]"
              onClick={() => dismissToast(t.toastId)}
              aria-label="Cerrar"
            >
              ×
            </button>
          </div>
          <div className="mt-2 flex gap-2">
            {t.href ? (
              <button
                type="button"
                className="text-[11px] font-semibold text-[var(--brand-primary)]"
                onClick={() => {
                  void markRead(t.id);
                  dismissToast(t.toastId);
                  router.push(t.href!);
                }}
              >
                Abrir
              </button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
