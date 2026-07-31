"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MODULE_LABELS,
  NAV_DEPARTMENTS,
  ROLE_DEFAULT_NAV_DEPT,
  ROLE_LABELS,
  ROLE_VIEWS,
  navDeptForPath,
  type ModuleId,
  type NavDeptId,
  type NavDepartment,
  type Role,
} from "@fsg/shared";
import { Button, Tooltip } from "@fsg/ui";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { brand } from "@/lib/brand";
import { guideForPath } from "@/lib/module-guides";
import { ThemeToggle } from "@/lib/theme";
import { ShellProvider, useShell } from "@/lib/shell-context";
import { CommandSearch } from "@/components/shell/command-search";
import { NavIcon } from "@/components/shell/nav-icons";

const NAV_OPEN_KEY = "flt-nav-depts-open";

const DEPT_TIPS: Record<NavDeptId, string> = {
  operaciones:
    "Despacho, patio y documentos de flota. Abrir/cerrar sin cerrar otros departamentos.",
  comercial: "Clientes B2B, cotizaciones, contratos y canales CRM.",
  mantenimiento: "Órdenes de trabajo e inventario / compras.",
  finanzas: "Tesorería, archivo, SARLAFT, calidad y gobierno contable.",
  mando: "Inicio, personas, call center, sistemas y cuenta.",
};

type FlatNavItem = {
  href: string;
  view: ModuleId | "cuenta";
  label: string;
};

function BrandMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={`brand-mark ${className}`} aria-hidden>
      <rect width="32" height="32" rx="2" fill="var(--accent-primary)" />
      <path
        d="M8 22 L8 10 L16 18 L24 10 L24 22"
        fill="none"
        stroke="var(--brand-primary-fg)"
        strokeWidth="2.2"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </svg>
  );
}

function currentModuleLabel(pathname: string): string {
  const seg = pathname.split("/").filter(Boolean)[0] || "dashboard";
  if (seg === "cuenta") return "Cuenta";
  if (seg in MODULE_LABELS) return MODULE_LABELS[seg as ModuleId];
  return "Fleet Operations";
}

function pathMatches(href: string, pathname: string) {
  const base = href.split("#")[0];
  if (base === "/dashboard") {
    return pathname === "/dashboard" || pathname === "/";
  }
  return pathname === base || pathname.startsWith(`${base}/`);
}

