import { useCallback, useEffect, useRef, useState } from "react";
import * as Location from "expo-location";
import type { GpsPoint } from "../types";

export async function captureGps(): Promise<GpsPoint> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") {
    throw new Error("Permiso de ubicación denegado");
  }
  const pos = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });
  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    timestamp: new Date(pos.timestamp).toISOString(),
  };
}

export function useGpsTracking(opts: {
  enabled: boolean;
  intervalMs?: number;
  onPoint?: (p: GpsPoint) => void;
}) {
  const [point, setPoint] = useState<GpsPoint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const onPointRef = useRef(opts.onPoint);
  onPointRef.current = opts.onPoint;

  const tick = useCallback(async () => {
    try {
      const p = await captureGps();
      setPoint(p);
      setError(null);
      onPointRef.current?.(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : "GPS fail");
    }
  }, []);

  useEffect(() => {
    if (!opts.enabled) return;
    void tick();
    const id = setInterval(
      () => void tick(),
      opts.intervalMs ?? 30_000,
    );
    return () => clearInterval(id);
  }, [opts.enabled, opts.intervalMs, tick]);

  return { point, error, refresh: tick };
}
