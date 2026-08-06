"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MODULE_HELP, MODULE_LABELS, type ModuleId } from "@fsg/shared";
import { useShell } from "@/lib/shell-context";
import { NavIcon } from "@/components/shell/nav-icons";

type NavItem = {
  href: string;
  view: ModuleId | "cuenta";
  label?: string;
  section?: string;
};

function itemLabel(item: NavItem) {
  if (item.label) return item.label;
  if (item.view === "cuenta") return "Mi cuenta";
  return MODULE_LABELS[item.view];
}

export function CommandSearch({ items }: { items: NavItem[] }) {
  const { commandOpen, setCommandOpen } = useShell();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 8);
    return items
      .filter((item) => {
        const label = itemLabel(item);
        const help =
          item.view === "cuenta" ? "perfil" : MODULE_HELP[item.view] || "";
        return (
          label.toLowerCase().includes(q) ||
          help.toLowerCase().includes(q) ||
          item.href.includes(q) ||
          (item.section || "").toLowerCase().includes(q)
        );
      })
      .slice(0, 10);
  }, [items, query]);

  useEffect(() => {
    if (!commandOpen) {
      setQuery("");
      setActive(0);
      return;
    }
    const t = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(t);
  }, [commandOpen]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  if (!commandOpen) return null;

  function go(href: string) {
    setCommandOpen(false);
    router.push(href);
  }

  return (
    <div className="flt-command-root" role="dialog" aria-modal="true">
      <button
        type="button"
        className="flt-command-backdrop"
        aria-label="Cerrar búsqueda"
        onClick={() => setCommandOpen(false)}
      />
      <div className="flt-command-panel">
        <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] px-4 py-3">
          <NavIcon view="search" className="h-4 w-4 text-[var(--text-secondary)]" />
          <input
            ref={inputRef}
            data-testid="command-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter" && results[active]) {
                e.preventDefault();
                go(results[active].href);
              }
            }}
            placeholder="Buscar por placa, conductor o cliente…"
            className="w-full bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-secondary)]"
          />
          <kbd className="hidden font-data text-[10px] text-[var(--text-secondary)] sm:inline">
            ESC
          </kbd>
        </div>
        <ul className="max-h-[360px] overflow-y-auto py-2">
          {results.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-[var(--text-secondary)]">
              Sin coincidencias en el nodo
            </li>
          ) : (
            results.map((item, idx) => {
              const label = itemLabel(item);
              const help =
                item.view === "cuenta"
                  ? "Perfil y clave de acceso"
                  : MODULE_HELP[item.view];
              return (
                <li key={`${item.href}-${label}`}>
                  <button
                    type="button"
                    className={`flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors duration-150 ${
                      idx === active
                        ? "bg-[color-mix(in_srgb,var(--accent-primary)_12%,transparent)]"
                        : "hover:bg-[color-mix(in_srgb,var(--accent-primary)_7%,transparent)]"
                    }`}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => go(item.href)}
                  >
                    <span className="mt-0.5 text-[var(--accent-primary)]">
                      <NavIcon view={item.view} className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-[var(--text-primary)]">
                        {label}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-[var(--text-secondary)]">
                        {help}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}
