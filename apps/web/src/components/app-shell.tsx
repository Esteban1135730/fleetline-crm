"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MODULE_LABELS,
  ROLE_DEFAULT_NAV_DEPT,
  ROLE_LABELS,
  isPathDeniedForRole,
  navDeptForPath,
  normalizeRole,
  resolveModuleId,
  systemStatusEs,
  type ModuleId,
  type NavDeptId,
  type NavDepartment,
} from "@fsg/shared";
import { Button, Tooltip } from "@fsg/ui";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { brand } from "@/lib/brand";
import { buildNavDepartmentsForRole } from "@/lib/build-nav";
import { guideForPath } from "@/lib/module-guides";
import { ThemeToggle } from "@/lib/theme";
import { ShellProvider, useShell } from "@/lib/shell-context";
import { CommandSearch } from "@/components/shell/command-search";
import { NavIcon } from "@/components/shell/nav-icons";
import {
  NotificationBell,
  NotificationToasts,
} from "@/components/notifications/notification-center";
import { FormGuard } from "@/components/forms/form-guard";
import { ConfirmMutationHost } from "@/components/confirm-mutation-dialog";
import { NotificationsProvider } from "@/lib/notifications-context";
import { TourProvider, useTourOptional } from "@/lib/tour-context";
import { isQaViewerClient } from "@/lib/qa-trace";
import { useQaTraceBeacon } from "@/hooks/use-qa-trace-beacon";

const NAV_OPEN_KEY = "flt-nav-depts-open";

type FlatNavItem = {
  href: string;
  view: ModuleId | "cuenta";
  label: string;
};

import { NexaLogoIcon } from "@/components/ui/assets";

function currentModuleLabel(pathname: string): string {
  const seg = pathname.split("/").filter(Boolean)[0] || "dashboard";
  if (seg === "cuenta") return "Cuenta";
  const resolved = resolveModuleId(seg);
  if (resolved) return MODULE_LABELS[resolved];
  return "Operaciones de flota";
}

function pathMatches(href: string, pathname: string) {
  const base = href.split("#")[0];
  if (base === "/dashboard") {
    return pathname === "/dashboard" || pathname === "/";
  }
  return pathname === base || pathname.startsWith(`${base}/`);
}

