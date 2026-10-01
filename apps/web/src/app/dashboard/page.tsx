"use client";

import Link from "next/link";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ROLE_LABELS } from "@fsg/shared";
import { Button } from "@fsg/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useCanOpenPath } from "@/lib/route-access";
import { useShell } from "@/lib/shell-context";
import { SlideOver } from "@/components/audit";

type Senal = "ok" | "sin_senal";

type Metrics = {
  ingresosMtd: number;
  egresosAbiertos: number;
  viajesActivos: number;
  viajesMes: number;
  novedades: number;
  bloqueosHoy: number;
  vehiculosTaller: number;
  docsPorVencer: number;
  senales?: { operacion: Senal; riesgo: Senal; caja: Senal };
};

type TodayEvent = { id: string; at: string; kind: string; text: string };

type Options = {
  customers: { id: string; name: string }[];
  vehicles: { id: string; plate: string }[];
  drivers: { id: string; name: string }[];
};

type PlateCard = {
  plate: string;
  brand: string;
  model: string;
  documentos: { label: string; estado: string; vence: string | null; numero?: string }[];
};

function money(n: number) {
  return `$${(n / 1_000_000).toFixed(1)}M`;
}

function hour(iso: string) {
  return new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}

function DashboardPageInner() {
  const { user } = useAuth();
  const canOpenPath = useCanOpenPath();
  const { setHelpOpen } = useShell();
  const params = useSearchParams();
  const [m, setM] = useState<Metrics | null>(null);
  const [loadError, setLoadError] = useState("");
  const [events, setEvents] = useState<TodayEvent[]>([]);
  const [panel, setPanel] = useState<"trip" | "ot" | "plate" | null>(null);
  const [options, setOptions] = useState<Options | null>(null);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [otVehicleId, setOtVehicleId] = useState("");
  const [otReason, setOtReason] = useState("");
  const [plateQuery, setPlateQuery] = useState("");
  const [plateCard, setPlateCard] = useState<PlateCard | null>(null);
  const firstName = user?.name?.split(" ")[0] || "Operador";

  async function loadMetrics() {
    try {
      const data = await api<Metrics>("/dashboard/metrics");
      setM(data);
      setLoadError("");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Sin señal del tablero");
    }
  }

  useEffect(() => {
    void loadMetrics();
    void api<TodayEvent[]>("/dashboard/today")
      .then(setEvents)
      .catch(() => setEvents([]));
  }, []);

  useEffect(() => {
    const action = params.get("action");
    const plate = params.get("plate");
    if (action === "trip") setPanel("trip");
    if (action === "plate") {
      setPanel("plate");
      if (plate) setPlateQuery(plate);
    }
  }, [params]);

  useEffect(() => {
    if (panel !== "trip" && panel !== "ot") return;
    if (options) return;
    void api<Options>("/dashboard/dispatch-options")
      .then(setOptions)
      .catch((e) => setFormError(e instanceof Error ? e.message : "Sin catálogo"));
  }, [panel, options]);

  async function onTrip(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError("");
    try {
      await api("/dashboard/trips", {
        method: "POST",
        body: JSON.stringify({
          origin,
          destination,
          customerId: customerId || undefined,
          vehicleId: vehicleId || undefined,
          driverId: driverId || undefined,
        }),
      });
      setPanel(null);
      setOrigin("");
      setDestination("");
      await loadMetrics();
      const next = await api<TodayEvent[]>("/dashboard/today");
      setEvents(next);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "No se pudo despachar");
    } finally {
      setBusy(false);
    }
  }

  async function onOt(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError("");
    try {
      await api("/dashboard/work-orders", {
        method: "POST",
        body: JSON.stringify({ vehicleId: otVehicleId, description: otReason }),
      });
      setPanel(null);
      setOtReason("");
      const next = await api<TodayEvent[]>("/dashboard/today");
      setEvents(next);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "No se pudo abrir la orden");
    } finally {
      setBusy(false);
    }
  }

  async function onPlate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError("");
    setPlateCard(null);
    try {
      const card = await api<PlateCard>(
        `/dashboard/plate?q=${encodeURIComponent(plateQuery)}`,
      );
      setPlateCard(card);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Placa sin registro");
    } finally {
      setBusy(false);
    }
  }

  const senal = m?.senales;

  return (
    <div className="fade-in mx-auto max-w-[960px] space-y-8 py-2">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-data text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--brand-primary)]">
            Tablero operativo · {user ? ROLE_LABELS[user.role] : "—"}
          </p>
          <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-[var(--brand-text-primary)] sm:text-3xl">
            Hola {firstName}, este es el estado operativo de hoy
          </h1>
        </div>
        <button
          type="button"
          className="flt-help-btn"
          onClick={() => setHelpOpen(true)}
          aria-label="Cómo leer el tablero"
        >
          ?
        </button>
      </header>

      {loadError ? (
        <p className="text-sm text-[var(--brand-danger)]">{loadError}</p>
      ) : null}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SignalCard
          label="Operación"
          ok={senal?.operacion !== "sin_senal"}
          value={m ? String(m.viajesActivos) : "—"}
          hint={m ? `${m.viajesMes} viajes del mes` : "Cargando"}
        />
        <SignalCard
          label="Riesgo"
          ok={senal?.riesgo !== "sin_senal"}
          value={m ? String(m.bloqueosHoy + m.novedades + m.vehiculosTaller) : "—"}
          hint={
            m
              ? `${m.vehiculosTaller} en taller · ${m.docsPorVencer} docs < 15 días`
              : "Cargando"
          }
        />
        <SignalCard
          label="Caja"
          ok={senal?.caja !== "sin_senal"}
          value={m ? money(m.ingresosMtd) : "—"}
          hint={m ? `CxP ${money(m.egresosAbiertos)}` : "Cargando"}
        />
      </section>

      <section className="flex flex-wrap justify-end gap-2">
        {canOpenPath("/logistica/servicios") ? (
          <Button type="button" variant="primary" className="w-auto px-4 py-2" onClick={() => { setFormError(""); setPanel("trip"); }}>
            Crear viaje
          </Button>
        ) : null}
        {canOpenPath("/taller") ? (
          <Button type="button" variant="secondary" className="w-auto px-4 py-2" onClick={() => { setFormError(""); setPanel("ot"); }}>
            Orden de taller
          </Button>
        ) : null}
        {canOpenPath("/tramites") ? (
          <Button type="button" variant="secondary" className="w-auto px-4 py-2" onClick={() => { setFormError(""); setPlateCard(null); setPanel("plate"); }}>
            Consultar placa
          </Button>
        ) : null}
      </section>

      <section className="nexa-panel p-4">
        <h2 className="font-display text-sm font-semibold text-[var(--brand-text-primary)]">
          Hoy
        </h2>
        {events.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--brand-text-secondary)]">
            Sin viajes, órdenes ni cotizaciones ganadas en el día.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {events.map((ev) => (
              <li key={`${ev.kind}-${ev.id}`} className="flex gap-3 text-sm">
                <span className="font-data text-xs text-[var(--brand-text-secondary)]">{hour(ev.at)}</span>
                <span className="font-data text-[10px] uppercase tracking-wide text-[var(--brand-primary)]">{ev.kind}</span>
                <span className="text-[var(--brand-text-primary)]">{ev.text}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex gap-3 text-sm">
          {canOpenPath("/tesoreria") ? (
            <Link href="/tesoreria" className="text-[var(--brand-primary)]">Tesorería</Link>
          ) : null}
          {canOpenPath("/archivo") ? (
            <Link href="/archivo" className="text-[var(--brand-primary)]">Archivo</Link>
          ) : null}
        </div>
      </section>

      <SlideOver
        open={panel === "trip"}
        onClose={() => setPanel(null)}
        title="Crear viaje"
        footer={
          <Button type="submit" form="cockpit-trip" variant="primary" className="w-auto px-4 py-2" disabled={busy}>
            Despachar
          </Button>
        }
      >
        <form id="cockpit-trip" className="space-y-3" onSubmit={onTrip}>
          <Field label="Origen" value={origin} onChange={setOrigin} />
          <Field label="Destino" value={destination} onChange={setDestination} />
          <Select label="Cliente" value={customerId} onChange={setCustomerId} options={(options?.customers || []).map((c) => ({ id: c.id, label: c.name }))} />
          <Select label="Vehículo" value={vehicleId} onChange={setVehicleId} options={(options?.vehicles || []).map((v) => ({ id: v.id, label: v.plate }))} />
          <Select label="Conductor" value={driverId} onChange={setDriverId} options={(options?.drivers || []).map((d) => ({ id: d.id, label: d.name }))} />
          {formError ? <p className="text-sm text-[var(--brand-danger)]">{formError}</p> : null}
        </form>
      </SlideOver>

      <SlideOver
        open={panel === "ot"}
        onClose={() => setPanel(null)}
        title="Orden de taller"
        footer={
          <Button type="submit" form="cockpit-ot" variant="primary" className="w-auto px-4 py-2" disabled={busy}>
            Guardar
          </Button>
        }
      >
        <form id="cockpit-ot" className="space-y-3" onSubmit={onOt}>
          <Select label="Placa" value={otVehicleId} onChange={setOtVehicleId} options={(options?.vehicles || []).map((v) => ({ id: v.id, label: v.plate }))} />
          <label className="block text-xs text-[var(--brand-text-secondary)]">
            Motivo
            <textarea className="field mt-1 w-full" rows={3} value={otReason} onChange={(e) => setOtReason(e.target.value)} />
          </label>
          {formError ? <p className="text-sm text-[var(--brand-danger)]">{formError}</p> : null}
        </form>
      </SlideOver>

      <SlideOver open={panel === "plate"} onClose={() => setPanel(null)} title="Consultar placa">
        <form className="space-y-3" onSubmit={onPlate}>
          <Field label="Placa" value={plateQuery} onChange={setPlateQuery} />
          <Button type="submit" variant="primary" className="w-auto px-4 py-2" disabled={busy}>
            Ver documentos
          </Button>
          {formError ? <p className="text-sm text-[var(--brand-danger)]">{formError}</p> : null}
          {plateCard ? (
            <div className="space-y-2 pt-2">
              <p className="font-data text-sm text-[var(--brand-text-primary)]">
                {plateCard.plate} · {plateCard.brand} {plateCard.model}
              </p>
              {plateCard.documentos.map((d) => (
                <p key={d.label} className="text-sm text-[var(--brand-text-secondary)]">
                  {d.label}: {d.estado}
                  {d.vence ? ` · vence ${d.vence.slice(0, 10)}` : ""}
                </p>
              ))}
            </div>
          ) : null}
        </form>
      </SlideOver>
    </div>
  );
}

function SignalCard({
  label,
  value,
  hint,
  ok,
}: {
  label: string;
  value: string;
  hint: string;
  ok: boolean;
}) {
  return (
    <div className={`nexa-panel p-4 ${ok ? "" : "opacity-60"}`}>
      <p className="font-data text-[10px] uppercase tracking-[0.14em] text-[var(--brand-text-secondary)]">
        {label}
      </p>
      <p className="mt-2 font-data text-3xl font-bold tabular-nums text-[var(--brand-text-primary)]">
        {ok ? value : "—"}
      </p>
      <p className="mt-1 text-xs text-[var(--brand-text-secondary)]">
        {ok ? hint : "Sin señal"}
      </p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-xs text-[var(--brand-text-secondary)]">
      {label}
      <input className="field mt-1 w-full" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string }[];
}) {
  return (
    <label className="block text-xs text-[var(--brand-text-secondary)]">
      {label}
      <select className="field mt-1 w-full" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <DashboardPageInner />
    </Suspense>
  );
}
