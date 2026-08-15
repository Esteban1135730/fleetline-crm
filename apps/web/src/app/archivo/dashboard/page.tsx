"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { FileArchive, Search } from "lucide-react";
import { api } from "@/lib/api";
import { PageIntro } from "@/components/page-intro";
import { EmptyState } from "@/components/audit";

type SearchHit = {
  kind?: "document" | "vehicle" | "driver" | "employee" | "customer";
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

const KIND_LABEL: Record<NonNullable<SearchHit["kind"]>, string> = {
  vehicle: "Unidad",
  driver: "Conductor",
  employee: "Personal",
  customer: "Cliente",
  document: "Expediente",
};

function hitKind(h: SearchHit): NonNullable<SearchHit["kind"]> {
  return h.kind || "document";
}

export default function ArchivoDashboardPage() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    function onDoc(ev: MouseEvent) {
      if (!boxRef.current?.contains(ev.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const runSearch = useCallback(async (term: string) => {
    const needle = term.trim();
    if (needle.length < 2) {
      setHits([]);
      setSearched(false);
      setOpen(false);
      return;
    }
    setSearching(true);
    setError("");
    try {
      const res = await api<SearchHit[]>(
        `/api/v1/archivo/search?q=${encodeURIComponent(needle)}`,
      );
      const list = Array.isArray(res) ? res : [];
      setHits(list);
      setSearched(true);
      setOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Búsqueda fallida");
      setHits([]);
      setSearched(true);
      setOpen(true);
    } finally {
      setSearching(false);
    }
  }, []);

  function onQueryChange(value: string) {
    setQ(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runSearch(value);
    }, 220);
  }

  function onSearch(e?: FormEvent) {
    e?.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    void runSearch(q);
  }

  function pickHit(h: SearchHit) {
    const label = h.plate || h.documentNumber || h.title;
    setQ(label);
    setHits([h]);
    setSearched(true);
    setOpen(false);
  }

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-5">
      <PageIntro module="archivo" title="Archivo y Papelería" />

      {error ? (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-300">
          {error}
        </p>
      ) : null}

      <form onSubmit={onSearch} className="space-y-3">
        <div ref={boxRef} className="relative">
          <label className="sr-only" htmlFor="archivo-search">
            Búsqueda universal por placa o cédula
          </label>
          <input
            id="archivo-search"
            type="search"
            data-field="skip"
            autoComplete="off"
            data-testid="archivo-universal-search"
            className="w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-5 py-4 text-lg text-[var(--text-primary)] shadow-[0_10px_30px_rgba(0,0,0,0.04)] outline-none ring-[var(--brand-accent)] placeholder:text-[var(--text-secondary)] focus:ring-2"
            placeholder="Placa · Cédula · Contrato…"
            value={q}
            onChange={(e) => onQueryChange(e.target.value)}
            onFocus={() => {
              if (hits.length || searched) setOpen(true);
            }}
          />
          {open && q.trim().length >= 2 ? (
            <ul
              className="absolute z-40 mt-1 max-h-80 w-full overflow-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1,#121722)] shadow-[0_16px_40px_rgba(0,0,0,0.35)]"
              role="listbox"
            >
              {searching ? (
                <li className="px-4 py-3 text-sm text-[var(--text-secondary)]">
                  Buscando en flota, personal y bóveda…
                </li>
              ) : null}
              {!searching && searched && hits.length === 0 ? (
                <li className="px-4 py-3 text-sm text-[var(--text-secondary)]">
                  Sin coincidencias para «{q.trim()}». Revise placa o cédula en
                  Taller / RRHH.
                </li>
              ) : null}
              {!searching
                ? hits.map((h) => (
                    <li key={`${hitKind(h)}-${h.id}`}>
                      <button
                        type="button"
                        role="option"
                        className="flex w-full items-start justify-between gap-3 px-4 py-2.5 text-left hover:bg-[var(--accent-primary)]/10"
                        onClick={() => pickHit(h)}
                      >
                        <span>
                          <span className="block text-sm font-medium text-[var(--text-primary)]">
                            {h.title}
                          </span>
                          <span className="mt-0.5 block font-data text-[11px] text-[var(--text-secondary)]">
                            {KIND_LABEL[hitKind(h)]} ·{" "}
                            {h.plate || h.documentNumber || h.docType}
                            {h.locationLabel ? ` · ${h.locationLabel}` : ""}
                          </span>
                        </span>
                        {h.digitalPdf ? (
                          <Badge tone="emerald">PDF</Badge>
                        ) : hitKind(h) === "document" ? (
                          <Badge tone="amber">Sin PDF</Badge>
                        ) : null}
                      </button>
                    </li>
                  ))
                : null}
            </ul>
          ) : null}
        </div>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            className="w-auto px-4 py-2"
            onClick={() => void loadDash()}
          >
            Refrescar bandejas
          </Button>
          <Button
            type="submit"
            className="w-auto px-4 py-2"
            disabled={searching}
          >
            <Search className="mr-1.5 inline h-4 w-4" aria-hidden />
            {searching ? "Buscando…" : "Buscar"}
          </Button>
        </div>
      </form>

      {searched && !open ? (
        hits.length > 0 ? (
          <section className="space-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Resultados ({hits.length})
            </h2>
            <ul className="divide-y divide-[var(--border-subtle)]">
              {hits.map((h) => (
                <li
                  key={`${hitKind(h)}-${h.id}`}
                  className="flex flex-wrap items-start justify-between gap-3 py-3"
                >
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                      {KIND_LABEL[hitKind(h)]}
                    </p>
                    <p className="font-medium text-[var(--text-primary)]">
                      {h.title}
                    </p>
                    <p className="mt-1 font-data text-xs text-[var(--text-secondary)]">
                      {h.plate || "—"} · {h.documentNumber || "—"} · {h.docType}
                    </p>
                    <p className="mt-1 font-data text-xs text-[var(--text-primary)]">
                      {h.locationLabel || "Sin ubicación física"}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {h.digitalPdf ? (
                      <Badge tone="emerald">PDF indexado</Badge>
                    ) : hitKind(h) === "document" ? (
                      <Badge tone="amber">Sin PDF</Badge>
                    ) : (
                      <Badge tone="neutral">Maestro operativo</Badge>
                    )}
                    {h.custodyStatus === "ON_LOAN" ? (
                      <Badge tone="rose">En préstamo</Badge>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <EmptyState
            icon={<FileArchive className="h-7 w-7" />}
            title="Sin coincidencias"
            description="No hay unidad, conductor, personal ni expediente con esa placa o cédula."
          />
        )
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
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
                  <p className="font-data text-[10px] text-[var(--text-secondary)]">
                    {p.plate || p.documentNumber || "—"} ·{" "}
                    {p.locationLabel || "Sin ubicación"}
                  </p>
                </article>
              ))}
              {!dash?.pendingDigitization?.length ? (
                <EmptyState
                  icon={<FileArchive className="h-7 w-7" />}
                  title="Bandeja vacía"
                  description="No hay pendientes de digitalizar."
                />
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
                    <p className="text-sm text-[var(--text-primary)]">
                      {l.title}
                    </p>
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
                <EmptyState
                  icon={<FileArchive className="h-7 w-7" />}
                  title="Sin préstamos activos"
                  description="No hay carpetas en custodia externa."
                />
              ) : null}
            </div>
          </section>
        </div>

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
                <p className="mt-1 font-data text-xs text-[var(--text-secondary)]">
                  {i.sku} · {i.quantity}/{i.minStock} {i.unit}
                </p>
              </article>
            ))}
            {!dash?.inventory?.length ? (
              <EmptyState
                icon={<FileArchive className="h-7 w-7" />}
                title="Sin ítems cargados"
                description="El inventario de papelería está vacío."
              />
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
