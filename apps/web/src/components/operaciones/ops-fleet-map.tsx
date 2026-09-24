"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useThemeColors } from "@/lib/use-theme-colors";
import { useTheme } from "@/lib/theme";

export type FleetMarker = {
  id: string;
  plate: string;
  lat: number;
  lng: number;
  status?: string;
  odometerKm?: number | string | null;
};

type Props = {
  markers: FleetMarker[];
  selectedId?: string | null;
  onSelect?: (m: FleetMarker) => void;
  className?: string;
  height?: number;
  fillHeight?: boolean;
};

const BOGOTA: L.LatLngExpression = [4.65, -74.1];

function isValid(lat: number, lng: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  if (lat === 0 && lng === 0) return false;
  return true;
}

function markerIcon(
  color: string,
  contrast: string,
  plate: string,
  selected: boolean,
) {
  const size = selected ? 22 : 16;
  return L.divIcon({
    className: "",
    iconSize: [size, size + 14],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="display:flex;flex-direction:column;align-items:center;gap:2px">
      <span style="
        display:block;width:${size}px;height:${size}px;border-radius:999px;
        background:${color};border:2px solid ${contrast};
        box-shadow:0 0 0 2px ${color}55;
        ${selected ? "outline:2px solid #fff;outline-offset:2px;" : ""}
      "></span>
      <span style="
        font:700 9px/1 ui-monospace,monospace;color:${contrast};
        background:${color}cc;padding:1px 4px;border-radius:4px;white-space:nowrap;
      ">${plate}</span>
    </div>`,
  });
}

function statusColor(
  status: string | undefined,
  colors: { primary: string; warning: string; danger: string; success: string },
) {
  const u = String(status || "").toUpperCase();
  if (u === "IN_SERVICE") return colors.primary;
  if (u === "MAINTENANCE" || u === "COMPLIANCE_BLOCKED") return colors.warning;
  if (u === "OUT_OF_SERVICE") return colors.danger;
  return colors.success;
}

/** Mapa de flota — marcadores Leaflet por vehículo (SCRUM-53). */
export function OpsFleetMap({
  markers,
  selectedId,
  onSelect,
  className = "",
  height = 360,
  fillHeight = false,
}: Props) {
  const colors = useThemeColors();
  const { mode: themeMode } = useTheme();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: true,
      minZoom: 4,
      maxZoom: 19,
    }).setView(BOGOTA, 12);
    const tile = L.tileLayer(colors.mapTileUrl, {
      attribution: "&copy; OpenStreetMap",
      maxZoom: 19,
    }).addTo(map);
    const layers = L.layerGroup().addTo(map);
    mapRef.current = map;
    tileRef.current = tile;
    layerRef.current = layers;
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      tileRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- montaje único
  }, []);

  useEffect(() => {
    tileRef.current?.setUrl(colors.mapTileUrl);
  }, [themeMode, colors.mapTileUrl]);

  useEffect(() => {
    const map = mapRef.current;
    const layers = layerRef.current;
    if (!map || !layers) return;
    layers.clearLayers();

    const valid = markers.filter((m) => isValid(m.lat, m.lng));
    const bounds: L.LatLngExpression[] = [];

    for (const m of valid) {
      const selected = m.id === selectedId;
      const color = statusColor(m.status, {
        primary: colors.primary,
        warning: colors.warning,
        danger: colors.danger,
        success: colors.success || colors.primary,
      });
      const marker = L.marker([m.lat, m.lng], {
        icon: markerIcon(color, colors.contrastFg, m.plate, selected),
        title: m.plate,
        zIndexOffset: selected ? 500 : 0,
      });
      marker.on("click", () => onSelect?.(m));
      marker.addTo(layers);
      bounds.push([m.lat, m.lng]);
    }

    if (bounds.length === 1) {
      map.setView(bounds[0], 14);
    } else if (bounds.length > 1) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [36, 36], maxZoom: 14 });
    }
  }, [markers, selectedId, onSelect, colors]);

  return (
    <div
      className={`relative overflow-hidden rounded-lg border border-[var(--brand-border)] ${className}`}
      style={fillHeight ? { height: "100%", minHeight: 280 } : { height }}
    >
      <div ref={containerRef} className="h-full w-full" />
      {!markers.filter((m) => isValid(m.lat, m.lng)).length ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[var(--brand-scrim)]/40">
          <p className="rounded-lg border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-xs text-[var(--brand-text-secondary)]">
            Sin posiciones GPS válidas
          </p>
        </div>
      ) : null}
    </div>
  );
}
