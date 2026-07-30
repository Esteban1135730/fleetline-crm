"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  MODULE_HELP,
  MODULE_LABELS,
  ROLE_LABELS,
  ROLE_VIEWS,
  type ModuleId,
} from "@fsg/shared";
import { StatCard, ColorLegend, WorkbenchHeader, KpiRow, Button } from "@fsg/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useShell } from "@/lib/shell-context";
import { brand } from "@/lib/brand";
import {
  DashboardCharts,
  type ChartsPayload,
} from "@/components/dashboard-charts";

type Metrics = {
  ingresosMtd: number;
  egresosAbiertos: number;
  margenUtilidad: number;
  flotaOperacion: number;
  flotaTotal: number;
  viajesActivos: number;
  viajesMes: number;
  novedades: number;
  vehiculosTaller: number;
  nps: number;
  ticketsOpen: number;
};

const HREF: Partial<Record<ModuleId, string>> = {
  comercial: "/comercial",
  logistica: "/logistica",
  parqueadero: "/parqueadero",
  tramites: "/tramites",
  taller: "/taller",
  compras: "/compras",
  finanzas: "/finanzas",
  contabilidad: "/contabilidad",
  revisoria: "/revisoria",
  rrhh: "/rrhh",
  atencion: "/atencion",
  calidad: "/calidad",
  juridico: "/juridico",
  sarlaft: "/sarlaft",
  archivo: "/archivo",
  recepcion: "/recepcion",
  sistemas: "/sistemas",
  usuarios: "/usuarios",
  apps: "/apps",
};

const WORKFLOW: ModuleId[] = [
  "comercial",
  "logistica",
  "parqueadero",
  "tramites",
  "taller",
  "compras",
  "atencion",
  "finanzas",
  "rrhh",
  "calidad",
  "juridico",
  "sarlaft",
  "archivo",
  "recepcion",
  "revisoria",
  "contabilidad",
  "apps",
  "usuarios",
  "sistemas",
];

function money(n: number) {
  return `$${(n / 1_000_000).toFixed(1)}M`;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { openInspector } = useShell();
  const [m, setM] = useState<Metrics | null>(null);
  const [charts, setCharts] = useState<ChartsPayload | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api<Metrics>("/dashboard/metrics"),
      api<ChartsPayload>("/dashboard/charts"),
    ])
      .then(([metrics, chartData]) => {
        setM(metrics);
        setCharts(chartData);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error"));
  }, []);

  const cards = useMemo(() => {
    if (!user) return [];
    const allowed = new Set(ROLE_VIEWS[user.role] || []);
    return WORKFLOW.filter((id) => allowed.has(id));
  }, [user]);

  return (
    <div className="fade-in mx-auto max-w-[1200px] space-y-8">
      <WorkbenchHeader
        eyebrow={`${brand.name} · telemetría viva`}
        title={`Torre de control · ${user?.name?.split(" ")[0] || "Operador"}`}
        subtitle={`Rol ${user ? ROLE_LABELS[user.role] : "—"}. Métricas calculadas desde facturas, viajes, flota y calidad.`}
        action={
          <Button
            variant="primary"
            onClick={() =>
              openInspector(
                "Estado del nodo",
                <div className="space-y-3 text-sm">
                  <p className="font-data text-[10px] uppercase tracking-[0.14em] text-[var(--accent-primary)]">
                    SYSTEM STATUS: NOMINAL
                  </p>
                  <p className="text-[var(--text-secondary)]">
                    Uplink de métricas activo. Use Cmd/Ctrl+K para saltar entre
                    módulos sin abandonar el workbench.
                  </p>
                  {m ? (
                    <dl className="space-y-2 font-data text-xs">
                      <div className="flex justify-between gap-3">
                        <dt className="text-[var(--text-secondary)]">Viajes activos</dt>
                        <dd className="text-[var(--text-primary)]">{m.viajesActivos}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-[var(--text-secondary)]">Flota</dt>
                        <dd className="text-[var(--text-primary)]">
                          {m.flotaOperacion}/{m.flotaTotal}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-[var(--text-secondary)]">Tickets</dt>
                        <dd className="text-[var(--text-primary)]">{m.ticketsOpen}</dd>
                      </div>
                    </dl>
                  ) : null}
                </div>,
              )
            }
          >
            Inspeccionar nodo
          </Button>
        }
      />

      <div className="flt-panel !border-l-[3px] !border-l-[var(--accent-primary)]">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)]">
          Cómo leer los colores
        </p>
        <ColorLegend
          items={[
            { color: "verde", label: "Esmeralda: rutas OK / GPS / acciones" },
            { color: "amarillo", label: "Ámbar: KPIs / pendientes" },
            { color: "rojo", label: "Carmesí: fallas / retrasos / novedades" },
            { color: "azul", label: "Neutro: filtros / metadatos" },
          ]}
        />
      </div>

      {error ? (
        <p className="text-sm text-[var(--accent-alert)]">{error}</p>
      ) : null}

      {m ? (
        <KpiRow>
          <StatCard
            label="Ingresos MTD"
            value={money(m.ingresosMtd)}
            hint={`Margen ${m.margenUtilidad}%`}
            trend={m.margenUtilidad >= 0 ? `+${m.margenUtilidad}%` : `${m.margenUtilidad}%`}
            accent="primary"
          />
          <StatCard
            label="Viajes activos"
            value={String(m.viajesActivos)}
            hint={`${m.viajesMes} este mes`}
            trend={m.viajesActivos > 0 ? `+${m.viajesActivos}` : "0"}
            accent="amber"
          />
          <StatCard
            label="Flota lista"
            value={`${m.flotaOperacion}/${m.flotaTotal}`}
            hint={`${m.vehiculosTaller} en taller`}
            accent="primary"
          />
          <StatCard
            label="NPS"
            value={m.nps ? `${m.nps}/5` : "—"}
            hint={`${m.ticketsOpen} tickets abiertos`}
            accent="rose"
          />
        </KpiRow>
      ) : (
        <p className="text-sm text-[var(--text-secondary)]">Cargando métricas…</p>
      )}

      {charts ? (
        <section className="space-y-3">
          <h3 className="font-display text-lg font-bold tracking-tight">
            Analítica operativa
          </h3>
          <p className="text-sm text-[var(--text-secondary)]">
            Cada gráfico usa colores con significado operativo.
          </p>
          <DashboardCharts data={charts} />
        </section>
      ) : null}

      <div className="flt-panel !border-l-[3px] !border-l-[var(--accent-primary)]">
        <p className="text-sm font-semibold text-[var(--text-primary)]">
          Flujo del día
        </p>
        <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">
          Cliente → Viaje → Taller (si falla) → Cobro. Use los módulos de abajo
          según su rol.
        </p>
      </div>

      <section>
        <h3 className="font-display mb-3 text-lg font-semibold tracking-tight">
          Módulos del nodo
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {cards.map((id) => (
            <Link
              key={id}
              href={HREF[id] || "/dashboard"}
              className="flt-panel group flex flex-col gap-2 !p-4 transition duration-150 hover:-translate-y-0.5 hover:border-[var(--accent-primary)]"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-display text-base font-semibold">
                  {MODULE_LABELS[id]}
                </span>
                <span className="text-xs font-semibold text-[var(--accent-primary)] opacity-0 transition group-hover:opacity-100">
                  Abrir →
                </span>
              </div>
              <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                {MODULE_HELP[id]}
              </p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