function readOpenDepts(fallback: NavDeptId[]): NavDeptId[] {
  const valid = new Set<string>([
    "direccion",
    "soporte",
    "comercial",
    "juridico",
    "finanzas",
    "riesgos",
    "operaciones",
    "compras_mtto",
  ]);
  try {
    const raw = localStorage.getItem(NAV_OPEN_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return fallback;
    const next = parsed.filter(
      (x): x is NavDeptId => typeof x === "string" && valid.has(x),
    );
    return next.length ? next : fallback;
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
  const {
    user,
    organizations = [],
    activeOrganizationId,
    setActiveOrganization,
  } = useAuth();
  const orgList = Array.isArray(organizations) ? organizations : [];
  const isMaster = user?.role === "platform_master";
  const activeOrgName =
    orgList.find((o) => o.id === activeOrganizationId)?.name ||
    user?.organizationName;
  /** Evita mismatch SSR/cliente (Mac vs Windows) */
  const [modLabel, setModLabel] = useState("Ctrl K");
  useEffect(() => {
    const isApple = /Mac|iPhone|iPad|iPod/.test(
      navigator.platform || navigator.userAgent,
    );
    setModLabel(isApple ? "⌘K" : "Ctrl K");
  }, []);
  const statusClass =
    systemStatus === "NOMINAL"
      ? "text-[var(--brand-primary)]"
      : systemStatus === "ALERT"
        ? "text-[var(--brand-warning)]"
        : "text-[var(--brand-danger)]";

  return (
    <header className="flt-topbar">
      <div className="flt-topbar-left">
        <button
          type="button"
          className="flt-icon-btn lg:hidden"
          onClick={toggleSidebar}
          aria-label="Abrir menú"
          title="Abrir menú"
        >
          <NavIcon view="menu" className="h-4 w-4" />
        </button>
        <NexaLogoIcon className="brand-mark hidden h-7 w-7 sm:block" />
        <p className="hidden truncate font-display text-sm font-bold tracking-tight text-[var(--brand-text-primary)] sm:block">
          {brand.name}
        </p>
        <span className="flt-module-badge" data-tour="module">
          {moduleBadge}
        </span>
      </div>

      <button
        type="button"
        className="flt-search-trigger"
        data-tour="search"
        onClick={() => setCommandOpen(true)}
        title={`Buscar (${modLabel})`}
      >
        <NavIcon view="search" className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">Buscar…</span>
        <kbd className="flt-kbd hidden md:inline-flex" suppressHydrationWarning>
          {modLabel}
        </kbd>
      </button>

      <div className="flt-topbar-right">
        <span
          className={`flt-status-dot ${statusClass}`}
          title={`Estado del sistema: ${systemStatusEs(systemStatus)}`}
          aria-label={`Estado ${systemStatusEs(systemStatus)}`}
        />
        <NotificationBell />
        <button
          type="button"
          className={`flt-help-btn ${helpOpen ? "is-active" : ""}`}
          data-tour="help"
          onClick={toggleHelp}
          aria-label="Ayuda"
          aria-pressed={helpOpen}
          title="Ayuda (Ctrl+/)"
        >
          ?
        </button>
        <ThemeToggle />
        {isMaster && orgList.length > 0 ? (
          <select
            className="field hidden h-8 max-w-[140px] py-0 text-xs lg:block"
            data-testid="tenant-switcher"
            data-field="skip"
            aria-label="Empresa activa"
            title="Empresa activa"
            value={activeOrganizationId || user?.organizationId || ""}
            onChange={(e) => setActiveOrganization?.(e.target.value)}
          >
            {orgList.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        ) : null}
        <div
          className="flt-user-chip"
          data-tour="user"
          title={`${userName} · ${roleLabel}${activeOrgName ? ` · ${activeOrgName}` : ""}`}
        >
          <span className="flt-avatar" aria-hidden>
            {(userName || "?").slice(0, 1).toUpperCase()}
          </span>
          <p className="hidden min-w-0 max-w-[120px] truncate text-xs font-semibold text-[var(--brand-text-primary)] lg:block">
            {userName}
          </p>
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
        data-tour="sidebar"
        aria-label="Menú por áreas"
      >
        <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-[var(--brand-border)] px-3">
          {!sidebarCollapsed ? (
            <p className="min-w-0 truncate px-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--brand-text-secondary)]">
              Menú
            </p>
          ) : (
            <span className="mx-auto text-[var(--brand-primary)]">
              <NexaLogoIcon className="brand-mark h-6 w-6" />
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
                sidebarCollapsed ? "Expandir menú lateral" : "Colapsar menú lateral"
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

        <nav className="flex-1 overflow-y-auto py-2" aria-label="Áreas del sistema">
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
                <Link
                  key={dept.id}
                  href={primary.href}
                  title={dept.label}
                  className={`flt-nav-item ${anyActive ? "is-active" : ""}`}
                  onClick={() => {
                    if (window.innerWidth < 1024) setSidebarCollapsed(true);
                  }}
                >
                  <NavIcon view={primary.view} className="h-4 w-4 shrink-0" />
                </Link>
              );
            }

            if (!multi) {
              return (
                <Link
                  key={dept.id}
                  href={primary.href}
                  title={dept.tip || primary.tip}
                  className={`flt-nav-item ${anyActive ? "is-active" : ""}`}
                  onClick={() => {
                    if (window.innerWidth < 1024) setSidebarCollapsed(true);
                  }}
                >
                  <NavIcon
                    view={primary.view}
                    className="h-3.5 w-3.5 shrink-0"
                  />
                  <span className="min-w-0 flex-1 truncate">{dept.label}</span>
                </Link>
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
                        <Link
                          key={item.href}
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
                          <span className="min-w-0 flex-1 truncate">
                            {item.label}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-[var(--brand-border)] p-2">
          <Link
            href="/cuenta"
            className={`flt-nav-item ${pathname.startsWith("/cuenta") ? "is-active" : ""}`}
            title="Mi cuenta"
          >
            <NavIcon view="cuenta" className="h-3.5 w-3.5 shrink-0" />
            {!sidebarCollapsed ? (
              <span className="min-w-0 flex-1 truncate">Mi cuenta</span>
            ) : null}
          </Link>
          <button
            type="button"
            className="flt-nav-item w-[calc(100%-1rem)] border-0 bg-transparent text-left"
            onClick={onLogout}
            title="Cerrar sesión"
          >
            {sidebarCollapsed ? (
              <NavIcon view="close" className="h-4 w-4 shrink-0" />
            ) : (
              <>
                <NavIcon view="close" className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">Cerrar sesión</span>
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  );
}

function HelpStepText({ text }: { text: string }) {
  const parts = text.split(/(Cmd\/Ctrl\+[K/]|Ctrl\+K|Esc|⌘K)/g);
  return (
    <p className="text-sm leading-relaxed text-[var(--brand-text-primary)]">
      {parts.map((part, i) =>
        /^(Cmd\/Ctrl\+[K/]|Ctrl\+K|Esc|⌘K)$/.test(part) ? (
          <kbd
            key={`${part}-${i}`}
            className="flt-kbd mx-0.5 rounded-md border px-2 py-0.5 font-mono text-xs"
          >
            {part}
          </kbd>
        ) : (
          <span key={`${i}-${part.slice(0, 8)}`}>{part}</span>
        ),
      )}
    </p>
  );
}

function HelpSheet() {
  const pathname = usePathname();
  const { helpOpen, setHelpOpen } = useShell();
  const tour = useTourOptional();
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
        <div className="flex h-[var(--flt-topbar-h)] items-center justify-between border-b border-[var(--brand-border)] px-4">
          <div className="min-w-0">
            <p className="font-data text-[9px] uppercase tracking-[0.16em] text-[var(--brand-text-secondary)]">
              Asistencia contextual
            </p>
            <h2 className="truncate text-sm font-semibold text-[var(--brand-text-primary)]">
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
          <p className="text-sm leading-relaxed text-[var(--brand-text-secondary)]">
            {guide.summary}
          </p>
          <ol className="space-y-3">
            {guide.steps.map((step, i) => (
              <li key={step} className="flt-help-step" title={`Paso ${i + 1}`}>
                <span className="flt-help-step-num font-data">{i + 1}</span>
                <HelpStepText text={step} />
              </li>
            ))}
          </ol>
          {tour ? (
            <Button
              type="button"
              variant="secondary"
              className="w-auto px-4 py-2"
              onClick={() => {
                setHelpOpen(false);
                tour.startTourForCurrent();
              }}
            >
              Iniciar recorrido guiado
            </Button>
          ) : null}
          <p className="font-data text-[10px] uppercase tracking-[0.12em] text-[var(--brand-text-secondary)]">
            Atajo:{" "}
            <kbd className="flt-kbd rounded-md border px-2 py-0.5 font-mono text-xs normal-case tracking-normal">
              Cmd/Ctrl+/
            </kbd>{" "}
            ·{" "}
            <kbd className="flt-kbd rounded-md border px-2 py-0.5 font-mono text-xs normal-case tracking-normal">
              Esc
            </kbd>{" "}
            cierra
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
        <div className="flex h-[var(--flt-topbar-h)] items-center justify-between border-b border-[var(--brand-border)] px-4">
          <div className="min-w-0">
            <p className="font-data text-[9px] uppercase tracking-[0.16em] text-[var(--brand-text-secondary)]">
              Inspector
            </p>
            <h2 className="truncate text-sm font-semibold text-[var(--brand-text-primary)]">
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
  const { setSystemStatus, crisisActive, crisisCode, setCrisisActive } =
    useShell();
  useQaTraceBeacon();

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
    api<{ active: boolean; session?: { code?: string } | null }>(
      "/api/v1/presidencia/defcon/active",
    )
      .then((res) => {
        if (res.active) {
          setCrisisActive(true, res.session?.code ?? null);
        } else {
          // Sincronizar apagado: limpia sessionStorage y el banner.
          setCrisisActive(false);
        }
      })
      .catch(() => undefined);
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
  }, [user, setSystemStatus, setCrisisActive]);

  const departments = useMemo(() => {
    if (!user) return [];
    return buildNavDepartmentsForRole(user.role);
  }, [user]);

  const defaultOpenId: NavDeptId = user
    ? ROLE_DEFAULT_NAV_DEPT[normalizeRole(user.role)] || "operaciones"
    : "operaciones";

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
      <div className="flex h-screen items-center justify-center bg-brand-canvas text-brand-text-secondary">
        <div className="flex items-center gap-3">
          <NexaLogoIcon className="brand-mark h-7 w-7" />
          <span className="font-display text-lg tracking-tight">
            Sincronizando {brand.name}…
          </span>
        </div>
      </div>
    );
  }

  if (
    user.mustChangePassword &&
    (pathname === "/cuenta" || pathname.startsWith("/cuenta"))
  ) {
    return <>{children}</>;
  }

  return (
    <div className="flt-shell">
      {crisisActive ? (
        <div
          className="pointer-events-none fixed inset-0 z-[1] animate-pulse bg-brand-danger/10"
          aria-hidden
        />
      ) : null}
      {crisisActive ? (
        <div className="flt-crisis-banner relative z-[2] border-b border-brand-danger/40 bg-brand-danger/20 px-4 py-1.5 text-center font-data text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-danger">
          Protocolo de crisis activo
          {crisisCode ? ` · ${crisisCode}` : ""} — modo sala de guerra
        </div>
      ) : null}
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
                : departments[0]?.id || "operaciones"
            }
            onLogout={logout}
          />
          <main className="flt-workbench" data-tour="workbench">
            {children}
          </main>
          <InspectorDrawer />
          <HelpSheet />
        </div>
        <CommandSearch items={flatNav} />
        <NotificationToasts />
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ShellProvider>
      <TourProvider>
        <FormGuard />
        <ConfirmMutationHost />
        <NotificationsProvider>
          <ShellFrame>{children}</ShellFrame>
        </NotificationsProvider>
      </TourProvider>
    </ShellProvider>
  );
}
