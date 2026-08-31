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

type CommandRow = NavItem & {
  group: "MÃ“DULOS" | "CONDUCTORES" | "VEHÃCULOS/PLACAS" | "ACCIONES RÃPIDAS";
};

function itemLabel(item: NavItem) {
  if (item.label) return item.label;
  if (item.view === "cuenta") return "Mi cuenta";
  return MODULE_LABELS[item.view];
}

function classify(item: NavItem): CommandRow["group"] {
  const href = item.href.toLowerCase();
  const label = itemLabel(item).toLowerCase();
  const section = (item.section || "").toLowerCase();
  if (
    href.includes("conductor") ||
    label.includes("conductor") ||
    section.includes("conductor")
  ) {
    return "CONDUCTORES";
  }
  if (
    href.includes("taller") ||
    href.includes("vehic") ||
    href.includes("tramite") ||
    href.includes("parqueadero") ||
    href.includes("patio") ||
    label.includes("placa") ||
    label.includes("vehÃ­culo") ||
    label.includes("vehiculo")
  ) {
    return "VEHÃCULOS/PLACAS";
  }
  if (
    href.includes("cuenta") ||
    href.includes("usuarios") ||
    label.includes("nueva") ||
    label.includes("crear") ||
    section.includes("acciÃ³n") ||
    section.includes("accion")
  ) {
    return "ACCIONES RÃPIDAS";
  }
  return "MÃ“DULOS";
}

const GROUP_ORDER: CommandRow["group"][] = [
  "MÃ“DULOS",
  "CONDUCTORES",
  "VEHÃCULOS/PLACAS",
  "ACCIONES RÃPIDAS",
];

/** Placa tÃ­pica CO: ABC123 / ABC12D */
function looksLikePlate(q: string) {
  return /^[A-Za-z]{3}\d{2,3}[A-Za-z0-9]?$/.test(q.replace(/\s|-/g, ""));
}

export function CommandSearch({ items }: { items: NavItem[] }) {
  const { commandOpen, setCommandOpen } = useShell();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const enriched = useMemo(() => {
    const base: CommandRow[] = items.map((item) => ({
      ...item,
      group: classify(item),
    }));

    const q = query.trim();
    const plate = looksLikePlate(q);
    if (plate) {
      base.unshift({
        href: `/tramites?q=${encodeURIComponent(q.toUpperCase())}`,
        view: "tramites",
        label: `Placa ${q.toUpperCase()} Â· semÃ¡foro documental`,
        section: "placa",
        group: "VEHÃCULOS/PLACAS",
      });
      base.unshift({
        href: `/logistica/servicios?plate=${encodeURIComponent(q.toUpperCase())}`,
        view: "logistica",
        label: `Placa ${q.toUpperCase()} Â· mapa / tracking`,
        section: "placa",
        group: "VEHÃCULOS/PLACAS",
      });
    }

    const ql = q.toLowerCase();
    if (!ql) return base.slice(0, 12);

    return base
      .filter((item) => {
        const label = itemLabel(item);
        const help =
          item.view === "cuenta" ? "perfil" : MODULE_HELP[item.view] || "";
        return (
          label.toLowerCase().includes(ql) ||
          help.toLowerCase().includes(ql) ||
          item.href.includes(ql) ||
          (item.section || "").toLowerCase().includes(ql) ||
          item.group.toLowerCase().includes(ql)
        );
      })
      .slice(0, 16);
  }, [items, query]);

  const flat = enriched;

  const grouped = useMemo(() => {
    return GROUP_ORDER.map((g) => ({
      group: g,
      rows: flat.filter((r) => r.group === g),
    })).filter((g) => g.rows.length > 0);
  }, [flat]);

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
        aria-label="Cerrar bÃºsqueda"
        onClick={() => setCommandOpen(false)}
      />
      <div className="flt-command-panel">
        <div className="flex items-center gap-3 border-b border-[var(--brand-border)] px-4 py-3">
          <NavIcon view="search" className="h-4 w-4 text-[var(--brand-text-secondary)]" />
          <input
            ref={inputRef}
            data-testid="command-search-input"
            data-no-validate="true"
            data-field="skip"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, Math.max(flat.length - 1, 0)));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter" && flat[active]) {
                e.preventDefault();
                go(flat[active].href);
              }
            }}
            placeholder="Buscar mÃ³dulo, placa, conductor o acciÃ³nâ€¦"
            className="w-full bg-transparent text-sm text-[var(--brand-text-primary)] outline-none placeholder:text-[var(--brand-text-secondary)]"
          />
          <kbd className="flt-kbd rounded-md border px-2 py-0.5 font-mono text-[10px]">
            ESC
          </kbd>
        </div>
        <div className="max-h-[420px] overflow-y-auto py-2">
          {flat.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-[var(--brand-text-secondary)]">
              Sin coincidencias en el nodo
            </p>
          ) : (
            grouped.map((section) => (
              <div key={section.group} className="mb-1">
                <p className="px-4 py-1.5 font-data text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--brand-text-secondary)]">
                  {section.group}
                </p>
                <ul>
                  {section.rows.map((item) => {
                    const idx = flat.indexOf(item);
                    const label = itemLabel(item);
                    const help =
                      item.view === "cuenta"
                        ? "Perfil y clave de acceso"
                        : MODULE_HELP[item.view];
                    return (
                      <li key={`${item.href}-${label}-${item.group}`}>
                        <button
                          type="button"
                          className={`flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors duration-150 ${
                            idx === active
                              ? "bg-[color-mix(in_srgb,var(--brand-primary)_12%,transparent)]"
                              : "hover:bg-[color-mix(in_srgb,var(--brand-primary)_7%,transparent)]"
                          }`}
                          onMouseEnter={() => setActive(idx)}
                          onClick={() => go(item.href)}
                        >
                          <span className="mt-0.5 text-[var(--brand-primary)]">
                            <NavIcon view={item.view} className="h-4 w-4" />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-[var(--brand-text-primary)]">
                              {label}
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-[var(--brand-text-secondary)]">
                              {help}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
