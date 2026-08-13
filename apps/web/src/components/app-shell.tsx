"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MODULE_LABELS,
  NAV_DEPARTMENTS,
  RECEPCIONISTA_NAV,
  LIDER_TI_NAV,
  GESTOR_DOCUMENTAL_NAV,
  AUXILIAR_CONTABLE_NAV,
  GESTOR_CONTABLE_NAV,
  DIRECTOR_FINANCIERO_NAV,
  LIDER_QHSE_NAV,
  LIDER_COMPRAS_NAV,
  DIRECTOR_OPERATIVO_NAV,
  GESTOR_OPERATIVO_NAV,
  COORDINADOR_CAMPO_NAV,
  OPERADOR_CENTRO_CONTROL_NAV,
  AUDITOR_CONTROL_INTERNO_NAV,
  PRESIDENTE_NAV,
  GESTOR_VINCULACIONES_NAV,
  DIRECTOR_COMERCIAL_NAV,
  GESTOR_COMERCIAL_NAV,
  COORDINADOR_COMERCIAL_NAV,
  GERENTE_GENERAL_NAV,
  DIRECTOR_JURIDICO_NAV,
  REVISOR_FISCAL_NAV,
  COORDINADOR_TALLER_NAV,
  AUXILIAR_ALMACEN_TALLER_NAV,
  MECANICO_NAV,
  COORDINADOR_PATIO_NAV,
  AUXILIAR_PATIO_NAV,
  CONDUCTOR_PILOT_NAV,
  SUBGERENTE_NAV,
  ROLE_DEFAULT_NAV_DEPT,
  ROLE_LABELS,
  ROLE_VIEWS,
  navDeptForPath,
  normalizeRole,
  resolveModuleId,
  type ModuleId,
  type NavDeptId,
  type NavDepartment,
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
import {
  NotificationBell,
  NotificationToasts,
} from "@/components/notifications/notification-center";
import { NotificationsProvider } from "@/lib/notifications-context";

