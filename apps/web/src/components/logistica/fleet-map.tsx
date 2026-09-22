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

const BOGOTA: L.LatLngExpression = [4.65, -74.1];

function isValidPoint(p: MapPoint | null | undefined): p is MapPoint {
  if (!p) return false;
  const { lat, lng } = p;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  // (0,0) suele ser placeholder GPS inválido
  if (lat === 0 && lng === 0) return false;
  return true;
}

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

/** Mapa operativo Leaflet — teselas OSM; cámara estable ante zoom manual. */
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
  /** Si el usuario hizo zoom/pan, no forzar fitBounds hasta cambiar de ruta/modo. */
  const userCamRef = useRef(false);
  const fitKeyRef = useRef<string>("");

  const track = useMemo(() => {
    const raw =
      mode === "LIVE_GPS" || mode === "HISTORY"
        ? history.length
          ? history
          : live
            ? [live]
            : suggested
        : suggested;
    return raw.filter(isValidPoint);
  }, [mode, history, live, suggested]);

  const liveOk = isValidPoint(live) ? live : null;
  const label = modeLabel ?? MODE_ES[mode] ?? mode;

  const fitKey = useMemo(() => {
    const head = track[0];
    const tail = track[track.length - 1];
    const livePart = liveOk
      ? `${liveOk.lat.toFixed(4)},${liveOk.lng.toFixed(4)}`
      : "";
    return [
      mode,
      track.length,
      head ? `${head.lat.toFixed(4)},${head.lng.toFixed(4)}` : "",
      tail ? `${tail.lat.toFixed(4)},${tail.lng.toFixed(4)}` : "",
      livePart,
    ].join("|");
  }, [mode, track, liveOk]);

  // Montaje único del mapa (no recrear por cambio de theme URL).
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true,
      // Evita zoom a nivel 0 (tile “mundo”) por gestos erráticos
      minZoom: 4,
      maxZoom: 19,
    }).setView(BOGOTA, 12);

    const tile = L.tileLayer(colors.mapTileUrl, {
      maxZoom: 19,
      minZoom: 4,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      // No mostrar tile en carga a medias (reduce flash gris/mundo)
      updateWhenIdle: true,
      keepBuffer: 2,
    }).addTo(map);
    tileRef.current = tile;

    const layers = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerRef.current = layers;

    const markUserCam = () => {
      userCamRef.current = true;
    };
    map.on("zoomstart", markUserCam);
    map.on("dragstart", markUserCam);

    if (!document.getElementById("flt-pulse-keyframes")) {
      const style = document.createElement("style");
      style.id = "flt-pulse-keyframes";
      style.textContent = `@keyframes flt-pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.35);opacity:.75}}`;
      document.head.appendChild(style);
    }

    requestAnimationFrame(() => map.invalidateSize({ animate: false }));

    return () => {
      map.off("zoomstart", markUserCam);
      map.off("dragstart", markUserCam);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      tileRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- montaje único
  }, []);

  // Cambio de tema: reemplazar URL sin vaciar el mapa
  useEffect(() => {
    const map = mapRef.current;
    const prev = tileRef.current;
    if (!map || !prev) return;
    if (prev.getAttribution() && (prev as L.TileLayer).getContainer()) {
      // setUrl mantiene cobertura mientras cargan las nuevas teselas
      prev.setUrl(colors.mapTileUrl);
    }
  }, [themeMode, colors.mapTileUrl]);

  // Dibujo de ruta + encuadre solo cuando cambia la ruta/modo (no en cada zoom)
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

    if (liveOk) {
      L.marker([liveOk.lat, liveOk.lng], {
        icon: makeDot(colors.success, colors.contrastFg, true),
        title: "Unidad en vivo",
        zIndexOffset: 500,
      }).addTo(layers);
      boundsPts.push([liveOk.lat, liveOk.lng]);
    }

    const routeChanged = fitKeyRef.current !== fitKey;
    if (routeChanged) {
      fitKeyRef.current = fitKey;
      userCamRef.current = false;
    }

    // Solo auto-encuadrar al cambiar de ruta/modo; respetar zoom manual
    if (!userCamRef.current) {
      if (boundsPts.length >= 2) {
        const b = L.latLngBounds(boundsPts);
        if (b.isValid()) {
          map.fitBounds(b, {
            padding: [36, 36],
            maxZoom: 15,
            animate: false,
          });
        }
      } else if (boundsPts.length === 1) {
        map.setView(boundsPts[0], 14, { animate: false });
      } else {
        map.setView(BOGOTA, 11, { animate: false });
      }
    }
  }, [track, liveOk, mode, fitKey, colors.mapRoute, colors.secondary, colors.warning, colors.danger, colors.success, colors.contrastFg]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fillHeight) return;
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
    });
    ro.observe(el);
    requestAnimationFrame(() => map.invalidateSize({ animate: false }));
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
            {liveOk ? " · en vivo" : ""}
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
          <span className="ml-auto opacity-70">OpenStreetMap · OSRM</span>
        </div>
      ) : null}
    </div>
  );
}
