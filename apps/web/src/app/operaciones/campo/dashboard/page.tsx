"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { api } from "@/lib/api";
import { HowToBox, PageIntro } from "@/components/page-intro";

const OFFLINE_KEY = "fleetline_campo_offline_boardings";

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
  arrivalOrder: Array<{ rank: number; plate: string; etaMinutes: number; pin: string }>;
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
  green: "bg-[#10B981]",
  amber: "bg-[#FFB800]",
  red: "bg-[#FF2A5F]",
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
      setError((e as Error).message || "Sync diferida fallida — reintento al 4G");
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
      setMsg("Abordaje guardado offline — sync automática al recuperar 4G");
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
      setError(
        `${(e as Error).message} — guardado en cola offline`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fade-in mx-auto max-w-[1200px] space-y-5 bg-[#0A0D14] p-3 text-[#F8FAFC] md:p-6">
      <div className="rounded-xl border border-white/10 bg-[#121722] p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.04)]">
        <PageIntro module="logistica" title="Field Commander Hub" />
        <p className="mt-1 text-sm text-[#94A3B8]">
          Tablet-first · alto contraste solar · geocerca 5 km
        </p>
      </div>

      <HowToBox
        steps={[
          "Radar 5 km alrededor de su GPS — pines verde/amarillo/rojo por ETA.",
          "Fat-finger: Reportar novedad, manifiesto y llamada a base.",
          "Abordaje override offline se sincroniza al recuperar red 4G.",
        ]}
      />

      {error ? (
        <p className="rounded-xl border border-[#FF2A5F]/50 bg-[#FF2A5F]/15 px-4 py-3 text-sm">
          {error}
        </p>
      ) : null}
      {msg ? (
        <p className="rounded-xl border border-[#10B981]/40 bg-[#10B981]/10 px-4 py-3 text-sm">
          {msg}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Badge tone="emerald">
          Geocerca {radar?.geofence.radiusKm ?? 5} km
        </Badge>
        <Badge tone={offlineCount > 0 ? "amber" : "emerald"}>
          Offline queue {offlineCount}
        </Badge>
        <Badge tone="amber">
          {radar?.approaching.length ?? 0} en aproximación
        </Badge>
        {offlineCount > 0 ? (
          <Button
            type="button"
            variant="primary"
            disabled={busy}
            onClick={() => void syncOffline()}
          >
            Sync ahora
          </Button>
        ) : null}
      </div>

      {/* Mapa / lista pines */}
      <section
        id="radar"
        className="rounded-xl border border-white/10 bg-[#121722] p-4"
      >
        <h3 className="font-display text-xl">Live Radar</h3>
        <p className="text-sm text-[#94A3B8]">
          Centro {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
        </p>
        <div className="relative mt-4 min-h-[280px] overflow-hidden rounded-xl border border-white/10 bg-[radial-gradient(circle_at_center,#1a2332_0%,#0A0D14_70%)]">
          <div className="absolute left-1/2 top-1/2 z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#10B981] shadow-[0_0_20px_#10B981]" />
          <div className="absolute left-1/2 top-1/2 h-[70%] w-[70%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#10B981]/30" />
          {(radar?.approaching ?? []).slice(0, 12).map((a, i) => {
            const angle = (i / Math.max(1, radar!.approaching.length)) * Math.PI * 2;
            const dist = Math.min(42, 12 + a.distanceKm * 6);
            const x = 50 + Math.cos(angle) * dist;
            const y = 50 + Math.sin(angle) * dist;
            return (
              <button
                key={a.vehicleId}
                type="button"
                className={`absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/80 ${PIN_CLASS[a.pinColor] || PIN_CLASS.green}`}
                style={{ left: `${x}%`, top: `${y}%` }}
                title={`${a.plate} · ETA ${a.etaMinutes} min · ${a.pin}`}
                onClick={() => a.trip && setSelectedTrip(a.trip.id)}
              />
            );
          })}
        </div>

        <ol className="mt-4 space-y-2">
          {(radar?.arrivalOrder ?? []).map((row) => {
            const full = radar?.approaching.find((a) => a.plate === row.plate);
            return (
              <li
                key={row.plate}
                className={`flex items-center justify-between rounded-lg border px-3 py-3 ${
                  full?.trip?.id === selectedTrip
                    ? "border-[#10B981] bg-[#10B981]/10"
                    : "border-white/10"
                }`}
              >
                <button
                  type="button"
                  className="text-left"
                  onClick={() =>
                    full?.trip && setSelectedTrip(full.trip.id)
                  }
                >
                  <p className="font-mono text-sm text-[#10B981]">
                    #{row.rank} {row.plate}
                  </p>
                  <p className="text-xs text-[#94A3B8]">
                    ETA {row.etaMinutes} min · {full?.trip?.driverName || "—"} ·{" "}
                    {full?.trip?.customerName || "—"}
                  </p>
                </button>
                <Badge
                  tone={
                    row.pin === "ON_TIME"
                      ? "emerald"
                      : row.pin === "DELAYED"
                        ? "amber"
                        : "rose"
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
        </ol>
      </section>

      {/* Fat-finger actions */}
      <section
        id="acciones"
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
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
          className="flex min-h-[72px] items-center justify-center rounded-xl bg-[#FFB800] text-lg font-semibold text-[#0A0D14]"
        >
          Llamar a Base
        </a>
      </section>

      {/* Abordaje override */}
      <section className="rounded-xl border border-white/10 bg-[#121722] p-4">
        <h3 className="font-display text-lg">Abordaje manual (override)</h3>
        <p className="text-sm text-[#94A3B8]">
          Documento o nombre — funciona offline
        </p>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <input
            className="field min-h-[56px] flex-1 !bg-[#0A0D14] !text-lg text-white"
            placeholder="Cédula o nombre completo"
            value={doc}
            onChange={(e) => setDoc(e.target.value)}
          />
          <Button
            type="button"
            variant="primary"
            className="!min-h-[56px] !px-8 !text-lg"
            disabled={busy}
            onClick={() => void abordajeManual()}
          >
            Registrar abordaje
          </Button>
        </div>
      </section>
    </div>
  );
}