const NAV_OPEN_KEY = "flt-nav-depts-open";

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
  const resolved = resolveModuleId(seg);
  if (resolved) return MODULE_LABELS[resolved];
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
  /** Evita mismatch SSR/cliente (Mac vs Windows) */
  const [modLabel, setModLabel] = useState("Ctrl K");
  useEffect(() => {
    const isApple = /Mac|iPhone|iPad|iPod/.test(
      navigator.platform || navigator.userAgent,
    );
    setModLabel(isApple ? "⌘K" : "Ctrl K");
  }, []);

  return (
    <header className="flt-topbar">
      <div className="flex min-w-0 items-center gap-3">
        <Tooltip content="Abrir o cerrar el menú de áreas corporativas">
          <button
            type="button"
            className="flt-icon-btn lg:hidden"
            onClick={toggleSidebar}
            aria-label="Abrir navegación"
            title="Abrir menú de áreas"
          >
            <NavIcon view="menu" className="h-4 w-4" />
          </button>
        </Tooltip>
        <div className="flex min-w-0 items-center gap-2.5">
          <BrandMark className="hidden h-7 w-7 sm:block" />
          <div className="min-w-0">
            <p className="font-data text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--accent-primary)]">
              {brand.tagline}
            </p>
            <p className="truncate font-display text-sm font-bold tracking-tight text-[var(--text-primary)]">
              {brand.name}
            </p>
          </div>
        </div>
        <Tooltip content={`Área activa: ${moduleBadge}`}>
          <span className="flt-module-badge hidden md:inline-flex">
            {moduleBadge}
          </span>
        </Tooltip>
      </div>

      <Tooltip
        content={`Buscar en todo el sistema (${modLabel}). Placa, conductor, cliente o área.`}
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
          <kbd className="flt-kbd hidden sm:inline-flex" suppressHydrationWarning>
            {modLabel}
          </kbd>
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
        <NotificationBell />
        <Tooltip
          content={
            helpOpen
              ? "Cerrar guía del área (Esc o Cmd/Ctrl+/)"
              : "Abrir guía de 3 pasos de esta área (Cmd/Ctrl+/)"
          }
        >
          <button
            type="button"
            className={`flt-help-btn ${helpOpen ? "is-active" : ""}`}
            onClick={toggleHelp}
            aria-label="Centro de ayuda"
            aria-pressed={helpOpen}
            title="Centro de ayuda del área actual (Cmd/Ctrl+/)"
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
    const initial = readOpenDepts(
      departments.map((d) => d.id).length
        ? departments.map((d) => d.id)
        : [defaultOpenId],
    );
    const withPath =
      pathDept && !initial.includes(pathDept)
        ? [...initial, pathDept]
        : initial;
    const withDefault = withPath.includes(defaultOpenId)
      ? withPath
      : [...withPath, defaultOpenId];
    setOpenIds(withDefault);
    persistOpenDepts(withDefault);
    setHydrated(true);
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
              title="17 áreas independientes — preferencias en localStorage"
            >
              Áreas corporativas
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

        <nav className="flex-1 overflow-y-auto py-2" aria-label="Áreas corporativas">
          {departments.map((dept) => {
            const multi = dept.items.length > 1;
            const anyActive = dept.items.some((i) =>
              pathMatches(i.href, pathname),
            );
            const open = openIds.includes(dept.id);
            const primary = dept.items[0];
            if (!primary) return null;

            if (sidebarCollapsed) {
              return (
                <Tooltip key={dept.id} content={dept.tip} side="right">
                  <Link
                    href={primary.href}
                    title={dept.label}
                    className={`flt-nav-item ${anyActive ? "is-active" : ""}`}
                    onClick={() => {
                      if (window.innerWidth < 1024) setSidebarCollapsed(true);
                    }}
                  >
                    <NavIcon view={primary.view} className="h-4 w-4 shrink-0" />
                  </Link>
                </Tooltip>
              );
            }

            if (!multi) {
              const tip = primary.tip || dept.tip;
              return (
                <Tooltip
                  key={dept.id}
                  content={tip}
                  side="right"
                  className="w-full"
                >
                  <Link
                    href={primary.href}
                    title={tip}
                    className={`flt-nav-item ${anyActive ? "is-active" : ""}`}
                    onClick={() => {
                      if (window.innerWidth < 1024) setSidebarCollapsed(true);
                    }}
                  >
                    <NavIcon
                      view={primary.view}
                      className="h-3.5 w-3.5 shrink-0"
                    />
                    <span className="truncate">{primary.label}</span>
                  </Link>
                </Tooltip>
              );
            }

            return (
              <div key={dept.id} className="flt-dept">
                <button
                  type="button"
                  className={`flt-dept-trigger ${open ? "is-open" : ""} ${
                    anyActive ? "is-current" : ""
                  }`}
                  aria-expanded={open}
                  title={dept.tip}
                  onClick={() => toggleDept(dept.id)}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <NavIcon
                      view={primary.view}
                      className="h-3.5 w-3.5 shrink-0"
                    />
                    <span className="truncate">{dept.label}</span>
                  </span>
                  <svg
                    viewBox="0 0 12 12"
                    className={`h-3 w-3 shrink-0 opacity-70 transition-transform duration-150 ${
                      open ? "rotate-90" : ""
                    }`}
                    aria-hidden
                  >
                    <path
                      d="M4 2 L8 6 L4 10"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="square"
                    />
                  </svg>
                </button>
                {open ? (
                  <div className="flt-dept-items" role="group" aria-label={dept.label}>
                    {dept.items.map((item) => {
                      const matching = dept.items.filter((i) =>
                        pathMatches(i.href, pathname),
                      );
                      const best = matching.reduce<(typeof item) | null>(
                        (acc, cur) =>
                          !acc || cur.href.length > acc.href.length
                            ? cur
                            : acc,
                        null,
                      );
                      const active = best?.href === item.href;
                      return (
                        <Tooltip
                          key={item.href}
                          content={item.tip}
                          side="right"
                          className="w-full"
                        >
                          <Link
                            href={item.href}
                            title={item.tip}
                            className={`flt-nav-item flt-nav-item--nested ${
                              active ? "is-active" : ""
                            }`}
                            onClick={() => {
                              if (window.innerWidth < 1024)
                                setSidebarCollapsed(true);
                            }}
                          >
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

        <div className="border-t border-[var(--border-subtle)] p-3 space-y-1">
          <Tooltip content="Perfil, contraseña y preferencias de cuenta">
            <Link
              href="/cuenta"
              className={`flt-nav-item ${pathname.startsWith("/cuenta") ? "is-active" : ""}`}
              title="Mi cuenta"
            >
              <NavIcon view="cuenta" className="h-3.5 w-3.5 shrink-0" />
              {!sidebarCollapsed ? (
                <span className="truncate">Mi cuenta</span>
              ) : null}
            </Link>
          </Tooltip>
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
              <li key={step} className="flt-help-step" title={`Paso ${i + 1}`}>
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
    const seg = pathname.split("/").filter(Boolean)[0] || "dashboard";
    if (seg === "cuenta") return;
    const resolved = resolveModuleId(seg) || seg;
    if (!canAccess(resolved)) {
      router.replace(homePath);
    }
  }, [user, pathname, canAccess, homePath, router]);

  useEffect(() => {
    if (!user) return;
    api<{ db: string }>("/health")
      .then((h) => setSystemStatus(h.db === "ok" ? "NOMINAL" : "ALERT"))
      .catch(() => setSystemStatus("OFFLINE"));
    if ("serviceWorker" in navigator) {
      void (async () => {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
        await navigator.serviceWorker.register("/sw.js?v=4", {
          updateViaCache: "none",
        });
      })().catch(() => undefined);
    }
  }, [user, setSystemStatus]);

  const departments = useMemo(() => {
    if (!user) return [];
    const role = normalizeRole(user.role);

    if (role === "recepcionista") {
      const dept: NavDepartment = {
        id: "call_center",
        label: "Recepción",
        tip: "Concierge omnicanal · visitas · PQRS · radar lectura",
        items: RECEPCIONISTA_NAV.map((i) => ({
          href: i.href,
          view: i.view as ModuleId,
          label: i.label,
          tip: i.tip,
        })),
      };
      return [dept];
    }

    if (role === "lider_ti") {
      const dept: NavDepartment = {
        id: "tecnologia_ti",
        label: "Tecnología e infraestructura",
        tip: "Centro de Control · usuarios · help desk · NOC",
        items: LIDER_TI_NAV.map((i) => ({
          href: i.href,
          view: i.view as ModuleId,
          label: i.label,
          tip: i.tip,
        })),
      };
      return [dept];
    }

    if (role === "gestor_documental") {
      const dept: NavDepartment = {
        id: "archivo",
        label: "Archivo y Papelería",
        tip: "Custodia · papelería · búsqueda universal",
        items: GESTOR_DOCUMENTAL_NAV.map((i) => ({
          href: i.href,
          view: i.view as ModuleId,
          label: i.label,
          tip: i.tip,
        })),
      };
      return [dept];
    }

    if (role === "auxiliar_contable") {
      const dept: NavDepartment = {
        id: "contabilidad",
        label: "Operación financiera",
        tip: "CxP · legalizaciones · conciliación bancaria",
        items: AUXILIAR_CONTABLE_NAV.map((i) => ({
          href: i.href,
          view: i.view as ModuleId,
          label: i.label,
          tip: i.tip,
        })),
      };
      return [dept];
    }

    if (role === "gestor_contable") {
      const dept: NavDepartment = {
        id: "contabilidad",
        label: "Contabilidad 4.0",
        tip: "PUC · DIAN · Smart Wallet · costeo flota",
        items: GESTOR_CONTABLE_NAV.map((i) => ({
          href: i.href,
          view: i.view as ModuleId,
          label: i.label,
          tip: i.tip,
        })),
      };
      return [dept];
    }

    if (role === "director_financiero") {
      const dept: NavDepartment = {
        id: "tesoreria",
        label: "Dirección Financiera",
        tip: "CFO Hub · MFA · P&L · contratos",
        items: DIRECTOR_FINANCIERO_NAV.map((i) => ({
          href: i.href,
          view: i.view as ModuleId,
          label: i.label,
          tip: i.tip,
        })),
      };
      return [dept];
    }

    if (role === "lider_qhse" || role === "qhse") {
      const dept: NavDepartment = {
        id: "qhse",
        label: "QHSE · Prevención 4.0",
        tip: "Radar · telemetría · siniestros · ESG",
        items: LIDER_QHSE_NAV.map((i) => ({
          href: i.href,
          view: i.view as ModuleId,
          label: i.label,
          tip: i.tip,
        })),
      };
      return [dept];
    }

    if (role === "lider_compras" || role === "compras") {
      const dept: NavDepartment = {
        id: "compras",
        label: "Smart Procurement",
        tip: "Vendor Hub · OC · almacén · SOAT",
        items: LIDER_COMPRAS_NAV.map((i) => ({
          href: i.href,
          view: i.view as ModuleId,
          label: i.label,
          tip: i.tip,
        })),
      };
      return [dept];
    }

    if (role === "director_operativo") {
      const dept: NavDepartment = {
        id: "logistica",
        label: "Dirección Operativa",
        tip: "Control Tower · Gantt · capacidad",
        items: DIRECTOR_OPERATIVO_NAV.map((i) => ({
          href: i.href,
          view: i.view as ModuleId,
          label: i.label,
          tip: i.tip,
        })),
      };
      return [dept];
    }

    if (role === "gestor_operativo") {
      const dept: NavDepartment = {
        id: "logistica",
        label: "Micro-Dispatch 4.0",
        tip: "Asignación · relevo flash · hard-stops",
        items: GESTOR_OPERATIVO_NAV.map((i) => ({
          href: i.href,
          view: i.view as ModuleId,
          label: i.label,
          tip: i.tip,
        })),
      };
      return [dept];
    }

    if (role === "coordinador_campo") {
      const dept: NavDepartment = {
        id: "logistica",
        label: "Field Commander",
        tip: "Geocerca · abordaje · auditoría sitio",
        items: COORDINADOR_CAMPO_NAV.map((i) => ({
          href: i.href,
          view: i.view as ModuleId,
          label: i.label,
          tip: i.tip,
        })),
      };
      return [dept];
    }

    if (role === "operador_centro_control" || role === "centro_control") {
      const dept: NavDepartment = {
        id: "logistica",
        label: "Watchtower 24/7",
        tip: "Excepciones · SOS · IoT",
        items: OPERADOR_CENTRO_CONTROL_NAV.map((i) => ({
          href: i.href,
          view: i.view as ModuleId,
          label: i.label,
          tip: i.tip,
        })),
      };
      return [dept];
    }

    if (role === "auditor_control_interno" || role === "control_interno") {
      const dept: NavDepartment = {
        id: "revisoria_fiscal",
        label: "Forensic Hub",
        tip: "Caja negra · hallazgos · smart audit",
        items: AUDITOR_CONTROL_INTERNO_NAV.map((i) => ({
          href: i.href,
          view: i.view as ModuleId,
          label: i.label,
          tip: i.tip,
        })),
      };
      return [dept];
    }

    if (role === "presidente" || role === "presidencia") {
      const dept: NavDepartment = {
        id: "presidencia",
        label: "Founder's Canvas",
        tip: "Jarvis · CapEx · DEFCON",
        items: PRESIDENTE_NAV.map((i) => ({
          href: i.href,
          view: i.view as ModuleId,
          label: i.label,
          tip: i.tip,
        })),
      };
      return [dept];
    }

    if (role === "gestor_vinculaciones" || role === "vinculaciones") {
      const dept: NavDepartment = {
        id: "rrhh",
        label: "Smart Onboarding",
        tip: "Afiliados · RUNT/SIMIT · OCR",
        items: GESTOR_VINCULACIONES_NAV.map((i) => ({
          href: i.href,
          view: i.view as ModuleId,
          label: i.label,
          tip: i.tip,
        })),
      };
      return [dept];
    }

    if (role === "director_comercial") {
      const dept: NavDepartment = {
        id: "comercial",
        label: "Dirección Comercial",
        tip: "Pipeline B2B · Cotizador · DocuSign",
        items: DIRECTOR_COMERCIAL_NAV.map((i) => ({
          href: i.href,
          view: i.view as ModuleId,
          label: i.label,
          tip: i.tip,
        })),
      };
      return [dept];
    }

    if (role === "gestor_comercial") {
      const dept: NavDepartment = {
        id: "comercial",
        label: "Sales Execution",
        tip: "Tareas · Marcador · Cobro anticipado",
        items: GESTOR_COMERCIAL_NAV.map((i) => ({
          href: i.href,
          view: i.view as ModuleId,
          label: i.label,
          tip: i.tip,
        })),
      };
      return [dept];
    }

    if (role === "coordinador_comercial") {
      const dept: NavDepartment = {
        id: "comercial",
        label: "Coordinación Comercial",
        tip: "Leaderboard · SECOP · Round-Robin",
        items: COORDINADOR_COMERCIAL_NAV.map((i) => ({
          href: i.href,
          view: i.view as ModuleId,
          label: i.label,
          tip: i.tip,
        })),
      };
      return [dept];
    }

    if (role === "gerente_general") {
      const dept: NavDepartment = {
        id: "gerencia",
        label: "Gerencia General",
        tip: "Scorecard · Overrides · PIN",
        items: GERENTE_GENERAL_NAV.map((i) => ({
          href: i.href,
          view: i.view as ModuleId,
          label: i.label,
          tip: i.tip,
        })),
      };
      return [dept];
    }

    if (role === "director_juridico" || role === "juridico") {
      const dept: NavDepartment = {
        id: "juridico",
        label: "Legal Hub 4.0",
        tip: "Contratos · SARLAFT · Expedientes",
        items: DIRECTOR_JURIDICO_NAV.map((i) => ({
          href: i.href,
          view: i.view as ModuleId,
          label: i.label,
          tip: i.tip,
        })),
      };
      return [dept];
    }

    if (role === "revisor_fiscal") {
      const dept: NavDepartment = {
        id: "revisoria_fiscal",
        label: "Truth Hub",
        tip: "DIAN · Drill-down · Hard Lock",
        items: REVISOR_FISCAL_NAV.map((i) => ({
          href: i.href,
          view: i.view as ModuleId,
          label: i.label,
          tip: i.tip,
        })),
      };
      return [dept];
    }

    if (role === "coordinador_taller") {
      const dept: NavDepartment = {
        id: "taller",
        label: "Taller 4.0",
        tip: "Kanban · Bahías · QC",
        items: COORDINADOR_TALLER_NAV.map((i) => ({
          href: i.href,
          view: i.view as ModuleId,
          label: i.label,
          tip: i.tip,
        })),
      };
      return [dept];
    }

    if (role === "auxiliar_almacen_taller") {
      const dept: NavDepartment = {
        id: "taller",
        label: "Smart Warehouse",
        tip: "QR · Despacho POS",
        items: AUXILIAR_ALMACEN_TALLER_NAV.map((i) => ({
          href: i.href,
          view: i.view as ModuleId,
          label: i.label,
          tip: i.tip,
        })),
      };
      return [dept];
    }

    if (role === "mecanico") {
      const dept: NavDepartment = {
        id: "taller",
        label: "FSG Tech App",
        tip: "OT · Timer · Foto/Voz",
        items: MECANICO_NAV.map((i) => ({
          href: i.href,
          view: i.view as ModuleId,
          label: i.label,
          tip: i.tip,
        })),
      };
      return [dept];
    }

    if (role === "coordinador_patio") {
      const dept: NavDepartment = {
        id: "parqueadero",
        label: "Smart Yard",
        tip: "Yard Map · Talanquera LPR",
        items: COORDINADOR_PATIO_NAV.map((i) => ({
          href: i.href,
          view: i.view as ModuleId,
          label: i.label,
          tip: i.tip,
        })),
      };
      return [dept];
    }

    if (role === "auxiliar_patio") {
      const dept: NavDepartment = {
        id: "parqueadero",
        label: "Smart Yard App",
        tip: "Lavado · Yard Moves",
        items: AUXILIAR_PATIO_NAV.map((i) => ({
          href: i.href,
          view: i.view as ModuleId,
          label: i.label,
          tip: i.tip,
        })),
      };
      return [dept];
    }

    if (role === "conductor") {
      const dept: NavDepartment = {
        id: "logistica",
        label: "FSG Pilot",
        tip: "Preop · SOS · Viático",
        items: CONDUCTOR_PILOT_NAV.map((i) => ({
          href: i.href,
          view: i.view as ModuleId,
          label: i.label,
          tip: i.tip,
        })),
      };
      return [dept];
    }

    if (role === "sub_gerente") {
      const dept: NavDepartment = {
        id: "gerencia",
        label: "Ejecución Táctica",
        tip: "Conflictos · Deadhead · Proyectos",
        items: SUBGERENTE_NAV.map((i) => ({
          href: i.href,
          view: i.view as ModuleId,
          label: i.label,
          tip: i.tip,
        })),
      };
      return [dept];
    }

    const allowed = new Set(ROLE_VIEWS[role] || []);
    return NAV_DEPARTMENTS.filter((dept) =>
      dept.items.some(
        (item) =>
          item.view === "cuenta" || allowed.has(item.view as ModuleId),
      ),
    ).map((dept) => ({
      ...dept,
      items: dept.items.filter(
        (item) =>
          item.view === "cuenta" || allowed.has(item.view as ModuleId),
      ),
    }));
  }, [user]);

  const defaultOpenId: NavDeptId = user
    ? ROLE_DEFAULT_NAV_DEPT[normalizeRole(user.role)] || "logistica"
    : "logistica";

  const flatNav: FlatNavItem[] = useMemo(() => {
    const areas = departments.flatMap((d) =>
      d.items.map((i) => ({
        href: i.href.split("#")[0],
        view: i.view,
        label: i.label,
      })),
    );
    return [
      ...areas,
      { href: "/cuenta", view: "cuenta" as const, label: "Mi cuenta" },
    ];
  }, [departments]);

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
    <NotificationsProvider>
      <div className="flt-shell">
        <TopBar
          userName={user.name}
          roleLabel={ROLE_LABELS[normalizeRole(user.role)] || user.role}
          moduleBadge={currentModuleLabel(pathname)}
        />
        <div className="flt-shell-body">
          <SideNav
            departments={departments}
            defaultOpenId={
              departments.some((d) => d.id === defaultOpenId)
                ? defaultOpenId
                : departments[0]?.id || "logistica"
            }
            onLogout={logout}
          />
          <main className="flt-workbench">{children}</main>
          <InspectorDrawer />
          <HelpSheet />
        </div>
        <CommandSearch items={flatNav} />
        <NotificationToasts />
      </div>
    </NotificationsProvider>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ShellProvider>
      <ShellFrame>{children}</ShellFrame>
    </ShellProvider>
  );
}
