"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import {
  Coffee,
  LogOut,
  MapPin,
  Navigation,
  RefreshCw,
  Route,
  ShieldAlert,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { usePilotLocation } from "@/hooks/use-pilot-location";

type DutyStatus = "ON_DUTY" | "OFF_DUTY" | "BREAK";

type Dash = {
  speedLockKph: number;
  driver: { id: string; name: string; document: string } | null;
  duty: {
    status: DutyStatus;
    shiftId: string | null;
    checkInAt: string | null;
    lastLat: number | null;
    lastLng: number | null;
    lastLocationAt: string | null;
  };
  trips: Array<{
    id: string;
    code: string;
    status: string;
    vehicleId?: string | null;
    plate?: string;
    preopDone: boolean;
    origin: string;
    destination: string;
  }>;
  scoreCard: {
    safety: number;
    punctuality: number;
    fuelEfficiency: number;
  };
};

const DUTY_UI: Array<{
  key: DutyStatus;
  label: string;
  hint: string;
  icon: typeof Route;
}> = [
  {
    key: "OFF_DUTY",
    label: "Libre",
    hint: "Fuera de turno",
    icon: LogOut,
  },
  {
    key: "ON_DUTY",
    label: "En ruta",
    hint: "En servicio",
    icon: Route,
  },
  {
    key: "BREAK",
    label: "Descanso",
    hint: "Pausa en turno",
    icon: Coffee,
  },
];

function dutyLabel(s: DutyStatus) {
  return DUTY_UI.find((d) => d.key === s)?.label ?? s;
}

