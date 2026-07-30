import { useEffect, useRef } from "react";
import * as Location from "expo-location";
import { updateVehicleGps } from "../api";

const GPS_INTERVAL_MS = 12_000;

/** Envía GPS cada ~12s mientras el viaje esté IN_TRANSIT */
export function useGps(
  active: boolean,
  vehicleId: string | null | undefined,
) {
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSentRef = useRef(0);

  useEffect(() => {
    if (!active || !vehicleId) {
      watchRef.current?.remove();
      watchRef.current = null;
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      return;
    }

    let cancelled = false;

    async function start() {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted" || cancelled) return;

      const sendPosition = async (coords: Location.LocationObjectCoords) => {
        const now = Date.now();
        if (now - lastSentRef.current < GPS_INTERVAL_MS - 500) return;
        lastSentRef.current = now;
        try {
          await updateVehicleGps(vehicleId!, coords.latitude, coords.longitude);
        } catch (err) {
          console.warn("GPS update failed:", err);
        }
      };

      watchRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: GPS_INTERVAL_MS,
          distanceInterval: 20,
        },
        (loc) => void sendPosition(loc.coords),
      );

      intervalRef.current = setInterval(async () => {
        try {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          await sendPosition(loc.coords);
        } catch (err) {
          console.warn("GPS poll failed:", err);
        }
      }, GPS_INTERVAL_MS);
    }

    void start();

    return () => {
      cancelled = true;
      watchRef.current?.remove();
      watchRef.current = null;
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [active, vehicleId]);
}