function readOpenDepts(fallback: NavDeptId[]): NavDeptId[] {
  try {
    const raw = localStorage.getItem(NAV_OPEN_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return fallback;
    return parsed.filter((x): x is NavDeptId => typeof x === "string");
  } catch {
    return fallback;
  }
}

function persistOpenDepts(ids: NavDeptId[]) {
  localStorage.setItem(NAV_OPEN_KEY, JSON.stringify(ids));
}

function TopBar({
  userName,
  roleLabel,
  moduleBadge,
}: {
  userName: string;
  roleLabel: string;
  moduleBadge: string;
}) {
  const {
    systemStatus,
    setCommandOpen,
    toggleSidebar,
    toggleHelp,
    helpOpen,
  } = useShell();
  const statusClass =
    systemStatus === "NOMINAL"
      ? "text-[var(--accent-primary)]"
      : systemStatus === "ALERT"
        ? "text-[var(--accent-metric)]"
        : "text-[var(--accent-alert)]";
  const modLabel =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad/.test(navigator.platform)
      ? "⌘K"
      : "Ctrl K";

  return (
    <header className="flt-topbar">
      <div className="flex min-w-0 items-center gap-3">
        <Tooltip content="Abrir o cerrar el menú de departamentos">
          <button
            type="button"
            className="flt-icon-btn lg:hidden"
            onClick={toggleSidebar}
            aria-label="Abrir navegación"
            title="Abrir menú de departamentos"
          >
            <NavIcon view="menu" className="h-4 w-4" />
          </button>
        </Tooltip>
        <div className="flex min-w-0 items-center gap-2.5">
          <BrandMark className="hidden h-7 w-7 sm:block" />
          <div className="min-w-0">
            <p className="font-data text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--accent-primary)]">
              FLEETLINE OS
            </p>
            <p className="truncate font-display text-sm font-bold tracking-tight text-[var(--text-primary)]">
              {brand.name}
            </p>
          </div>
        </div>
        <Tooltip content={`Módulo activo: ${moduleBadge}`}>
          <span className="flt-module-badge hidden md:inline-flex">
            {moduleBadge}
          </span>
        </Tooltip>
      </div>

      <Tooltip
        content={`Buscar en todo el sistema (${modLabel}). Placa, conductor, cliente o módulo.`}
        side="bottom"
      >
        <button
          type="button"
          className="flt-search-trigger flt-search-trigger--hero"
          onClick={() => setCommandOpen(true)}
          title={`Buscar en todo el sistema (${modLabel})`}
        >
          <NavIcon view="search" className="h-4 w-4 shrink-0" />
          <span className="truncate">
            Buscar por placa, conductor o cliente…
          </span>
          <kbd className="flt-kbd hidden sm:inline-flex">{modLabel}</kbd>
        </button>
      </Tooltip>

      <div className="flex items-center justify-end gap-2 sm:gap-3">
        <Tooltip content="Estado del uplink API/DB: NOMINAL, ALERT u OFFLINE">
          <p
            className={`hidden font-data text-[10px] uppercase tracking-[0.12em] xl:block ${statusClass}`}
          >
            SYSTEM STATUS: {systemStatus}
          </p>
        </Tooltip>
        <Tooltip
          content={
            helpOpen
              ? "Cerrar guía del módulo (Esc o Cmd/Ctrl+/)"
              : "Abrir guía de 3 pasos de este módulo (Cmd/Ctrl+/)"
          }
        >
          <button
            type="button"
            className={`flt-help-btn ${helpOpen ? "is-active" : ""}`}
            onClick={toggleHelp}
            aria-label="Centro de ayuda"
            aria-pressed={helpOpen}
            title="Centro de ayuda del módulo actual (Cmd/Ctrl+/)"
          >
            ?
          </button>
        </Tooltip>
        <ThemeToggle />
        <div
          className="flt-user-chip"
          title={`${userName} · rol ${roleLabel}`}
        >
          <div className="min-w-0 text-right">
            <p className="truncate text-xs font-semibold text-[var(--text-primary)]">
              {userName}
            </p>
            <p className="font-data text-[9px] uppercase tracking-[0.12em] text-[var(--accent-primary)]">
              {roleLabel}
            </p>
          </div>
          <span className="flt-avatar" aria-hidden>
            {userName.slice(0, 1).toUpperCase()}
          </span>
        </div>
      </div>
    </header>
  );
}

function SideNav({
  departments,
  defaultOpenId,
  onLogout,
}: {
  departments: NavDepartment[];
  defaultOpenId: NavDeptId;
  onLogout: () => void;
}) {
  const pathname = usePathname();
  const { sidebarCollapsed, setSidebarCollapsed, toggleSidebar } = useShell();
  const pathDept = navDeptForPath(pathname);
  const [hydrated, setHydrated] = useState(false);
  const [openIds, setOpenIds] = useState<NavDeptId[]>([defaultOpenId]);

  useEffect(() => {
    const initial = readOpenDepts([defaultOpenId]);
    const withDefault = initial.includes(defaultOpenId)
      ? initial
      : [...initial, defaultOpenId];
    setOpenIds(withDefault);
    persistOpenDepts(withDefault);
    setHydrated(true);
    // solo al montar / cambio de rol default
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultOpenId]);

  useEffect(() => {
    if (!hydrated || !pathDept) return;
    setOpenIds((prev) => {
      if (prev.includes(pathDept)) return prev;
      const next = [...prev, pathDept];
      persistOpenDepts(next);
      return next;
    });
  }, [pathDept, hydrated]);

  const toggleDept = useCallback((id: NavDeptId) => {
    setOpenIds((prev) => {
      const next = prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id];
      persistOpenDepts(next);
      return next;
    });
  }, []);

  return (
    <>
      {!sidebarCollapsed ? (
        <button
          type="button"
          className="flt-sidebar-scrim lg:hidden"
          aria-label="Cerrar navegación"
          title="Cerrar menú"
          onClick={() => setSidebarCollapsed(true)}
        />
      ) : null}
      <aside
        className={`flt-sidebar ${sidebarCollapsed ? "is-collapsed" : "is-expanded"}`}
      >
        <div className="flex h-[60px] items-center justify-between border-b border-[var(--border-subtle)] px-3">
          {!sidebarCollapsed ? (
            <p
              className="px-1 font-data text-[9px] uppercase tracking-[0.16em] text-[var(--text-secondary)]"
              title="Menú multi-acordeón: varios departamentos abiertos a la vez"
            >
              Departamentos
            </p>
          ) : (
            <span className="mx-auto text-[var(--accent-primary)]">
              <BrandMark className="h-6 w-6" />
            </span>
          )}
          <Tooltip
            content={
              sidebarCollapsed
                ? "Expandir menú lateral"
                : "Colapsar menú lateral (iconos)"
            }
          >
            <button
              type="button"
              className="flt-icon-btn"
              onClick={toggleSidebar}
              title={sidebarCollapsed ? "Expandir menú" : "Colapsar menú"}
              aria-label={
                sidebarCollapsed ? "Expandir sidebar" : "Colapsar sidebar"
              }
            >
              <NavIcon
                view="collapse"
                className={`h-4 w-4 transition-transform duration-150 ${
                  sidebarCollapsed ? "rotate-180" : ""
                }`}
              />
            </button>
          </Tooltip>
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          {departments.map((dept) => {
            const expanded = openIds.includes(dept.id);
            const hasActive = dept.items.some((i) =>
              pathMatches(i.href, pathname),
            );

            if (sidebarCollapsed) {
              const first = dept.items[0];
              if (!first) return null;
              return (
                <Tooltip
                  key={dept.id}
                  content={`${dept.label}: ${DEPT_TIPS[dept.id]}`}
                  side="right"
                >
                  <Link
                    href={first.href.split("#")[0]}
                    title={dept.label}
                    className={`flt-nav-item ${hasActive ? "is-active" : ""}`}
                    onClick={() => {
                      if (window.innerWidth < 1024) setSidebarCollapsed(true);
                    }}
                  >
                    <NavIcon view={first.view} className="h-4 w-4 shrink-0" />
                  </Link>
                </Tooltip>
              );
            }

            return (
              <div key={dept.id} className="flt-dept">
                <Tooltip content={DEPT_TIPS[dept.id]} side="right" className="w-full">
                  <button
                    type="button"
                    className={`flt-dept-trigger ${hasActive ? "is-current" : ""} ${expanded ? "is-open" : ""}`}
                    aria-expanded={expanded}
                    title={`${expanded ? "Cerrar" : "Abrir"} ${dept.label} (no cierra otros)`}
                    onClick={() => toggleDept(dept.id)}
                  >
                    <span className="truncate">{dept.label}</span>
                    <svg
                      viewBox="0 0 24 24"
                      className={`h-3.5 w-3.5 shrink-0 transition-transform duration-150 ${
                        expanded ? "rotate-180" : ""
                      }`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden
                    >
                      <path d="M6 9l6 6 6-6" strokeLinecap="round" />
                    </svg>
                  </button>
                </Tooltip>
                {expanded ? (
                  <div className="flt-dept-items">
                    {dept.items.map((item) => {
                      const active = pathMatches(item.href, pathname);
                      return (
                        <Tooltip
                          key={`${item.href}-${item.label}`}
                          content={`Abrir: ${item.label}`}
                          side="right"
                          className="w-full"
                        >
                          <Link
                            href={item.href}
                            title={item.label}
                            className={`flt-nav-item flt-nav-item--nested ${active ? "is-active" : ""}`}
                            onClick={() => {
                              if (window.innerWidth < 1024) {
                                setSidebarCollapsed(true);
                              }
                            }}
                          >
                            <NavIcon
                              view={item.view}
                              className="h-3.5 w-3.5 shrink-0"
                            />
                            <span className="truncate">{item.label}</span>
                          </Link>
                        </Tooltip>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-[var(--border-subtle)] p-3">
          <Tooltip content="Cerrar sesión y limpiar token local">
            <Button
              variant="ghost"
              className={`w-full ${sidebarCollapsed ? "!justify-center !px-0" : "!justify-start"}`}
              onClick={onLogout}
              title="Cerrar sesión"
            >
              {sidebarCollapsed ? (
                <NavIcon view="close" className="h-4 w-4" />
              ) : (
                "Cerrar sesión"
              )}
            </Button>
          </Tooltip>
        </div>
      </aside>
    </>
  );
}

function HelpSheet() {
  const pathname = usePathname();
  const { helpOpen, setHelpOpen } = useShell();
  const guide = guideForPath(pathname);

  return (
    <>
      <div
        className={`flt-help-scrim ${helpOpen ? "is-open" : ""}`}
        onClick={() => setHelpOpen(false)}
        aria-hidden={!helpOpen}
      />
      <aside
        className={`flt-help-sheet ${helpOpen ? "is-open" : ""}`}
        aria-hidden={!helpOpen}
        aria-label="Centro de ayuda"
      >
        <div className="flex h-[60px] items-center justify-between border-b border-[var(--border-subtle)] px-4">
          <div className="min-w-0">
            <p className="font-data text-[9px] uppercase tracking-[0.16em] text-[var(--text-secondary)]">
              Asistencia
            </p>
            <h2 className="truncate text-sm font-semibold text-[var(--text-primary)]">
              {guide.title}
            </h2>
          </div>
          <Tooltip content="Cerrar guía (Esc)">
            <button
              type="button"
              className="flt-icon-btn"
              onClick={() => setHelpOpen(false)}
              aria-label="Cerrar ayuda"
              title="Cerrar ayuda"
            >
              <NavIcon view="close" className="h-4 w-4" />
            </button>
          </Tooltip>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
            {guide.summary}
          </p>
          <ol className="space-y-3">
            {guide.steps.map((step, i) => (
              <li
                key={step}
                className="flt-help-step"
                title={`Paso ${i + 1}`}
              >
                <span className="flt-help-step-num font-data">{i + 1}</span>
                <p className="text-sm leading-relaxed text-[var(--text-primary)]">
                  {step}
                </p>
              </li>
            ))}
          </ol>
          <p className="font-data text-[10px] uppercase tracking-[0.12em] text-[var(--text-secondary)]">
            Atajo: Cmd/Ctrl + / · Esc cierra
          </p>
        </div>
      </aside>
    </>
  );
}

function InspectorDrawer() {
  const { inspectorOpen, inspectorTitle, inspectorContent, closeInspector } =
    useShell();

  return (
    <>
      <div
        className={`flt-inspector-scrim ${inspectorOpen ? "is-open" : ""}`}
        onClick={closeInspector}
        aria-hidden={!inspectorOpen}
      />
      <aside
        className={`flt-inspector ${inspectorOpen ? "is-open" : ""}`}
        aria-hidden={!inspectorOpen}
      >
        <div className="flex h-[60px] items-center justify-between border-b border-[var(--border-subtle)] px-4">
          <div className="min-w-0">
            <p className="font-data text-[9px] uppercase tracking-[0.16em] text-[var(--text-secondary)]">
              Inspector
            </p>
            <h2 className="truncate text-sm font-semibold text-[var(--text-primary)]">
              {inspectorTitle || "Detalle"}
            </h2>
          </div>
          <Tooltip content="Cerrar inspector (Esc)">
            <button
              type="button"
              className="flt-icon-btn"
              onClick={closeInspector}
              aria-label="Cerrar inspector"
              title="Cerrar inspector"
            >
              <NavIcon view="close" className="h-4 w-4" />
            </button>
          </Tooltip>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{inspectorContent}</div>
      </aside>
    </>
  );
}

function ShellFrame({ children }: { children: React.ReactNode }) {
  const { user, loading, logout, homePath, canAccess } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const { setSystemStatus } = useShell();

  useEffect(() => {
    if (!loading && !user && pathname !== "/login") {
      router.replace("/login");
    }
  }, [loading, user, pathname, router]);

  useEffect(() => {
    if (!user || pathname === "/login") return;
    const view = pathname.split("/").filter(Boolean)[0] || "dashboard";
    if (!canAccess(view)) {
      router.replace(homePath);
    }
  }, [user, pathname, canAccess, homePath, router]);

  useEffect(() => {
    if (!user) return;
    api<{ db: string }>("/health")
      .then((h) => setSystemStatus(h.db === "ok" ? "NOMINAL" : "ALERT"))
      .catch(() => setSystemStatus("OFFLINE"));
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, [user, setSystemStatus]);

  const departments = useMemo(() => {
    if (!user) return [];
    const allowed = new Set(ROLE_VIEWS[user.role] || []);
    return NAV_DEPARTMENTS.map((dept) => ({
      ...dept,
      items: dept.items.filter(
        (item) =>
          item.view === "cuenta" || allowed.has(item.view as ModuleId),
      ),
    })).filter((d) => d.items.length > 0);
  }, [user]);

  const defaultOpenId: NavDeptId = user
    ? ROLE_DEFAULT_NAV_DEPT[user.role as Role] || "operaciones"
    : "operaciones";

  const flatNav: FlatNavItem[] = useMemo(
    () =>
      departments.flatMap((d) =>
        d.items.map((i) => ({
          href: i.href.split("#")[0],
          view: i.view,
          label: i.label,
        })),
      ),
    [departments],
  );

  if (pathname === "/login") return <>{children}</>;

  if (loading || !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--bg-canvas)] text-[var(--text-secondary)]">
        <div className="flex items-center gap-3">
          <BrandMark />
          <span className="font-display text-lg tracking-tight">
            Sincronizando {brand.name}…
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flt-shell">
      <TopBar
        userName={user.name}
        roleLabel={ROLE_LABELS[user.role]}
        moduleBadge={currentModuleLabel(pathname)}
      />
      <div className="flt-shell-body">
        <SideNav
          departments={departments}
          defaultOpenId={
            departments.some((d) => d.id === defaultOpenId)
              ? defaultOpenId
              : departments[0]?.id || "operaciones"
          }
          onLogout={logout}
        />
        <main className="flt-workbench">{children}</main>
        <InspectorDrawer />
        <HelpSheet />
      </div>
      <CommandSearch items={flatNav} />
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ShellProvider>
      <ShellFrame>{children}</ShellFrame>
    </ShellProvider>
  );
}
