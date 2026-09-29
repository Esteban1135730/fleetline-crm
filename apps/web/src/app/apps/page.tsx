"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button } from "@fsg/ui";
import { api } from "@/lib/api";

type Overview = {
  channels: { id: string; name: string; status: string; metric: string }[];
  openTickets: number;
  visitorsOnSite: number;
  note?: string;
};

type Row = Record<string, string | null>;

type Inbox = {
  mensajes: { id: string; canal: string; quien: string; texto: string; at: string }[];
  tickets: { id: string; code: string; subject: string; message: string; status: string }[];
};

const CARDS = [
  { id: "conductores", title: "Conductores activos" },
  { id: "clientes", title: "Clientes" },
  { id: "operativos", title: "Personal operaciones" },
  { id: "viajes", title: "Viajes en curso" },
  { id: "tickets", title: "Tickets abiertos" },
  { id: "visitantes", title: "Visitantes en sede" },
] as const;

export default function AppsPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [card, setCard] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");

  function loadInbox() {
    return api<Inbox>("/apps/inbox").then(setInbox).catch(() => setInbox(null));
  }

  useEffect(() => {
    api<Overview>("/apps/overview").then(setData).catch(console.error);
    void loadInbox();
  }, []);

  async function openCard(id: string) {
    setError("");
    if (card === id) {
      setCard(null);
      setRows([]);
      return;
    }
    setCard(id);
    try {
      const list = await api<Row[]>(`/apps/drill?card=${id}`);
      setRows(list);
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : "Sin detalle");
    }
  }

  async function closeTicket(id: string) {
    await api(`/apps/tickets/${id}/close`, { method: "POST" });
    if (card === "tickets") {
      const list = await api<Row[]>("/apps/drill?card=tickets");
      setRows(list);
    }
    const overview = await api<Overview>("/apps/overview");
    setData(overview);
    await loadInbox();
  }

  async function onReply(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api("/apps/inbox", { method: "POST", body: JSON.stringify({ body: reply }) });
      setReply("");
      await loadInbox();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se envió");
    }
  }

  function metricFor(id: string) {
    if (id === "tickets") return String(data?.openTickets ?? "—");
    if (id === "visitantes") return String(data?.visitorsOnSite ?? "—");
    const ch = data?.channels.find((c) => c.id === id);
    return ch?.metric ?? "—";
  }

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <header>
        <h1 className="font-sans text-xl font-semibold tracking-tight text-brand-text-primary">
          Canales operativos
        </h1>
      </header>

      {data?.note ? (
        <p className="text-sm text-[var(--brand-text-secondary)]">{data.note}</p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CARDS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => void openCard(c.id)}
            className={`nexa-panel p-4 text-left ${card === c.id ? "nexa-panel-active" : ""}`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--brand-text-secondary)]">
              {c.title}
            </p>
            <p className="mt-2 font-data text-lg font-bold text-[var(--brand-primary)]">
              {metricFor(c.id)}
            </p>
          </button>
        ))}
      </div>

      {card ? (
        <section className="nexa-panel p-4">
          <h2 className="font-display text-sm font-semibold">
            {CARDS.find((c) => c.id === card)?.title}
          </h2>
          {rows.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--brand-text-secondary)]">Sin registros.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {rows.map((row) => (
                <li key={String(row.id)} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>{lineOf(row)}</span>
                  {card === "tickets" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-auto px-2 py-1 text-xs"
                      onClick={() => void closeTicket(String(row.id))}
                    >
                      Cerrar
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      <section className="nexa-panel p-4">
        <h2 className="font-display text-sm font-semibold">Bandeja</h2>
        <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto">
          {(inbox?.mensajes || []).map((m) => (
            <li key={m.id} className="text-sm">
              <span className="font-data text-[10px] uppercase text-[var(--brand-primary)]">{m.canal}</span>{" "}
              <span className="text-[var(--brand-text-primary)]">{m.quien}:</span>{" "}
              <span className="text-[var(--brand-text-secondary)]">{m.texto}</span>
            </li>
          ))}
          {(inbox?.tickets || []).map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2 text-sm">
              <span>
                <span className="font-data text-[10px] uppercase text-[var(--brand-primary)]">{t.code}</span>{" "}
                {t.subject}
              </span>
              <Button
                type="button"
                variant="ghost"
                className="w-auto px-2 py-1 text-xs"
                onClick={() => void closeTicket(t.id)}
              >
                Cerrar
              </Button>
            </li>
          ))}
          {!inbox?.mensajes.length && !inbox?.tickets.length ? (
            <li className="text-sm text-[var(--brand-text-secondary)]">Sin mensajes guardados.</li>
          ) : null}
        </ul>
        <form className="mt-3 flex flex-wrap items-center justify-end gap-2" onSubmit={onReply}>
          <input
            className="field min-w-[16rem] flex-1"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Responder en el chat de soporte"
          />
          <Button type="submit" variant="primary" className="w-auto px-4 py-2">
            Enviar
          </Button>
        </form>
        {error ? <p className="mt-2 text-sm text-[var(--brand-danger)]">{error}</p> : null}
      </section>
    </div>
  );
}

function lineOf(row: Row) {
  return (
    row.name ||
    row.subject ||
    [row.code, row.origin, row.destination].filter(Boolean).join(" · ") ||
    row.nit ||
    row.document ||
    row.id ||
    "—"
  );
}
