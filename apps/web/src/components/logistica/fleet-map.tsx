"use client";

import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useThemeColors } from "@/lib/use-theme-colors";
import { useTheme } from "@/lib/theme";

export type MapPoint = { lat: number; lng: number };

type Props = {
  mode: string;
  modeLabel?: string;
  suggested: MapPoint[];
  history: MapPoint[];
  live: MapPoint | null;
  className?: string;
  height?: number;
  /** Ocupa el contenedor padre (split-screen). */
  fillHeight?: boolean;
  /** Oculta chrome interno cuando el padre usa BentoPanel. */
  embedded?: boolean;
};

const MODE_ES: Record<string, string> = {
  SUGGESTED: "Ruta sugerida",
  LIVE_GPS: "GPS en vivo",
  HISTORY: "Histórico de ruta",
};

function makeDot(color: string, contrast: string, pulse = false) {
  const size = pulse ? 18 : 14;
  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<span style="
      display:block;width:${size}px;height:${size}px;border-radius:999px;
      background:${color};border:2px solid ${contrast};box-shadow:0 0 0 2px ${color}55;
      ${pulse ? "animation:flt-pulse 1.6s ease-in-out infinite;" : ""}
    "></span>`,
  });
}

/** Mapa operativo Leaflet — teselas adaptativas light/dark vía useThemeColors. */
export function FleetMap({
  mode,
  modeLabel,
  suggested,
  history,
  live,
  className = "",
  height = 320,
  fillHeight = false,
  embedded = false,
}: Props) {
  const colors = useThemeColors();
  const { mode: themeMode } = useTheme();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);

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

    const tile = L.tileLayer(colors.mapTileUrl, {
      maxZoom: 19,
      attribution: '&copy; <a href="https://carto.com/">CARTO</a> · OSM',
    }).addTo(map);
    tileRef.current = tile;

    const layers = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerRef.current = layers;

    if (!document.getElementById("flt-pulse-keyframes")) {
      const style = document.createElement("style");
      style.id = "flt-pulse-keyframes";
      style.textContent = `@keyframes flt-pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.35);opacity:.75}}`;
      document.head.appendChild(style);
    }

    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      tileRef.current = null;
    };
  }, [colors.mapTileUrl]);

  useEffect(() => {
    const map = mapRef.current;
    const prev = tileRef.current;
    if (!map || !prev) return;
    map.removeLayer(prev);
    const tile = L.tileLayer(colors.mapTileUrl, {
      maxZoom: 19,
      attribution: '&copy; <a href="https://carto.com/">CARTO</a> · OSM',
    }).addTo(map);
    tileRef.current = tile;
  }, [themeMode, colors.mapTileUrl]);

  useEffect(() => {
    const map = mapRef.current;
    const layers = layerRef.current;
    if (!map || !layers) return;

    layers.clearLayers();
    const boundsPts: L.LatLngExpression[] = [];

    if (track.length >= 2) {
      const latlngs = track.map((p) => [p.lat, p.lng] as [number, number]);
      const routeColor =
        mode === "LIVE_GPS" || mode === "HISTORY"
          ? colors.mapRoute
          : colors.secondary;
      L.polyline(latlngs, {
        color: routeColor,
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
        icon: makeDot(colors.warning, colors.contrastFg),
        title: "Origen",
      }).addTo(layers);
    }
    if (track.length > 1) {
      const last = track[track.length - 1];
      L.marker([last.lat, last.lng], {
        icon: makeDot(colors.danger, colors.contrastFg),
        title: "Destino",
      }).addTo(layers);
    }

    if (live) {
      L.marker([live.lat, live.lng], {
        icon: makeDot(colors.success, colors.contrastFg, true),
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
  }, [track, live, mode, colors]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fillHeight) return;
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    requestAnimationFrame(() => map.invalidateSize());
    return () => ro.disconnect();
  }, [fillHeight]);

  const shellClass = embedded
    ? `overflow-hidden ${fillHeight ? "flex h-full min-h-0 flex-col" : ""} ${className}`
    : `overflow-hidden p-0 ${fillHeight ? "flex h-full min-h-0 flex-col" : "nexa-panel"} ${className}`;

  return (
    <div className={shellClass} data-testid="route-map">
      {!embedded ? (
        <div className="flex shrink-0 items-center justify-between border-b border-brand-border px-3 py-2">
          <span className="font-data text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-text-secondary">
            Mapa · {label}
          </span>
          <span className="font-data text-[10px] tabular-nums text-brand-text-secondary">
            {track.length} puntos
            {live ? " · en vivo" : ""}
          </span>
        </div>
      ) : null}
      <div
        ref={containerRef}
        className={`w-full bg-brand-canvas ${fillHeight ? "min-h-0 flex-1" : ""}`}
        style={fillHeight ? undefined : { height }}
      />
      {!embedded ? (
        <div className="flex shrink-0 flex-wrap gap-3 border-t border-brand-border px-3 py-1.5 font-data text-[10px] text-brand-text-secondary">
          <span>
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-brand-warning" />
            Origen
          </span>
          <span>
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-brand-danger" />
            Destino
          </span>
          <span>
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-brand-success" />
            Unidad / ruta
          </span>
          <span className="ml-auto opacity-70">
            {themeMode === "dark" ? "Tactical dark" : "Voyager light"} · OSRM
          </span>
        </div>
      ) : null}
    </div>
  );
}
