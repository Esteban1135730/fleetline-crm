"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@fsg/ui";
import { api } from "@/lib/api";
import { EmptyState } from "@/components/audit";
import { Route as RouteIcon } from "lucide-react";

type Deviation = {
  id: string;
  tripId: string;
  action: string;
  reasonDetail: string;
  reasonCodes: string[];
  lat: number;
  lng: number;
  serverTime: string;
  trip: {
    code: string;
    origin: string;
    destination: string;
    driver?: { name: string; document: string } | null;
  };
};

export function SupervisorDeviationsPanel({
  embedded = false,
  onCountChange,
}: {
  /** Sin chrome de sección — para SlideOver. */
  embedded?: boolean;
  onCountChange?: (count: number) => void;
}) {
  const [rows, setRows] = useState<Deviation[]>([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<Deviation[]>(
        "/api/v1/servicios/desviaciones/pendientes",
      );
      setRows(data);
      onCountChange?.(data.length);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Conexión de desviaciones fallida");
    }
  }, [onCountChange]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 12_000);
    return () => clearInterval(t);
  }, [load]);

  async function decide(tripId: string, decision: "ACEPTAR" | "CANCELAR") {
    setBusyId(tripId);
    try {
      await api(`/api/v1/servicios/${tripId}/aprobar-desviacion`, {
        method: "POST",
        body: JSON.stringify({ decision }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo resolver");
    } finally {
      setBusyId(null);
    }
  }

  const body = (
    <>
      {error ? (
        <p className="text-sm text-[var(--brand-signal)]">{error}</p>
      ) : null}

      {!rows.length ? (
        <EmptyState
          icon={<RouteIcon className="h-7 w-7" />}
          title="Sin desviaciones pendientes"
          description="Inicio/fin fuera de geocerca u horario aparecerán aquí."
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((d) => (
            <li
              key={d.id}
              className="rounded-md border border-[var(--brand-line)] p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-data text-sm text-[var(--brand-fg)]">
                    {d.trip.code} · {d.action}
                  </p>
                  <p className="text-xs text-[var(--brand-muted)]">
                    {d.trip.origin} → {d.trip.destination}
                    {d.trip.driver ? ` · ${d.trip.driver.name}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-[var(--brand-amber)]">
                    {d.reasonDetail}
                  </p>
                  <p className="font-data mt-1 text-[10px] text-[var(--brand-muted)]">
                    GPS {d.lat.toFixed(5)}, {d.lng.toFixed(5)} ·{" "}
                    {new Date(d.serverTime).toLocaleString("es-CO")}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="primary"
                    className="w-auto"
                    loading={busyId === d.tripId}
                    onClick={() => void decide(d.tripId, "ACEPTAR")}
                  >
                    ACEPTAR
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    className="w-auto"
                    disabled={busyId === d.tripId}
                    onClick={() => void decide(d.tripId, "CANCELAR")}
                  >
                    CANCELAR
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );

  if (embedded) {
    return (
      <div className="space-y-3" data-testid="supervisor-deviations">
        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            className="w-auto"
            onClick={() => void load()}
          >
            Actualizar
          </Button>
        </div>
        {body}
      </div>
    );
  }

  return (
    <section
      className="fsg-panel space-y-3 p-4"
      data-testid="supervisor-deviations"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--brand-muted)]">
            Desviaciones · aprobación supervisor
          </h2>
          <p className="text-xs text-[var(--brand-muted)]">
            Inicio/fin fuera de geocerca u horario — ACEPTAR autoriza seguimiento /
            extras; CANCELAR restaura el estado previo.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          className="w-auto"
          onClick={() => void load()}
        >
          Actualizar
        </Button>
      </div>
      {body}
    </section>
  );
}
