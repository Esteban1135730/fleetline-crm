"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { Button } from "@fsg/ui";
import { API_URL, api, getTokenPublic } from "@/lib/api";

type ChatMsg = {
  id: string;
  body: string;
  authorName: string;
  authorRole: string;
  serverTime?: string;
  createdAt?: string;
};

export function OpsChatPanel({
  mode,
  tripId,
  tripCode,
}: {
  mode: "trip" | "support";
  tripId?: string | null;
  tripCode?: string;
}) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const path =
    mode === "support"
      ? "/api/v1/chat/soporte-general"
      : tripId
        ? `/api/v1/chat/viaje/${tripId}`
        : null;

  const load = useCallback(async () => {
    if (!path) {
      setMessages([]);
      return;
    }
    try {
      const rows = await api<ChatMsg[]>(path);
      setMessages(rows);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chat offline");
    }
  }, [path]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const token = getTokenPublic();
    if (!token) return;
    const socket = io(`${API_URL}/logistics`, {
      auth: { token },
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;
    if (mode === "trip" && tripId) socket.emit("joinTrip", { tripId });

    socket.on("chat.trip", (payload: { tripId?: string; message?: ChatMsg }) => {
      if (mode !== "trip" || !payload?.message) return;
      if (payload.tripId && tripId && payload.tripId !== tripId) return;
      setMessages((prev) =>
        prev.some((m) => m.id === payload.message!.id)
          ? prev
          : [...prev, payload.message!],
      );
    });
    socket.on("chat.support", (payload: { message?: ChatMsg }) => {
      if (mode !== "support" || !payload?.message) return;
      setMessages((prev) =>
        prev.some((m) => m.id === payload.message!.id)
          ? prev
          : [...prev, payload.message!],
      );
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [mode, tripId]);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!path || !text.trim()) return;
    setSending(true);
    setError("");
    try {
      const msg = await api<ChatMsg>(path, {
        method: "POST",
        body: JSON.stringify({ body: text.trim() }),
      });
      setMessages((prev) =>
        prev.some((m) => m.id === msg.id) ? prev : [...prev, msg],
      );
      setText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se envió");
    } finally {
      setSending(false);
    }
  }

  const title =
    mode === "support"
      ? "Chat soporte · flota / app"
      : tripCode
        ? `Chat servicio ${tripCode}`
        : "Chat del servicio";

  return (
    <div className="fsg-panel flex h-[360px] flex-col overflow-hidden">
      <div className="border-b border-[var(--brand-line)] px-3 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--brand-muted)]">
          {title}
        </p>
        <p className="text-[10px] text-[var(--brand-muted)]">
          Tiempo real con la app móvil (mismo canal)
        </p>
      </div>

      {!path ? (
        <div className="flex flex-1 items-center justify-center p-4 text-sm text-[var(--brand-muted)]">
          Selecciona un servicio para abrir su chat.
        </div>
      ) : (
        <>
          <ul className="flex-1 space-y-2 overflow-auto px-3 py-2">
            {messages.length === 0 ? (
              <li className="text-sm text-[var(--brand-muted)]">
                Sin mensajes — escribe el primer uplink.
              </li>
            ) : (
              messages.map((m) => (
                <li
                  key={m.id}
                  className="rounded border border-[var(--brand-line)] bg-black/10 px-2 py-1.5"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-semibold text-[var(--brand-primary)]">
                      {m.authorName}
                      <span className="ml-1 font-data text-[10px] text-[var(--brand-muted)]">
                        {m.authorRole}
                      </span>
                    </span>
                    <span className="font-data text-[10px] text-[var(--brand-muted)]">
                      {new Date(
                        m.serverTime || m.createdAt || Date.now(),
                      ).toLocaleTimeString("es-CO", { hour12: false })}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-[var(--brand-fg)]">{m.body}</p>
                </li>
              ))
            )}
            <div ref={bottomRef} />
          </ul>
          {error ? (
            <p className="px-3 text-xs text-[var(--brand-signal)]">{error}</p>
          ) : null}
          <form
            onSubmit={send}
            className="flex gap-2 border-t border-[var(--brand-line)] p-2"
          >
            <input
              className="field flex-1"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Mensaje operativo…"
              maxLength={4000}
            />
            <Button type="submit" variant="primary" disabled={sending || !text.trim()}>
              Enviar
            </Button>
          </form>
        </>
      )}
    </div>
  );
}
