"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@fsg/ui";
import { Bus, Kanban, MapPinned, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { EmptyState, SlideOver, StatusPulseBadge } from "@/components/audit";
import { BentoPanel } from "@/components/nexa/bento-panel";
import {
  OpsTripKanbanBoard,
  columnKeyForStatus,
  type OpsTripCard,
} from "@/components/operaciones/ops-trip-kanban-board";
import {
  OpsFleetMap,
  type FleetMarker,
} from "@/components/operaciones/ops-fleet-map";

type TowerBoard = {
  asOf: string;
  trips: OpsTripCard[];
  fleet: Array<{
    id: string;
    plate: string;
    lat: number | null;
    lng: number | null;
    status: string;
    odometerKm?: number | string | null;
    updatedAt?: string;
  }>;
  driversOnDuty?: Array<{
    driverId: string;
    name: string;
    checkInAt: string;
  }>;
  kpis?: {
    tripsToday: number;
    inTransit: number;
    pending: number;
    fleetOnline: number;
    driversOnDuty: number;
  };
};

const VEHICLE_STATUS_ES: Record<string, string> = {
  AVAILABLE: "En patio / disponible",
  IN_SERVICE: "En servicio",
  MAINTENANCE: "Taller",
  OUT_OF_SERVICE: "Fuera de servicio",
  COMPLIANCE_BLOCKED: "Bloqueo cumplimiento",
};

function vehicleTone(
  status: string,
): "active" | "fatiga" | "danger" | "neutral" {
  const u = status.toUpperCase();
  if (u === "IN_SERVICE") return "active";
  if (u === "MAINTENANCE" || u === "COMPLIANCE_BLOCKED") return "fatiga";
  if (u === "OUT_OF_SERVICE") return "danger";
  return "neutral";
}

export default function OperacionesTableroPage() {
  const [board, setBoard] = useState<TowerBoard | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [selectedTrip, setSelectedTrip] = useState<OpsTripCard | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(
    null,
  );
  const [detailOpen, setDetailOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get<TowerBoard>("/logistics/tower-board");
      setBoard(data);
      setError("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo cargar la torre operativa",
      );
    }
  }, []);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(t);
  }, [load]);

  const markers: FleetMarker[] = useMemo(() => {
    return (board?.fleet ?? [])
      .filter(
        (v) =>
          v.lat != null &&
          v.lng != null &&
          Number.isFinite(Number(v.lat)) &&
          Number.isFinite(Number(v.lng)),
      )
      .map((v) => ({
        id: v.id,
        plate: v.plate,
        lat: Number(v.lat),
        lng: Number(v.lng),
        status: v.status,
        odometerKm: v.odometerKm,
      }));
  }, [board?.fleet]);

  const selectedVehicle = useMemo(() => {
    if (!selectedVehicleId || !board) return null;
    const fleet = board.fleet.find((v) => v.id === selectedVehicleId);
    if (!fleet) return null;
    const activeTrip =
      board.trips.find(
        (t) =>
          t.vehicle?.id === fleet.id &&
          (t.status === "IN_TRANSIT" || t.status === "INCIDENT"),
      ) ?? board.trips.find((t) => t.vehicle?.id === fleet.id);
    return { fleet, activeTrip };
  }, [board, selectedVehicleId]);

  async function moveTrip(tripId: string, dropStatus: string) {
    const trip = board?.trips.find((t) => t.id === tripId);
    if (!trip) return;
    if (columnKeyForStatus(trip.status) === columnKeyForStatus(dropStatus)) {
      return;
    }
    setBusy(true);
    setError("");
    setInfo("");
    try {
      if (dropStatus === "INCIDENT") {
        await api.patch(
          `/logistics/trips/${tripId}/incident`,
          { notes: "Incidente marcado desde tablero de operaciones" },
          { confirm: { skip: true } },
        );
      } else {
        await api.patch(
          `/logistics/trips/${tripId}/status`,
          { status: dropStatus },
          { confirm: { skip: true } },
        );
      }
      setInfo(`Viaje ${trip.code} → ${dropStatus}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo mover el viaje");
      await load();
    } finally {
      setBusy(false);
    }
  }

  function openTrip(trip: OpsTripCard) {
    setSelectedTrip(trip);
    if (trip.vehicle?.id) setSelectedVehicleId(trip.vehicle.id);
    setDetailOpen(true);
  }

  function openVehicle(m: FleetMarker) {
    setSelectedVehicleId(m.id);
    const trip = board?.trips.find((t) => t.vehicle?.id === m.id);
    if (trip) setSelectedTrip(trip);
    setDetailOpen(true);
  }

  const detail = selectedVehicle ?? {
    fleet: selectedTrip?.vehicle
      ? {
          id: selectedTrip.vehicle.id,
          plate: selectedTrip.vehicle.plate,
          lat: selectedTrip.vehicle.lat ?? null,
          lng: selectedTrip.vehicle.lng ?? null,
          status: selectedTrip.vehicle.status,
          odometerKm: null as number | null,
          updatedAt: undefined as string | undefined,
        }
      : null,
    activeTrip: selectedTrip,
  };

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--brand-border)] pb-4">
        <div>
          <p className="font-data text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--brand-primary)]">
            Operaciones · Torre
          </p>
          <h1 className="mt-1 font-sans text-2xl font-semibold tracking-tight text-[var(--brand-text-primary)] md:text-3xl">
            Tablero y mapa
          </h1>
          <p className="mt-1 text-sm text-[var(--brand-text-secondary)]">
            Arrastre viajes entre etapas · seleccione un bus en el mapa para ver
            su estado
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          className="w-auto px-3 py-1.5 text-xs"
          disabled={busy}
          onClick={() => void load()}
        >
          <RefreshCw className="mr-1 inline h-3 w-3" aria-hidden />
          Refrescar
        </Button>
      </header>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-[var(--brand-danger)]/30 bg-[var(--brand-danger)]/10 px-3 py-2 text-sm text-[var(--brand-danger)]"
        >
          {error}
        </p>
      ) : null}
      {info ? (
        <p className="rounded-lg border border-[var(--brand-success)]/30 bg-[var(--brand-success)]/10 px-3 py-2 text-sm text-[var(--brand-success)]">
          {info}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-4">
        <BentoPanel title="Viajes" subtitle="Hoy / activos">
          <p className="font-data text-2xl tabular-nums text-[var(--brand-text-primary)]">
            {board?.kpis?.tripsToday ?? "—"}
          </p>
        </BentoPanel>
        <BentoPanel title="En ruta" subtitle="IN_TRANSIT">
          <p className="font-data text-2xl tabular-nums text-[var(--brand-text-primary)]">
            {board?.kpis?.inTransit ?? "—"}
          </p>
        </BentoPanel>
        <BentoPanel title="Flota en mapa" subtitle="GPS válido">
          <p className="font-data text-2xl tabular-nums text-[var(--brand-text-primary)]">
            {board?.kpis?.fleetOnline ?? markers.length}
          </p>
        </BentoPanel>
        <BentoPanel title="Conductores" subtitle="Turno abierto">
          <p className="font-data text-2xl tabular-nums text-[var(--brand-text-primary)]">
            {board?.kpis?.driversOnDuty ?? "—"}
          </p>
        </BentoPanel>
      </div>

      <BentoPanel
        title="Tablero de viajes"
        subtitle="Planificado · En ruta · En patio · Incidente"
        icon={<Kanban className="h-4 w-4" aria-hidden />}
      >
        {!board ? (
          <EmptyState
            title="Cargando torre"
            description="Sincronizando viajes y flota…"
          />
        ) : !(board.trips?.length) ? (
          <EmptyState
            icon={<Kanban className="h-7 w-7" />}
            title="Sin viajes activos"
            description="No hay servicios del día ni viajes abiertos. Programe desde Logística → Servicios."
          />
        ) : (
          <OpsTripKanbanBoard
            trips={board.trips}
            busy={busy}
            selectedTripId={selectedTrip?.id}
            onOpenTrip={openTrip}
            onMoveTrip={moveTrip}
          />
        )}
      </BentoPanel>

      <BentoPanel
        title="Mapa de flota"
        subtitle={`${markers.length} unidad(es) con posición · clic para detalle`}
        icon={<MapPinned className="h-4 w-4" aria-hidden />}
      >
        <OpsFleetMap
          markers={markers}
          selectedId={selectedVehicleId}
          onSelect={openVehicle}
          height={420}
        />
      </BentoPanel>

      <SlideOver
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={
          detail.fleet
            ? `Unidad · ${detail.fleet.plate}`
            : selectedTrip
              ? `Viaje · ${selectedTrip.code}`
              : "Detalle"
        }
        description="Información básica de la unidad y del viaje asociado."
        widthClass="max-w-md"
        footer={
          <Button
            type="button"
            variant="ghost"
            className="w-auto px-4 py-2"
            onClick={() => setDetailOpen(false)}
          >
            Cerrar
          </Button>
        }
      >
        {detail.fleet || selectedTrip ? (
          <div className="space-y-4">
            {detail.fleet ? (
              <div className="rounded-lg border border-[var(--brand-border)] bg-[var(--brand-canvas)] p-3">
                <div className="mb-2 flex items-center gap-2">
                  <Bus className="h-4 w-4 text-[var(--brand-primary)]" aria-hidden />
                  <p className="font-data text-sm font-semibold text-[var(--brand-text-primary)]">
                    {detail.fleet.plate}
                  </p>
                </div>
                <StatusPulseBadge tone={vehicleTone(detail.fleet.status)}>
                  {VEHICLE_STATUS_ES[detail.fleet.status] || detail.fleet.status}
                </StatusPulseBadge>
                <dl className="mt-3 space-y-1.5 font-data text-xs text-[var(--brand-text-secondary)]">
                  <div className="flex justify-between gap-2">
                    <dt>Lat</dt>
                    <dd className="tabular-nums text-[var(--brand-text-primary)]">
                      {detail.fleet.lat != null
                        ? Number(detail.fleet.lat).toFixed(5)
                        : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt>Lng</dt>
                    <dd className="tabular-nums text-[var(--brand-text-primary)]">
                      {detail.fleet.lng != null
                        ? Number(detail.fleet.lng).toFixed(5)
                        : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt>Odómetro</dt>
                    <dd className="tabular-nums text-[var(--brand-text-primary)]">
                      {detail.fleet.odometerKm != null
                        ? `${detail.fleet.odometerKm} km`
                        : "—"}
                    </dd>
                  </div>
                </dl>
              </div>
            ) : null}

            {detail.activeTrip || selectedTrip ? (
              <div className="rounded-lg border border-[var(--brand-border)] bg-[var(--brand-canvas)] p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-secondary)]">
                  Viaje
                </p>
                {(() => {
                  const t = detail.activeTrip || selectedTrip!;
                  return (
                    <div className="mt-2 space-y-1 text-sm">
                      <p className="font-data text-[var(--brand-text-primary)]">
                        {t.code} · {t.status}
                      </p>
                      <p className="text-[var(--brand-text-secondary)]">
                        {t.origin} → {t.destination}
                      </p>
                      {t.customer?.name ? (
                        <p className="text-xs text-[var(--brand-text-secondary)]">
                          Cliente: {t.customer.name}
                        </p>
                      ) : null}
                      {t.driver?.name ? (
                        <p className="text-xs text-[var(--brand-text-secondary)]">
                          Conductor: {t.driver.name}
                          {t.driver.fatigueScore != null
                            ? ` · fatiga ${t.driver.fatigueScore}`
                            : ""}
                        </p>
                      ) : (
                        <p className="text-xs text-[var(--brand-warning)]">
                          Sin conductor asignado
                        </p>
                      )}
                    </div>
                  );
                })()}
              </div>
            ) : (
              <p className="text-sm text-[var(--brand-text-secondary)]">
                Unidad sin viaje activo asociado en el tablero.
              </p>
            )}
          </div>
        ) : null}
      </SlideOver>
    </div>
  );
}
