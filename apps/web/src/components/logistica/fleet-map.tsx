"use client";

import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type MapPoint = { lat: number; lng: number };

type Props = {
  mode: string;
  modeLabel?: string;
  suggested: MapPoint[];
  history: MapPoint[];
  live: MapPoint | null;
  className?: string;
  height?: number;
};

const MODE_ES: Record<string, string> = {
  SUGGESTED: "Ruta sugerida",
  LIVE_GPS: "GPS en vivo",
  HISTORY: "Histórico de ruta",
};

function makeDot(color: string, pulse = false) {
  const size = pulse ? 18 : 14;
  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<span style="
      display:block;width:${size}px;height:${size}px;border-radius:999px;
      background:${color};border:2px solid #fff;box-shadow:0 0 0 2px ${color}55;
      ${pulse ? "animation:flt-pulse 1.6s ease-in-out infinite;" : ""}
    "></span>`,
  });
}

/**
 * Mapa operativo Leaflet + teselas OpenStreetMap.
 * Ruta sugerida / histórico GPS / punto en vivo.
 */
export function FleetMap({
  mode,
  modeLabel,
  suggested,
  history,
  live,
  className = "",
  height = 320,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  const track = useMemo(() => {
    if (mode === "LIVE_GPS" || mode === "HISTORY") {
      if (history.length) return history;
      if (live) return [live];
      return suggested;
    }
    return suggested;
  }, [mode, history, live, suggested]);

  const label = modeLabel ?? MODE_ES[mode] ?? mode;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView([4.65, -74.1], 12);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    const layers = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerRef.current = layers;

    const style = document.createElement("style");
    style.textContent = `@keyframes flt-pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.35);opacity:.75}}`;
    document.head.appendChild(style);

    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      style.remove();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layers = layerRef.current;
    if (!map || !layers) return;

    layers.clearLayers();
    const boundsPts: L.LatLngExpression[] = [];

    if (track.length >= 2) {
      const latlngs = track.map((p) => [p.lat, p.lng] as [number, number]);
      const color =
        mode === "LIVE_GPS" || mode === "HISTORY" ? "#10B981" : "#0D9488";
      L.polyline(latlngs, {
        color,
        weight: 5,
        opacity: 0.9,
        lineJoin: "round",
      }).addTo(layers);
      for (const p of latlngs) boundsPts.push(p);
    } else if (track.length === 1) {
      boundsPts.push([track[0].lat, track[0].lng]);
    }

    if (track[0]) {
      L.marker([track[0].lat, track[0].lng], {
        icon: makeDot("#FFB800"),
        title: "Origen",
      }).addTo(layers);
    }
    if (track.length > 1) {
      const last = track[track.length - 1];
      L.marker([last.lat, last.lng], {
        icon: makeDot("#FF2A5F"),
        title: "Destino",
      }).addTo(layers);
    }

    if (live) {
      L.marker([live.lat, live.lng], {
        icon: makeDot("#10B981", true),
        title: "Unidad en vivo",
        zIndexOffset: 500,
      }).addTo(layers);
      boundsPts.push([live.lat, live.lng]);
    }

    if (boundsPts.length >= 2) {
      map.fitBounds(L.latLngBounds(boundsPts), { padding: [36, 36], maxZoom: 15 });
    } else if (boundsPts.length === 1) {
      map.setView(boundsPts[0], 14);
    } else {
      map.setView([4.65, -74.1], 11);
    }

    requestAnimationFrame(() => map.invalidateSize());
  }, [track, live, mode]);

  return (
    <div
      className={`fsg-panel overflow-hidden p-0 ${className}`}
      data-testid="route-map"
    >
      <div className="flex items-center justify-between border-b border-[var(--brand-line)] px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--brand-muted)]">
          Mapa · {label}
        </span>
        <span className="font-data text-[10px] text-[var(--brand-muted)]">
          {track.length} puntos
          {live ? " · en vivo" : ""}
        </span>
      </div>
      <div
        ref={containerRef}
        className="w-full bg-[var(--brand-canvas,#0A0D14)]"
        style={{ height }}
      />
      <div className="flex flex-wrap gap-3 border-t border-[var(--brand-line)] px-3 py-1.5 text-[10px] text-[var(--brand-muted)]">
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-[var(--brand-amber)]" />
          Origen
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-[var(--brand-signal)]" />
          Destino
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-[var(--brand-primary)]" />
          Unidad / ruta
        </span>
        <span className="ml-auto opacity-70">OpenStreetMap + OSRM</span>
      </div>
    </div>
  );
}
