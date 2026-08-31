"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { MapPin, Radio, UserCheck } from "lucide-react";
import { api } from "@/lib/api";
import { BentoPanel } from "@/components/nexa/bento-panel";

const OFFLINE_KEY = "nexa_campo_offline_boardings";

type Approach = {
  vehicleId: string;
  plate: string;
  distanceKm: number;
  etaMinutes: number;
  pin: "ON_TIME" | "DELAYED" | "STOPPED";
  pinColor: string;
  speedKph: number | null;
  lat: number;
  lng: number;
  trip: {
    id: string;
    code: string;
    driverName?: string | null;
    customerName?: string | null;
  } | null;
};

type Radar = {
  geofence: { lat: number; lng: number; radiusKm: number };
  approaching: Approach[];
  arrivalOrder: Array<{
    rank: number;
    plate: string;
    etaMinutes: number;
    pin: string;
  }>;
};

type OfflineEvent = {
  tripId: string;
  clientEventId: string;
  passengerDocument?: string;
  passengerName?: string;
  capturedAt: string;
  lat?: number;
  lng?: number;
};

function loadOfflineQueue(): OfflineEvent[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_KEY) || "[]") as OfflineEvent[];
  } catch {
    return [];
  }
}

function saveOfflineQueue(events: OfflineEvent[]) {
  localStorage.setItem(OFFLINE_KEY, JSON.stringify(events));
}

