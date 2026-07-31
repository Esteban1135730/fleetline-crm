"use client";

import type { ReactNode } from "react";
import { Tooltip } from "@fsg/ui";

export type WorkbenchTab = {
  id: string;
  label: string;
  count?: number;
  tip?: string;
};

export function WorkbenchTabs({
  tabs,
  value,
  onChange,
}: {
  tabs: WorkbenchTab[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flt-workbench-tabs" role="tablist">
      {tabs.map((t) => {
        const active = t.id === value;
        const tip =
          t.tip ||
          `Filtrar vista: ${t.label}${typeof t.count === "number" ? ` (${t.count})` : ""}`;
        return (
          <Tooltip key={t.id} content={tip} side="bottom">
            <button
              type="button"
              role="tab"
              aria-selected={active}
              title={tip}
              className={`flt-workbench-tab ${active ? "is-active" : ""}`}
              onClick={() => onChange(t.id)}
            >
              {t.label}
              {typeof t.count === "number" ? (
                <span className="flt-workbench-tab-count font-data">
                  {t.count}
                </span>
              ) : null}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}

export function WorkbenchSearch({
  value,
  onChange,
  placeholder = "Buscar por placa, conductor o cliente…",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const tip =
    "Filtra la tabla de este módulo por placa, conductor, cliente o texto. Para buscar en todo el sistema use Cmd/Ctrl+K.";
  return (
    <Tooltip content={tip} side="bottom" className="w-full max-w-[420px]">
      <label className="flt-workbench-search w-full" title={tip}>
        <span className="sr-only">Buscar</span>
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4 shrink-0 text-[var(--text-secondary)]"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
        </svg>
        <input
          className="flt-workbench-search-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          title={tip}
        />
      </label>
    </Tooltip>
  );
}

export function WorkbenchToolbar({ children }: { children: ReactNode }) {
  return <div className="flt-workbench-toolbar">{children}</div>;
}
