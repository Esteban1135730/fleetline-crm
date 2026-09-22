"use client";

import { useState } from "react";

export type OpsTripCard = {
  id: string;
  code: string;
  status: string;
  origin: string;
  destination: string;
  departAt: string;
  customer?: { id: string; name: string } | null;
  driver?: {
    id: string;
    name: string;
    document?: string;
    fatigueScore?: number;
    dispatchBlocked?: boolean;
  } | null;
  vehicle?: {
    id: string;
    plate: string;
    status: string;
    capacity?: number;
    lat?: number | null;
    lng?: number | null;
  } | null;
};

/** Columnas UI del tablero de operaciones (agrupan TripStatus de Prisma). */
export const OPS_TRIP_COLUMNS = [
  {
    key: "PLANIFICADO",
    label: "Planificado",
    statuses: [
      "PENDING",
      "ASSIGNED",
      "AWAITING_PREOP",
      "AWAITING_FUEC",
      "PENDING_SUPERVISOR_APPROVAL",
    ],
    /** Estado al soltar la tarjeta en esta columna */
    dropStatus: "ASSIGNED",
  },
  {
    key: "EN_RUTA",
    label: "En ruta",
    statuses: ["IN_TRANSIT"],
    dropStatus: "IN_TRANSIT",
  },
  {
    key: "EN_PATIO",
    label: "En patio",
    statuses: ["COMPLETED"],
    dropStatus: "COMPLETED",
  },
  {
    key: "INCIDENTE",
    label: "Incidente",
    statuses: ["INCIDENT"],
    dropStatus: "INCIDENT",
  },
] as const;

export type OpsColumnKey = (typeof OPS_TRIP_COLUMNS)[number]["key"];

export function columnKeyForStatus(status: string): OpsColumnKey {
  const u = String(status || "").toUpperCase();
  for (const col of OPS_TRIP_COLUMNS) {
    if ((col.statuses as readonly string[]).includes(u)) return col.key;
  }
  return "PLANIFICADO";
}

export function groupTripsByColumn(
  trips: OpsTripCard[],
): Record<OpsColumnKey, OpsTripCard[]> {
  const out: Record<OpsColumnKey, OpsTripCard[]> = {
    PLANIFICADO: [],
    EN_RUTA: [],
    EN_PATIO: [],
    INCIDENTE: [],
  };
  for (const t of trips) {
    out[columnKeyForStatus(t.status)].push(t);
  }
  return out;
}

function formatDepart(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type Props = {
  trips: OpsTripCard[];
  onOpenTrip: (trip: OpsTripCard) => void;
  onMoveTrip: (tripId: string, dropStatus: string) => Promise<void> | void;
  busy?: boolean;
  selectedTripId?: string | null;
};

/** Tablero de viajes — drag & drop HTML5 (mismo patrón que Comercial). */
export function OpsTripKanbanBoard({
  trips,
  onOpenTrip,
  onMoveTrip,
  busy,
  selectedTripId,
}: Props) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  const kanban = groupTripsByColumn(trips);

  return (
    <div className="grid gap-3 overflow-x-auto md:grid-cols-4">
      {OPS_TRIP_COLUMNS.map((col) => {
        const cards = kanban[col.key] ?? [];
        const isOver = overCol === col.key;
        return (
          <div
            key={col.key}
            className={`nexa-panel min-w-[180px] !p-3 transition-colors ${
              isOver
                ? "border-[var(--brand-primary)]/50 bg-[var(--brand-primary)]/5"
                : ""
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setOverCol(col.key);
            }}
            onDragLeave={() => {
              if (overCol === col.key) setOverCol(null);
            }}
            onDrop={() => {
              setOverCol(null);
              if (dragId) {
                void onMoveTrip(dragId, col.dropStatus);
                setDragId(null);
              }
            }}
          >
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-primary)]">
                {col.label}
              </h3>
              <span className="font-data text-[10px] tabular-nums text-[var(--brand-text-secondary)]">
                {cards.length}
              </span>
            </div>
            <div className="min-h-[120px] space-y-2">
              {cards.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  draggable={!busy}
                  onDragStart={() => setDragId(t.id)}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverCol(null);
                  }}
                  onClick={() => onOpenTrip(t)}
                  className={`w-full cursor-grab rounded-lg border bg-[var(--brand-canvas)] p-2 text-left transition-colors hover:border-[var(--brand-border-active)] active:cursor-grabbing ${
                    selectedTripId === t.id
                      ? "border-[var(--brand-primary)]"
                      : "border-[var(--brand-border)]"
                  } ${dragId === t.id ? "opacity-60" : ""}`}
                >
                  <p className="truncate text-sm text-[var(--brand-text-primary)]">
                    {t.code}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-[var(--brand-text-secondary)]">
                    {t.origin} → {t.destination}
                  </p>
                  <p className="mt-1 font-data text-[10px] text-[var(--brand-text-secondary)]">
                    {formatDepart(t.departAt)}
                    {t.vehicle?.plate ? ` · ${t.vehicle.plate}` : ""}
                  </p>
                  {t.driver?.name ? (
                    <p className="truncate font-data text-[10px] text-[var(--brand-text-secondary)]">
                      {t.driver.name}
                    </p>
                  ) : null}
                </button>
              ))}
              {!cards.length ? (
                <p className="px-1 py-6 text-center text-xs text-[var(--brand-text-secondary)]">
                  Sin viajes
                </p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