function uuid() {
  return `offline-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const PIN_CLASS: Record<string, string> = {
  green: "bg-brand-success",
  amber: "bg-brand-warning",
  red: "bg-brand-danger",
};

export default function CampoDashboardPage() {
  const [radar, setRadar] = useState<Radar | null>(null);
  const [offlineCount, setOfflineCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [coords, setCoords] = useState({ lat: 4.711, lng: -74.0721 });
  const [doc, setDoc] = useState("");
  const [selectedTrip, setSelectedTrip] = useState<string>("");

  const refreshOffline = useCallback(() => {
    setOfflineCount(loadOfflineQueue().length);
  }, []);

  const loadRadar = useCallback(async () => {
    setError(null);
    try {
      const q = new URLSearchParams({
        lat: String(coords.lat),
        lng: String(coords.lng),
        radiusKm: "5",
        persist: "true",
      });
      const r = await api<Radar>(
        `/api/v1/operaciones/campo/radar-geocerca?${q}`,
      );
      setRadar(r);
      if (!selectedTrip && r.approaching[0]?.trip?.id) {
        setSelectedTrip(r.approaching[0].trip.id);
      }
    } catch (e) {
      setError((e as Error).message || "Señal perdida — modo degradado");
    }
  }, [coords, selectedTrip]);

  useEffect(() => {
    refreshOffline();
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCoords({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
        },
        () => undefined,
        { enableHighAccuracy: true, timeout: 8000 },
      );
    }
  }, [refreshOffline]);

  useEffect(() => {
    void loadRadar();
    const t = setInterval(() => void loadRadar(), 12_000);
    return () => clearInterval(t);
  }, [loadRadar]);

  useEffect(() => {
    function onOnline() {
      void syncOffline();
    }
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function syncOffline() {
    const queue = loadOfflineQueue();
    if (!queue.length) return;
    setBusy(true);
    try {
      const res = await api<{ message: string; syncedCount: number }>(
        "/api/v1/operaciones/campo/abordaje-manual/sync",
        {
          method: "POST",
          body: JSON.stringify({ events: queue }),
        },
      );
      saveOfflineQueue([]);
      refreshOffline();
      setMsg(res.message);
    } catch (e) {
      setError(
        (e as Error).message ||
          "Sincronización diferida fallida — reintento al recuperar red",
      );
    } finally {
      setBusy(false);
    }
  }

  async function reportarNovedad() {
    const trip = radar?.approaching.find((a) => a.trip?.id === selectedTrip);
    setBusy(true);
    setMsg(null);
    try {
      const res = await api<{ message: string }>(
        "/api/v1/operaciones/campo/falla-sitio",
        {
          method: "POST",
          body: JSON.stringify({
            tripId: selectedTrip || undefined,
            vehicleId: trip?.vehicleId,
            plate: trip?.plate,
            notes: "Falla de calidad en sitio — pre-abordaje",
            requestReplacement: true,
            lat: coords.lat,
            lng: coords.lng,
          }),
        },
      );
      setMsg(res.message);
    } catch (e) {
      setError((e as Error).message || "No se pudo reportar novedad");
    } finally {
      setBusy(false);
    }
  }

  async function abordajeManual() {
    if (!selectedTrip) {
      setError("Seleccione un viaje del radar");
      return;
    }
    if (!doc.trim()) {
      setError("Indique documento o nombre del pasajero");
      return;
    }
    const event: OfflineEvent = {
      tripId: selectedTrip,
      clientEventId: uuid(),
      passengerDocument: /^\d/.test(doc.trim()) ? doc.trim() : undefined,
      passengerName: /^\d/.test(doc.trim()) ? undefined : doc.trim(),
      capturedAt: new Date().toISOString(),
      lat: coords.lat,
      lng: coords.lng,
    };

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      const q = loadOfflineQueue();
      q.push(event);
      saveOfflineQueue(q);
      refreshOffline();
      setMsg(
        "Abordaje guardado sin conexión — se sincroniza al recuperar la red",
      );
      setDoc("");
      return;
    }

    setBusy(true);
    try {
      const res = await api<{ message: string }>(
        "/api/v1/operaciones/campo/abordaje-manual",
        {
          method: "POST",
          body: JSON.stringify({
            ...event,
            offline: false,
          }),
        },
      );
      setMsg(res.message);
      setDoc("");
    } catch (e) {
      const q = loadOfflineQueue();
      q.push(event);
      saveOfflineQueue(q);
      refreshOffline();
      setError(`${(e as Error).message} — guardado en cola sin conexión`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fade-in mx-auto max-w-[1200px] space-y-5 bg-brand-canvas p-3 text-brand-text-primary md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-border pb-4">
        <div>
          <p className="font-data text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-primary">
            Operaciones · Campo
          </p>
          <h1 className="font-sans text-2xl font-semibold tracking-tight text-brand-text-primary">
            Comando de campo
          </h1>
          <p className="mt-1 font-sans text-sm text-brand-text-secondary">
            Tablet-first · alto contraste solar · geocerca 5 km
          </p>
        </div>
      </header>

      {error ? (
        <p className="rounded-xl border border-brand-danger/50 bg-brand-danger/15 px-4 py-3 font-data text-sm text-brand-danger">
          {error}
        </p>
      ) : null}
      {msg ? (
        <p className="rounded-xl border border-brand-success/40 bg-brand-success/10 px-4 py-3 font-data text-sm text-brand-success">
          {msg}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="success">
          Geocerca {radar?.geofence.radiusKm ?? 5} km
        </Badge>
        <Badge tone={offlineCount > 0 ? "warning" : "success"}>
          Cola sin conexión {offlineCount}
        </Badge>
        <Badge tone="warning">
          {radar?.approaching.length ?? 0} en aproximación
        </Badge>
        {offlineCount > 0 ? (
          <Button
            type="button"
            variant="primary"
            className="w-auto px-3 py-1.5"
            disabled={busy}
            onClick={() => void syncOffline()}
          >
            Sync ahora
          </Button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12 lg:gap-4">
        <BentoPanel
          id="radar"
          title="Radar en vivo"
          subtitle={`Centro ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`}
          icon={<Radio />}
          className="lg:col-span-7"
        >
          <div className="relative min-h-[280px] overflow-hidden rounded-xl border border-brand-border bg-[radial-gradient(circle_at_center,var(--brand-surface-elevated)_0%,var(--brand-canvas)_70%)]">
            <div className="absolute left-1/2 top-1/2 z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-success shadow-[0_0_20px_var(--brand-success)]" />
            <div className="absolute left-1/2 top-1/2 h-[70%] w-[70%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-brand-success/30" />
            {(radar?.approaching ?? []).slice(0, 12).map((a, i) => {
              const angle =
                (i / Math.max(1, radar!.approaching.length)) * Math.PI * 2;
              const dist = Math.min(42, 12 + a.distanceKm * 6);
              const x = 50 + Math.cos(angle) * dist;
              const y = 50 + Math.sin(angle) * dist;
              return (
                <button
                  key={a.vehicleId}
                  type="button"
                  className={`absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-brand-surface ${PIN_CLASS[a.pinColor] || PIN_CLASS.green}`}
                  style={{ left: `${x}%`, top: `${y}%` }}
                  title={`${a.plate} · ETA ${a.etaMinutes} min · ${a.pin}`}
                  onClick={() => a.trip && setSelectedTrip(a.trip.id)}
                />
              );
            })}
          </div>
        </BentoPanel>

        <BentoPanel
          title="Orden de llegada"
          subtitle="ETA · pin semáforo"
          icon={<MapPin />}
          className="lg:col-span-5"
        >
          <ol className="space-y-2">
            {(radar?.arrivalOrder ?? []).map((row) => {
              const full = radar?.approaching.find((a) => a.plate === row.plate);
              return (
                <li
                  key={row.plate}
                  className={`flex items-center justify-between rounded-lg border px-3 py-3 transition-colors ${
                    full?.trip?.id === selectedTrip
                      ? "border-brand-border-active bg-brand-success/10"
                      : "border-brand-border hover:border-brand-border-active"
                  }`}
                >
                  <button
                    type="button"
                    className="text-left"
                    onClick={() => full?.trip && setSelectedTrip(full.trip.id)}
                  >
                    <p className="font-data text-sm tabular-nums text-brand-success">
                      #{row.rank} {row.plate}
                    </p>
                    <p className="font-data text-[11px] text-brand-text-secondary">
                      ETA {row.etaMinutes} min ·{" "}
                      {full?.trip?.driverName || "—"} ·{" "}
                      {full?.trip?.customerName || "—"}
                    </p>
                  </button>
                  <Badge
                    tone={
                      row.pin === "ON_TIME"
                        ? "success"
                        : row.pin === "DELAYED"
                          ? "warning"
                          : "danger"
                    }
                  >
                    {row.pin === "ON_TIME"
                      ? "A tiempo"
                      : row.pin === "DELAYED"
                        ? "Retrasado"
                        : "Detenido"}
                  </Badge>
                </li>
              );
            })}
            {(radar?.arrivalOrder ?? []).length === 0 ? (
              <li className="py-8 text-center font-sans text-sm text-brand-text-secondary">
                Sin unidades en geocerca
              </li>
            ) : null}
          </ol>
        </BentoPanel>

        <section
          id="acciones"
          className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:col-span-12"
        >
          <Button
            type="button"
            variant="primary"
            className="!min-h-[72px] !text-lg"
            disabled={busy}
            onClick={() => void reportarNovedad()}
          >
            Reportar Novedad
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="!min-h-[72px] !text-lg"
            onClick={() => {
              const t = radar?.approaching.find(
                (a) => a.trip?.id === selectedTrip,
              );
              setMsg(
                t?.trip
                  ? `Manifiesto ${t.trip.code} · ${t.plate} · ${t.trip.driverName || "—"}`
                  : "Sin viaje seleccionado",
              );
            }}
          >
            Ver Manifiesto
          </Button>
          <a
            href="tel:+573001112233"
            className="flex min-h-[72px] items-center justify-center rounded-xl bg-brand-warning text-lg font-semibold text-brand-on-warning"
          >
            Llamar a Base
          </a>
        </section>

        <BentoPanel
          title="Abordaje manual (excepción)"
          subtitle="Documento o nombre — funciona sin conexión"
          icon={<UserCheck />}
          className="lg:col-span-12"
        >
          <div className="mt-1 flex flex-col gap-3 sm:flex-row">
            <input
              className="field min-h-[56px] flex-1 !text-lg"
              placeholder="Cédula o nombre completo"
              value={doc}
              onChange={(e) => setDoc(e.target.value)}
            />
            <Button
              type="button"
              variant="primary"
              className="!min-h-[56px] w-auto !px-8 !text-lg"
              disabled={busy}
              onClick={() => void abordajeManual()}
            >
              Registrar abordaje
            </Button>
          </div>
        </BentoPanel>
      </div>
    </div>
  );
}
