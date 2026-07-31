"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ROLE_LABELS } from "@fsg/shared";
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
    href: "/logistica",
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
    href: "/logistica",
    title: "Ver mapa en vivo",
    hint: "GPS de flota",
    tip: "Muestra coordenadas GPS registradas de las unidades en Logística.",
  },
] as const;

export default function DashboardPage() {
  const { user } = useAuth();
  const { setHelpOpen } = useShell();
  const [m, setM] = useState<Metrics | null>(null);
  const [error, setError] = useState("");
  const firstName = user?.name?.split(" ")[0] || "Operador";

  useEffect(() => {
    api<Metrics>("/dashboard/metrics")
      .then(setM)
      .catch((e) => setError(e instanceof Error ? e.message : "Error de uplink"));
  }, []);

  const alertas = m ? m.bloqueosHoy + m.novedades : 0;
  const alertTone =
    alertas === 0 ? "ok" : alertas <= 3 ? "warn" : "critical";

  return (
    <div className="fade-in mx-auto max-w-[960px] space-y-10 py-2">
      <header className="flt-cockpit-banner">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-data text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--accent-primary)]">
              Clean Cockpit · {user ? ROLE_LABELS[user.role] : "—"}
            </p>
            <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl">
              Hola {firstName}, este es el estado operativo de hoy
            </h1>
            <p className="mt-2 max-w-xl text-sm text-[var(--text-secondary)]">
              Tres señales. Cuatro acciones. Sin ruido.
            </p>
          </div>
          <Tooltip content="Abre la guía de 3 pasos de este cockpit (también Cmd/Ctrl+/)">
            <button
              type="button"
              className="flt-help-btn"
              onClick={() => setHelpOpen(true)}
              title="Cómo leer el cockpit"
              aria-label="Cómo leer el cockpit"
            >
              ?
            </button>
          </Tooltip>
        </div>
      </header>

      {error ? (
        <p className="text-sm text-[var(--accent-alert)]">{error}</p>
      ) : null}

      {m ? (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div
            className="flt-kpi-giant flt-kpi-giant--ok"
            title="Viajes en ASSIGNED o IN_TRANSIT ahora mismo"
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
        <p className="text-sm text-[var(--text-secondary)]">
          Sincronizando estado operativo…
        </p>
      )}

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          Acciones rápidas
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {ACTIONS.map((a) => (
            <Tooltip key={a.title} content={a.tip} side="bottom" className="w-full">
              <Link href={a.href} className="flt-quick-action group w-full" title={a.tip}>
                <span className="min-w-0">
                  <span className="block font-display text-base font-semibold text-[var(--text-primary)]">
                    {a.title}
                  </span>
                  <span className="mt-0.5 block text-sm text-[var(--text-secondary)]">
                    {a.hint}
                  </span>
                </span>
                <span className="font-data text-xs font-semibold text-[var(--accent-primary)] opacity-70 transition group-hover:opacity-100">
                  Abrir →
                </span>
              </Link>
            </Tooltip>
          ))}
        </div>
        <div className="flex flex-wrap gap-3 pt-1 text-sm">
          <Tooltip content="Ir a Tesorería: CxC / CxP y aprobación de pagos">
            <Link
              href="/tesoreria"
              className="text-[var(--accent-primary)] underline-offset-2 hover:underline"
              title="Abrir Tesorería"
            >
              Tesorería
            </Link>
          </Tooltip>
          <Tooltip content="Ir al Data Room: documentos con hash SHA-256">
            <Link
              href="/archivo"
              className="text-[var(--accent-primary)] underline-offset-2 hover:underline"
              title="Abrir Archivo digital"
            >
              Archivo
            </Link>
          </Tooltip>
        </div>
      </section>
    </div>
  );
}
