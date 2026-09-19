"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ROLE_LABELS,
  isPathDeniedForRole,
  resolveModuleId,
} from "@fsg/shared";
import { Tooltip } from "@fsg/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useShell } from "@/lib/shell-context";

type Metrics = {
  ingresosMtd: number;
  viajesActivos: number;
  viajesMes: number;
  novedades: number;
  bloqueosHoy: number;
};

function money(n: number) {
  return `$${(n / 1_000_000).toFixed(1)}M`;
}

const ACTIONS = [
  {
    href: "/logistica/servicios",
    title: "Crear nuevo viaje",
    hint: "Despacho y ruta",
    tip: "Abre Logística para registrar un viaje con origen, destino y unidad.",
  },
  {
    href: "/taller",
    title: "Registrar mantenimiento",
    hint: "Orden de trabajo",
    tip: "Abre Taller para crear o actualizar una OT de la flota.",
  },
  {
    href: "/tramites",
    title: "Consultar vehículo",
    hint: "Semáforo documental",
    tip: "Abre Trámites para ver SOAT/tecnomecánica y bloqueos de despacho.",
  },
  {
    href: "/logistica/servicios",
    title: "Ver mapa en vivo",
    hint: "GPS de flota",
    tip: "Muestra coordenadas GPS registradas de las unidades en Logística.",
  },
] as const;

function canOpenPath(
  role: string | undefined,
  canAccess: (view: string) => boolean,
  href: string,
): boolean {
  if (!role) return false;
  if (isPathDeniedForRole(role, href)) return false;
  const seg = href.split("/").filter(Boolean)[0] || "dashboard";
  const resolved = resolveModuleId(seg) || seg;
  return canAccess(resolved);
}

export default function DashboardPage() {
  const { user, canAccess } = useAuth();
  const { setHelpOpen } = useShell();
  const [m, setM] = useState<Metrics | null>(null);
  const [error, setError] = useState("");
  const firstName = user?.name?.split(" ")[0] || "Operador";

  const visibleActions = useMemo(
    () =>
      ACTIONS.filter((a) =>
        canOpenPath(user?.role, canAccess, a.href),
      ),
    [user?.role, canAccess],
  );

  const showTesoreria = canOpenPath(user?.role, canAccess, "/tesoreria");
  const showArchivo = canOpenPath(user?.role, canAccess, "/archivo");

  useEffect(() => {
    api<Metrics>("/dashboard/metrics")
      .then(setM)
      .catch((e) => setError(e instanceof Error ? e.message : "Error de conexión"));
  }, []);

  const alertas = m ? m.bloqueosHoy + m.novedades : 0;
  const alertTone =
    alertas === 0 ? "ok" : alertas <= 3 ? "warn" : "critical";

  return (
    <div className="fade-in mx-auto max-w-[960px] space-y-10 py-2">
      <header className="flt-cockpit-banner">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-data text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--brand-primary)]">
              Tablero operativo · {user ? ROLE_LABELS[user.role] : "—"}
            </p>
            <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-[var(--brand-text-primary)] sm:text-3xl">
              Hola {firstName}, este es el estado operativo de hoy
            </h1>
            <p className="mt-2 max-w-xl text-sm text-[var(--brand-text-secondary)]">
              Tres señales. Cuatro acciones. Sin ruido.
            </p>
          </div>
          <Tooltip content="Abre la guía de 3 pasos de este cockpit (también Cmd/Ctrl+/)">
            <button
              type="button"
              className="flt-help-btn"
              onClick={() => setHelpOpen(true)}
              title="Cómo leer el tablero"
              aria-label="Cómo leer el tablero"
            >
              ?
            </button>
          </Tooltip>
        </div>
      </header>

      {error ? (
        <p className="text-sm text-[var(--brand-danger)]">{error}</p>
      ) : null}

      {m ? (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3" data-tour="kpi">
          <div
            className="flt-kpi-giant flt-kpi-giant--ok"
            title="Viajes asignados o en ruta ahora mismo"
          >
            <p className="flt-kpi-giant-label">Viajes activos</p>
            <p className="flt-kpi-giant-value font-data">{m.viajesActivos}</p>
            <p className="flt-kpi-giant-hint font-data">
              {m.viajesMes} programados este mes
            </p>
          </div>
          <div
            className={`flt-kpi-giant ${
              alertTone === "ok"
                ? "flt-kpi-giant--ok"
                : alertTone === "warn"
                  ? "flt-kpi-giant--warn"
                  : "flt-kpi-giant--critical"
            }`}
            title="Suma de novedades e incidentes de hoy. Rojo/ámbar = revisar Trámites o Logística"
          >
            <p className="flt-kpi-giant-label">Alertas / bloqueos</p>
            <p className="flt-kpi-giant-value font-data">{alertas}</p>
            <p className="flt-kpi-giant-hint font-data">
              {m.bloqueosHoy} hoy · {m.novedades} novedades
            </p>
          </div>
          <div
            className="flt-kpi-giant flt-kpi-giant--metric"
            title="Ingresos CxC del mes (pagadas + emitidas abiertas)"
          >
            <p className="flt-kpi-giant-label">Facturación del mes</p>
            <p className="flt-kpi-giant-value font-data">
              {money(m.ingresosMtd)}
            </p>
            <p className="flt-kpi-giant-hint font-data">CxC MTD</p>
          </div>
        </section>
      ) : (
        <p className="text-sm text-[var(--brand-text-secondary)]">
          Sincronizando estado operativo…
        </p>
      )}

      <section className="space-y-3" data-tour="secondary">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          Acciones rápidas
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {visibleActions.map((a) => (
            <Tooltip key={a.title} content={a.tip} side="bottom" className="w-full">
              <Link href={a.href} className="flt-quick-action group w-full" title={a.tip}>
                <span className="min-w-0">
                  <span className="block font-display text-base font-semibold text-[var(--brand-text-primary)]">
                    {a.title}
                  </span>
                  <span className="mt-0.5 block text-sm text-[var(--brand-text-secondary)]">
                    {a.hint}
                  </span>
                </span>
                <span className="font-data text-xs font-semibold text-[var(--brand-primary)] opacity-70 transition group-hover:opacity-100">
                  Abrir →
                </span>
              </Link>
            </Tooltip>
          ))}
        </div>
        {showTesoreria || showArchivo ? (
        <div className="flex flex-wrap gap-3 pt-1 text-sm">
          {showTesoreria ? (
          <Tooltip content="Ir a Tesorería: CxC / CxP y aprobación de pagos">
            <Link
              href="/tesoreria"
              className="text-[var(--brand-primary)] underline-offset-2 hover:underline"
              title="Abrir Tesorería"
            >
              Tesorería
            </Link>
          </Tooltip>
          ) : null}
          {showArchivo ? (
          <Tooltip content="Ir a la sala documental: documentos con sello digital">
            <Link
              href="/archivo"
              className="text-[var(--brand-primary)] underline-offset-2 hover:underline"
              title="Abrir Archivo digital"
            >
              Archivo
            </Link>
          </Tooltip>
          ) : null}
        </div>
        ) : null}
      </section>
    </div>
  );
}
