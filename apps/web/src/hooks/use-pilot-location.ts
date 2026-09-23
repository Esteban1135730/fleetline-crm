"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

const GPS_INTERVAL_MS = 12_000;

export type PilotLocationState = {
  sharing: boolean;
  lastLat: number | null;
  lastLng: number | null;
  lastSentAt: string | null;
  error: string | null;
  permission: PermissionState | "unknown";
};

type ReportOpts = {
  vehicleId?: string | null;
  tripId?: string | null;
};

/**
 * Uplink GPS del conductor → POST /api/v1/pilot/location
 * (actualiza Vehicle.lat/lng + turno para la torre).
 */
export function usePilotLocation(
  enabled: boolean,
  opts: ReportOpts = {},
): PilotLocationState & {
  pingOnce: () => Promise<void>;
} {
  const [sharing, setSharing] = useState(false);
  const [lastLat, setLastLat] = useState<number | null>(null);
  const [lastLng, setLastLng] = useState<number | null>(null);
  const [lastSentAt, setLastSentAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<PermissionState | "unknown">(
    "unknown",
  );
  const watchRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSentMs = useRef(0);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const clearTimers = useCallback(() => {
    if (watchRef.current != null && typeof navigator !== "undefined") {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const send = useCallback(async (lat: number, lng: number, speedKph?: number) => {
    const now = Date.now();
    if (now - lastSentMs.current < GPS_INTERVAL_MS - 800) return;
    lastSentMs.current = now;
    const { vehicleId, tripId } = optsRef.current;
    await api.post(
      "/api/v1/pilot/location",
      {
        lat,
        lng,
        ...(vehicleId ? { vehicleId } : {}),
        ...(tripId ? { tripId } : {}),
        ...(speedKph != null ? { speedKph } : {}),
      },
      { confirm: { skip: true } },
    );
    setLastLat(lat);
    setLastLng(lng);
    setLastSentAt(new Date().toISOString());
    setError(null);
  }, []);

  const readAndSend = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      throw new Error("Geolocalización no disponible en este dispositivo");
    }
    await new Promise<void>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          void send(
            pos.coords.latitude,
            pos.coords.longitude,
            pos.coords.speed != null && pos.coords.speed >= 0
              ? pos.coords.speed * 3.6
              : undefined,
          )
            .then(() => resolve())
            .catch((e) => reject(e));
        },
        (err) => reject(new Error(err.message || "Permiso de ubicación denegado")),
        { enableHighAccuracy: true, maximumAge: 8_000, timeout: 15_000 },
      );
    });
  }, [send]);

  useEffect(() => {
    if (!enabled) {
      clearTimers();
      setSharing(false);
      return;
    }

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Geolocalización no disponible en este dispositivo");
      setSharing(false);
      return;
    }

    setError(null);
    setSharing(true);

    if (navigator.permissions?.query) {
      void navigator.permissions
        .query({ name: "geolocation" })
        .then((r) => setPermission(r.state))
        .catch(() => setPermission("unknown"));
    }

    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        void send(
          pos.coords.latitude,
          pos.coords.longitude,
          pos.coords.speed != null && pos.coords.speed >= 0
            ? pos.coords.speed * 3.6
            : undefined,
        ).catch((e) => {
          setError(e instanceof Error ? e.message : "Error al enviar GPS");
        });
      },
      (err) => {
        setError(err.message || "Permiso de ubicación denegado");
        setPermission("denied");
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    );

    intervalRef.current = setInterval(() => {
      void readAndSend().catch((e) => {
        setError(
          e instanceof Error ? e.message : "No se pudo leer la ubicación",
        );
      });
    }, GPS_INTERVAL_MS);

    void readAndSend().catch((e) => {
      setError(e instanceof Error ? e.message : "No se pudo leer la ubicación");
    });

    return () => {
      clearTimers();
      setSharing(false);
    };
  }, [enabled, clearTimers, readAndSend, send]);

  const pingOnce = useCallback(async () => {
    try {
      lastSentMs.current = 0;
      await readAndSend();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer la ubicación");
      throw e;
    }
  }, [readAndSend]);

  return {
    sharing,
    lastLat,
    lastLng,
    lastSentAt,
    error,
    permission,
    pingOnce,
  };
}
