/** Persistencia de recorridos guiados — localStorage `flt-tour-*` */

const SEEN_KEY = "flt-tour-seen";
const AUTO_KEY = "flt-tour-auto";

export type TourSeenMap = Record<string, boolean>;

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function getTourSeenMap(): TourSeenMap {
  return readJson<TourSeenMap>(SEEN_KEY, {});
}

export function isTourSeen(tourId: string): boolean {
  return Boolean(getTourSeenMap()[tourId]);
}

export function markTourSeen(tourId: string) {
  if (typeof window === "undefined") return;
  const map = getTourSeenMap();
  map[tourId] = true;
  localStorage.setItem(SEEN_KEY, JSON.stringify(map));
}

export function resetAllTours() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(SEEN_KEY);
}

export function resetTour(tourId: string) {
  if (typeof window === "undefined") return;
  const map = getTourSeenMap();
  delete map[tourId];
  localStorage.setItem(SEEN_KEY, JSON.stringify(map));
}

/** Auto-recorrido al entrar a un área (default: true) */
export function isTourAutoEnabled(): boolean {
  if (typeof window === "undefined") return true;
  const v = localStorage.getItem(AUTO_KEY);
  if (v === null) return true;
  return v !== "0";
}

export function setTourAutoEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(AUTO_KEY, enabled ? "1" : "0");
}
