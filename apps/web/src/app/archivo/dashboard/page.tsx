"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { api } from "@/lib/api";
import { HowToBox, PageIntro } from "@/components/page-intro";

type SearchHit = {
  id: string;
  title: string;
  plate: string | null;
  documentNumber: string | null;
  digitalPdf: string | null;
  locationLabel: string | null;
  custodyStatus: string;
  pendingDigitization: boolean;
  docType: string;
};

type Dashboard = {
  pendingDigitization: Array<{
    id: string;
    title: string;
    plate: string | null;
    documentNumber: string | null;
    locationLabel: string | null;
    updatedAt: string;
  }>;
  loansOnHand: Array<{
    loanId: string;
    documentId: string;
    title: string;
    borrowerName: string | null;
    checkedOutAt: string;
    dueAt: string | null;
    daysOut: number;
    overdue: boolean;
    locationLabel: string | null;
  }>;
  inventory: Array<{
    id: string;
    sku: string;
    name: string;
    unit: string;
    quantity: number;
    minStock: number;
    critical: boolean;
  }>;
};

export default function ArchivoDashboardPage() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [searching, setSearching] = useState(false);

  const loadDash = useCallback(async () => {
    setError("");
    try {
      const d = await api<Dashboard>("/api/v1/archivo/dashboard");
      setDash(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Uplink archivo fallido");
    }
  }, []);

  useEffect(() => {
    void loadDash();
  }, [loadDash]);

  async function onSearch(e?: FormEvent) {
    e?.preventDefault();
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    setSearching(true);
    setError("");
    try {
      const res = await api<SearchHit[]>(
        `/api/v1/archivo/search?q=${encodeURIComponent(q.trim())}`,
      );
      setHits(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Búsqueda fallida");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-5">
      <PageIntro module="archivo" title="Archivo y Papelería" />
      <HowToBox
        steps={[
          "Busca por placa, cédula o contrato: retorna PDF digital + ubicación física.",
          "Pendientes de digitalizar y carpetas en préstamo quedan a la izquierda.",
          "Inventario administrativo a la derecha — stock ≤ mínimo en alerta crítica.",
        ]}
      />

      {error ? (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-300">
          {error}
        </p>
      ) : null}

      {/* Buscador universal */}
      <form onSubmit={onSearch} className="space-y-3">
        <label className="sr-only" htmlFor="archivo-search">
          Búsqueda universal
        </label>
        <input
          id="archivo-search"
          data-testid="archivo-universal-search"
          className="w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-5 py-4 text-lg text-[var(--text-primary)] shadow-[0_10px_30px_rgba(0,0,0,0.04)] outline-none ring-[var(--brand-accent)] placeholder:text-[var(--text-secondary)] focus:ring-2"
          placeholder="Placa · Cédula · Contrato…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="flex gap-2">
          <Button type="submit" disabled={searching}>
            {searching ? "Buscando…" : "Buscar"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => void loadDash()}>
            Refrescar bandejas
          </Button>
        </div>
      </form>

      {hits.length > 0 ? (
        <section className="space-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">
            Resultados ({hits.length})
          </h2>
          <ul className="divide-y divide-[var(--border-subtle)]">
            {hits.map((h) => (
              <li key={h.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div>
                  <p className="font-medium text-[var(--text-primary)]">{h.title}</p>
                  <p className="mt-1 font-mono text-xs text-[var(--text-secondary)]">
                    {h.plate || "—"} · {h.documentNumber || "—"} · {h.docType}
                  </p>
                  <p className="mt-1 font-mono text-xs text-[var(--text-primary)]">
                    {h.locationLabel || "Sin ubicación física"}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {h.digitalPdf ? (
                    <Badge tone="emerald">PDF indexado</Badge>
                  ) : (
                    <Badge tone="amber">Sin PDF</Badge>
                  )}
                  {h.custodyStatus === "ON_LOAN" ? (
                    <Badge tone="rose">En préstamo</Badge>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        {/* Izquierda */}
        <div className="space-y-5">
          <section id="pendientes" className="space-y-2">
            <h2 className="font-display text-sm font-semibold text-[var(--text-primary)]">
              Documentos pendientes de digitalizar
            </h2>
            <div className="space-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
              {(dash?.pendingDigitization || []).map((p) => (
                <article
                  key={p.id}
                  className="rounded-lg border border-[var(--border-subtle)]/70 px-3 py-2"
                >
                  <p className="text-sm text-[var(--text-primary)]">{p.title}</p>
                  <p className="font-mono text-[10px] text-[var(--text-secondary)]">
                    {p.plate || p.documentNumber || "—"} ·{" "}
                    {p.locationLabel || "Sin ubicación"}
                  </p>
                </article>
              ))}
              {!dash?.pendingDigitization?.length ? (
                <p className="px-1 py-3 text-sm text-[var(--text-secondary)]">
                  Bandeja vacía
                </p>
              ) : null}
            </div>
          </section>

          <section id="prestamos" className="space-y-2">
            <h2 className="font-display text-sm font-semibold text-[var(--text-primary)]">
              Carpetas en préstamo
            </h2>
            <div className="space-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
              {(dash?.loansOnHand || []).map((l) => (
                <article
                  key={l.loanId}
                  className="rounded-lg border border-[var(--border-subtle)]/70 px-3 py-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm text-[var(--text-primary)]">{l.title}</p>
                    {l.overdue ? (
                      <Badge tone="rose">{l.daysOut}d</Badge>
                    ) : (
                      <Badge tone="amber">{l.daysOut}d</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    {l.borrowerName || "Solicitante"} ·{" "}
                    {l.locationLabel || "Sin ubicación"}
                  </p>
                </article>
              ))}
              {!dash?.loansOnHand?.length ? (
                <p className="px-1 py-3 text-sm text-[var(--text-secondary)]">
                  Sin préstamos activos
                </p>
              ) : null}
            </div>
          </section>
        </div>

        {/* Derecha — inventario */}
        <section id="inventario" className="space-y-2">
          <h2 className="font-display text-sm font-semibold text-[var(--text-primary)]">
            Inventario administrativo
          </h2>
          <div className="space-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
            {(dash?.inventory || []).map((i) => (
              <article
                key={i.id}
                className={`rounded-lg border px-3 py-2 ${
                  i.critical
                    ? "border-rose-500/40 bg-rose-500/10"
                    : "border-[var(--border-subtle)]/70"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-[var(--text-primary)]">{i.name}</p>
                  {i.critical ? <Badge tone="rose">Crítico</Badge> : null}
                </div>
                <p className="mt-1 font-mono text-xs text-[var(--text-secondary)]">
                  {i.sku} · {i.quantity}/{i.minStock} {i.unit}
                </p>
              </article>
            ))}
            {!dash?.inventory?.length ? (
              <p className="px-1 py-3 text-sm text-[var(--text-secondary)]">
                Sin ítems cargados
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
