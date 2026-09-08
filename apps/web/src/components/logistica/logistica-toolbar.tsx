"use client";

import { Search } from "lucide-react";

export type FleetStatusFilter = "ALL" | "IN_TRANSIT" | "WORKSHOP" | "STOPPED";

const FILTERS: { id: FleetStatusFilter; label: string }[] = [
  { id: "ALL", label: "Todos" },
  { id: "IN_TRANSIT", label: "En ruta" },
  { id: "WORKSHOP", label: "En taller" },
  { id: "STOPPED", label: "Detenido" },
];

type LogisticaToolbarProps = {
  statusFilter: FleetStatusFilter;
  onStatusFilter: (f: FleetStatusFilter) => void;
  search: string;
  onSearch: (q: string) => void;
  trailing?: React.ReactNode;
};

/** Barra táctica compacta — filtros semáforo + búsqueda placa/conductor. */
export function LogisticaToolbar({
  statusFilter,
  onStatusFilter,
  search,
  onSearch,
  trailing,
}: LogisticaToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2" data-tour="toolbar">
      <div className="flex flex-wrap items-center gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onStatusFilter(f.id)}
            className={`rounded-md border px-2.5 py-1 font-data text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors duration-150 ${
              statusFilter === f.id
                ? "border-brand-border-active bg-brand-primary/10 text-brand-primary"
                : "border-brand-border text-brand-text-secondary hover:border-brand-border-active hover:bg-brand-surface-hover"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="relative min-w-[10rem] flex-1 sm:max-w-xs">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-brand-text-secondary"
          aria-hidden
        />
        <input
          className="field w-full py-1.5 pl-8 pr-2 font-data text-xs"
          placeholder="Placa, conductor, código…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          aria-label="Buscar despachos"
        />
      </div>

      {trailing ? <div className="ml-auto flex shrink-0 items-center gap-2">{trailing}</div> : null}
    </div>
  );
}