export default function PilotAppPage() {
  const { user, logout } = useAuth();
  const [dash, setDash] = useState<Dash | null>(null);
  const [duty, setDuty] = useState<DutyStatus>("OFF_DUTY");
  const [gpsOn, setGpsOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);

  const activeTrip = useMemo(() => {
    const trips = dash?.trips ?? [];
    return (
      trips.find((t) => t.status === "IN_TRANSIT") ??
      trips.find((t) => Boolean(t.vehicleId)) ??
      trips[0] ??
      null
    );
  }, [dash?.trips]);

  const locationEnabled = gpsOn && (duty === "ON_DUTY" || duty === "BREAK");

  const loc = usePilotLocation(locationEnabled, {
    vehicleId: activeTrip?.vehicleId,
    tripId: activeTrip?.id,
  });

  const load = useCallback(async () => {
    try {
      const d = await api.get<Dash>("/api/v1/pilot/dashboard");
      setDash(d);
      setDuty(d.duty?.status ?? "OFF_DUTY");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Conexión fallida");
    }
  }, []);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 45_000);
    return () => window.clearInterval(t);
  }, [load]);

  async function setDutyStatus(next: DutyStatus) {
    if (next === duty || busy) return;
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      let lat: number | undefined;
      let lng: number | undefined;
      if (typeof navigator !== "undefined" && navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 8_000,
              maximumAge: 15_000,
            });
          });
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        } catch {
          /* opcional al cambiar estado */
        }
      }
      const res = await api.post<{ status: DutyStatus; message: string }>(
        "/api/v1/pilot/duty-status",
        { status: next, lat, lng },
        { confirm: { skip: true } },
      );
      setDuty(res.status);
      setMsg(res.message);
      if (next === "OFF_DUTY") setGpsOn(false);
      if (next === "ON_DUTY") setGpsOn(true);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cambiar el estado");
    } finally {
      setBusy(false);
    }
  }

  async function preop(tripId: string) {
    setBusy(true);
    try {
      const res = await api.post<{ message: string }>(
        "/api/v1/pilot/preoperacional",
        {
          tripId,
          brakesOk: true,
          lightsOk: true,
          tiresOk: true,
          kitOk: true,
          oilOk: true,
          photoRefs: [`uploads/pilot/preop-${Date.now()}.jpg`],
        },
      );
      setMsg(res.message);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preoperacional bloqueado");
    } finally {
      setBusy(false);
    }
  }

  async function sos(category: "CHOQUE" | "FALLA_MECANICA" | "ORDEN_PUBLICO") {
    setBusy(true);
    try {
      const res = await api.post<{ message: string; voipChannel: string }>(
        "/api/v1/pilot/sos",
        {
          category,
          plate: activeTrip?.plate,
          tripId: activeTrip?.id,
          lat: loc.lastLat ?? undefined,
          lng: loc.lastLng ?? undefined,
        },
      );
      setMsg(`${res.message} · ${res.voipChannel}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "SOS fallido");
    } finally {
      setBusy(false);
    }
  }

  const displayName = dash?.driver?.name || user?.name || "Conductor";

  return (
    <div className="mx-auto min-h-[100dvh] max-w-md space-y-5 px-4 pb-28 pt-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="font-data text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--brand-primary)]">
            App del conductor
          </p>
          <h1 className="mt-1 font-sans text-2xl font-semibold tracking-tight text-[var(--brand-text-primary)]">
            {displayName}
          </h1>
          <p className="mt-0.5 text-sm text-[var(--brand-text-secondary)]">
            Estado y ubicación en tiempo real
          </p>
        </div>
        <button
          type="button"
          onClick={() => logout()}
          className="rounded-xl border border-[var(--brand-border)] px-3 py-2 text-xs text-[var(--brand-text-secondary)]"
        >
          Salir
        </button>
      </header>

      {error ? (
        <p
          role="alert"
          className="rounded-2xl border border-[var(--brand-danger)]/35 bg-[var(--brand-danger)]/10 px-4 py-3 text-sm text-[var(--brand-danger)]"
        >
          {error}
        </p>
      ) : null}
      {msg ? (
        <p className="rounded-2xl border border-[var(--brand-primary)]/30 bg-[var(--brand-primary)]/10 px-4 py-3 text-sm text-[var(--brand-text-primary)]">
          {msg}
        </p>
      ) : null}

      <section className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-sans text-base font-semibold text-[var(--brand-text-primary)]">
            Mi estado
          </h2>
          <Badge tone={duty === "ON_DUTY" ? "success" : duty === "BREAK" ? "warning" : "neutral"}>
            {dutyLabel(duty)}
          </Badge>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {DUTY_UI.map((opt) => {
            const Icon = opt.icon;
            const active = duty === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                disabled={busy}
                onClick={() => void setDutyStatus(opt.key)}
                className={`flex min-h-[5.5rem] flex-col items-center justify-center gap-1.5 rounded-2xl border px-2 py-3 text-center transition ${
                  active
                    ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]/15 text-[var(--brand-text-primary)] shadow-[inset_0_0_0_1px_var(--brand-primary)]"
                    : "border-[var(--brand-border)] bg-[var(--brand-canvas)] text-[var(--brand-text-secondary)]"
                }`}
              >
                <Icon className="h-5 w-5" aria-hidden />
                <span className="text-sm font-semibold">{opt.label}</span>
                <span className="text-[10px] leading-tight opacity-80">
                  {opt.hint}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-sans text-base font-semibold text-[var(--brand-text-primary)]">
              <MapPin className="h-4 w-4 text-[var(--brand-primary)]" aria-hidden />
              Ubicación
            </h2>
            <p className="mt-1 text-xs text-[var(--brand-text-secondary)]">
              {duty === "OFF_DUTY"
                ? "Disponible al pasar a En ruta o Descanso"
                : gpsOn
                  ? "Enviando a la torre de control"
                  : "Activa el envío para aparecer en el mapa"}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={gpsOn}
            disabled={duty === "OFF_DUTY" || busy}
            onClick={() => setGpsOn((v) => !v)}
            className={`relative h-8 w-14 shrink-0 rounded-full transition ${
              gpsOn
                ? "bg-[var(--brand-primary)]"
                : "bg-[var(--brand-border)]"
            } disabled:opacity-40`}
          >
            <span
              className={`absolute top-1 h-6 w-6 rounded-full bg-white transition ${
                gpsOn ? "left-7" : "left-1"
              }`}
            />
          </button>
        </div>

        <div className="mt-4 space-y-2 font-data text-xs text-[var(--brand-text-secondary)]">
          <p className="flex items-center gap-2">
            <Navigation className="h-3.5 w-3.5" aria-hidden />
            {loc.sharing ? "GPS activo · cada ~12 s" : "GPS en pausa"}
          </p>
          {loc.lastLat != null && loc.lastLng != null ? (
            <p>
              Último envío: {loc.lastLat.toFixed(5)}, {loc.lastLng.toFixed(5)}
              {loc.lastSentAt
                ? ` · ${new Date(loc.lastSentAt).toLocaleTimeString("es-CO", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}`
                : ""}
            </p>
          ) : dash?.duty?.lastLat != null && dash?.duty?.lastLng != null ? (
            <p>
              Última en torre: {Number(dash.duty.lastLat).toFixed(5)},{" "}
              {Number(dash.duty.lastLng).toFixed(5)}
            </p>
          ) : (
            <p>Sin coordenadas enviadas aún</p>
          )}
          {activeTrip?.plate ? (
            <p>
              Unidad: <span className="text-[var(--brand-text-primary)]">{activeTrip.plate}</span>
            </p>
          ) : locationEnabled ? (
            <p className="text-[var(--brand-warning)]">
              Sin unidad asignada — la torre no recibirá GPS hasta tener viaje con
              vehículo.
            </p>
          ) : null}
          {loc.error ? (
            <p className="text-[var(--brand-danger)]">{loc.error}</p>
          ) : null}
        </div>

        {locationEnabled ? (
          <Button
            type="button"
            variant="ghost"
            className="mt-3 !h-11 w-full text-sm"
            disabled={busy}
            onClick={() => void loc.pingOnce()}
          >
            Enviar ubicación ahora
          </Button>
        ) : null}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-sans text-base font-semibold text-[var(--brand-text-primary)]">
            Viajes
          </h2>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-[var(--brand-text-secondary)]"
            onClick={() => void load()}
          >
            <RefreshCw className="h-3 w-3" aria-hidden />
            Actualizar
          </button>
        </div>
        {(dash?.trips || []).map((t) => (
          <div
            key={t.id}
            className="rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="font-data text-sm font-semibold">{t.code}</span>
              <Badge tone={t.preopDone ? "success" : "warning"}>
                {t.preopDone ? "Preop OK" : "Preop pendiente"}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-[var(--brand-text-secondary)]">
              {t.plate || "Sin placa"} · {t.origin} → {t.destination}
            </p>
            {!t.preopDone ? (
              <Button
                className="mt-3 !h-12 w-full"
                disabled={busy}
                onClick={() => void preop(t.id)}
              >
                Enviar preoperacional
              </Button>
            ) : null}
          </div>
        ))}
        {!dash?.trips?.length ? (
          <p className="rounded-2xl border border-dashed border-[var(--brand-border)] px-4 py-6 text-center text-sm text-[var(--brand-text-secondary)]">
            Sin viajes asignados. El estado de turno igual se refleja en la torre.
          </p>
        ) : null}
      </section>

      <section>
        <button
          type="button"
          className="mb-2 flex w-full items-center justify-between rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-4 py-3 text-left"
          onClick={() => setShowMore((v) => !v)}
        >
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--brand-text-primary)]">
            <ShieldAlert className="h-4 w-4 text-[var(--brand-danger)]" aria-hidden />
            Emergencia y más
          </span>
          <span className="text-xs text-[var(--brand-text-secondary)]">
            {showMore ? "Ocultar" : "Mostrar"}
          </span>
        </button>
        {showMore ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <Button
                className="!h-14 !bg-[var(--brand-danger)]"
                disabled={busy}
                onClick={() => void sos("CHOQUE")}
              >
                Choque
              </Button>
              <Button
                className="!h-14"
                disabled={busy}
                onClick={() => void sos("FALLA_MECANICA")}
              >
                Falla
              </Button>
              <Button
                className="!h-14"
                disabled={busy}
                onClick={() => void sos("ORDEN_PUBLICO")}
              >
                Orden P.
              </Button>
            </div>
            {dash?.scoreCard ? (
              <div className="grid grid-cols-3 gap-2 rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4 text-center">
                <div>
                  <p className="font-data text-xl text-[var(--brand-primary)]">
                    {dash.scoreCard.safety}
                  </p>
                  <p className="text-[10px] text-[var(--brand-text-secondary)]">
                    Seguridad
                  </p>
                </div>
                <div>
                  <p className="font-data text-xl text-[var(--brand-warning)]">
                    {dash.scoreCard.punctuality}
                  </p>
                  <p className="text-[10px] text-[var(--brand-text-secondary)]">
                    Puntualidad
                  </p>
                </div>
                <div>
                  <p className="font-data text-xl">
                    {dash.scoreCard.fuelEfficiency}
                  </p>
                  <p className="text-[10px] text-[var(--brand-text-secondary)]">
                    Combustible
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
