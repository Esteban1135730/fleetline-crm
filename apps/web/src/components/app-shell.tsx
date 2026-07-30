"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  MODULE_LABELS,
  ROLE_LABELS,
  ROLE_VIEWS,
  type ModuleId,
} from "@fsg/shared";
import { Button } from "@fsg/ui";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { brand } from "@/lib/brand";
import { ThemeToggle } from "@/lib/theme";
import { ShellProvider, useShell } from "@/lib/shell-context";
import { CommandSearch } from "@/components/shell/command-search";
import { NavIcon } from "@/components/shell/nav-icons";

const NAV: { href: string; view: ModuleId | "cuenta"; section: string }[] = [
  { href: "/dashboard", view: "dashboard", section: "Gerencia" },
  { href: "/apps", view: "apps", section: "Gerencia" },
  { href: "/usuarios", view: "usuarios", section: "Gerencia" },
  { href: "/comercial", view: "comercial", section: "Comercial" },
  { href: "/logistica", view: "logistica", section: "Operaciones" },
  { href: "/parqueadero", view: "parqueadero", section: "Operaciones" },
  { href: "/tramites", view: "tramites", section: "Operaciones" },
  { href: "/taller", view: "taller", section: "Flota" },
  { href: "/compras", view: "compras", section: "Compras" },
  { href: "/finanzas", view: "finanzas", section: "Tesorería" },
  { href: "/contabilidad", view: "contabilidad", section: "Tesorería" },
  { href: "/revisoria", view: "revisoria", section: "Tesorería" },
  { href: "/rrhh", view: "rrhh", section: "Personas" },
  { href: "/atencion", view: "atencion", section: "Call Center" },
  { href: "/calidad", view: "calidad", section: "HSQE" },
  { href: "/recepcion", view: "recepcion", section: "Archivo y sede" },
  { href: "/archivo", view: "archivo", section: "Archivo y sede" },
  { href: "/juridico", view: "juridico", section: "Cumplimiento" },
  { href: "/sarlaft", view: "sarlaft", section: "Cumplimiento" },
  { href: "/sistemas", view: "sistemas", section: "Tecnología" },
  { href: "/cuenta", view: "cuenta", section: "Cuenta" },
];

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

function TopBar({
  userName,
  roleLabel,
  moduleBadge,
}: {
  userName: string;
  roleLabel: string;
  moduleBadge: string;
}) {
  const { systemStatus, setCommandOpen, toggleSidebar } = useShell();
  const statusClass =
    systemStatus === "NOMINAL"
      ? "text-[var(--accent-primary)]"
      : systemStatus === "ALERT"
        ? "text-[var(--accent-metric)]"
        : "text-[var(--accent-alert)]";

  return (
    <header className="flt-topbar">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          className="flt-icon-btn lg:hidden"
          onClick={toggleSidebar}
          aria-label="Abrir navegación"
        >
          <NavIcon view="menu" className="h-4 w-4" />
        </button>
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
        <span className="flt-module-badge hidden md:inline-flex">{moduleBadge}</span>
      </div>

      <button
        type="button"
        className="flt-search-trigger"
        onClick={() => setCommandOpen(true)}
      >
        <NavIcon view="search" className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">Buscar vehículo, cliente, viaje o guía...</span>
        <kbd className="flt-kbd hidden sm:inline-flex">
          {typeof navigator !== "undefined" &&
          /Mac|iPhone|iPad/.test(navigator.platform)
            ? "⌘K"
            : "Ctrl K"}
        </kbd>
      </button>

      <div className="flex items-center justify-end gap-2 sm:gap-3">
        <p
          className={`hidden font-data text-[10px] uppercase tracking-[0.12em] xl:block ${statusClass}`}
        >
          SYSTEM STATUS: {systemStatus}
        </p>
        <ThemeToggle />
        <div className="flt-user-chip">
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
  navBySection,
  onLogout,
}: {
  navBySection: { section: string; items: typeof NAV }[];
  onLogout: () => void;
}) {
  const pathname = usePathname();
  const { sidebarCollapsed, setSidebarCollapsed, toggleSidebar } = useShell();

  return (
    <>
      {!sidebarCollapsed ? (
        <button
          type="button"
          className="flt-sidebar-scrim lg:hidden"
          aria-label="Cerrar navegación"
          onClick={() => setSidebarCollapsed(true)}
        />
      ) : null}
      <aside
        className={`flt-sidebar ${sidebarCollapsed ? "is-collapsed" : "is-expanded"}`}
      >
        <div className="flex h-[60px] items-center justify-between border-b border-[var(--border-subtle)] px-3">
          {!sidebarCollapsed ? (
            <p className="px-1 font-data text-[9px] uppercase tracking-[0.16em] text-[var(--text-secondary)]">
              Navegación
            </p>
          ) : (
            <span className="mx-auto text-[var(--accent-primary)]">
              <BrandMark className="h-6 w-6" />
            </span>
          )}
          <button
            type="button"
            className="flt-icon-btn"
            onClick={toggleSidebar}
            title={sidebarCollapsed ? "Expandir" : "Colapsar"}
            aria-label={sidebarCollapsed ? "Expandir sidebar" : "Colapsar sidebar"}
          >
            <NavIcon
              view="collapse"
              className={`h-4 w-4 transition-transform duration-150 ${
                sidebarCollapsed ? "rotate-180" : ""
              }`}
            />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3">
          {navBySection.map((group) => (
            <div key={group.section} className="mb-3">
              {!sidebarCollapsed ? (
                <p className="px-4 pb-1.5 font-data text-[9px] uppercase tracking-[0.16em] text-[var(--text-secondary)]">
                  {group.section}
                </p>
              ) : null}
              {group.items.map((item) => {
                const active = pathname.startsWith(item.href);
                const label =
                  item.view === "cuenta"
                    ? "Mi cuenta"
                    : MODULE_LABELS[item.view];
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={label}
                    className={`flt-nav-item ${active ? "is-active" : ""}`}
                    onClick={() => {
                      if (window.innerWidth < 1024) setSidebarCollapsed(true);
                    }}
                  >
                    <NavIcon view={item.view} className="h-4 w-4 shrink-0" />
                    {!sidebarCollapsed ? (
                      <span className="truncate">{label}</span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="border-t border-[var(--border-subtle)] p-3">
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
          <button
            type="button"
            className="flt-icon-btn"
            onClick={closeInspector}
            aria-label="Cerrar inspector"
          >
            <NavIcon view="close" className="h-4 w-4" />
          </button>
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

  const navBySection = useMemo(() => {
    if (!user) return [];
    const allowed = ROLE_VIEWS[user.role] || [];
    const items = NAV.filter(
      (n) => n.view === "cuenta" || allowed.includes(n.view as ModuleId),
    );
    const sections: { section: string; items: typeof NAV }[] = [];
    for (const item of items) {
      const last = sections[sections.length - 1];
      if (!last || last.section !== item.section) {
        sections.push({ section: item.section, items: [item] });
      } else {
        last.items.push(item);
      }
    }
    return sections;
  }, [user]);

  const flatNav = useMemo(
    () => navBySection.flatMap((g) => g.items),
    [navBySection],
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
        <SideNav navBySection={navBySection} onLogout={logout} />
        <main className="flt-workbench">{children}</main>
        <InspectorDrawer />
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
