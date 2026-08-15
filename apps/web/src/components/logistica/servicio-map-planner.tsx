"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Button } from "@fsg/ui";
import { api } from "@/lib/api";

export type PlacePin = {
  lat: number;
  lng: number;
  label: string;
};

type Preview = {
  points: Array<{ lat: number; lng: number }>;
  distanceKm: number;
  durationMin: number;
};

type PickMode = "origin" | "dest";

const DARK_TILES =
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

function makePin(color: string, letter: string) {
  return L.divIcon({
    className: "",
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    html: `<div style="
      width:28px;height:28px;border-radius:14px 14px 14px 2px;transform:rotate(-45deg);
      background:${color};border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);
      display:flex;align-items:center;justify-content:center;
    "><span style="transform:rotate(45deg);color:#04110c;font:700 11px/1 monospace">${letter}</span></div>`,
  });
}

export function ServicioMapPlanner({
  origin,
  dest,
  onOriginChange,
  onDestChange,
  fillHeight = false,
  showChrome = true,
}: {
  origin: PlacePin | null;
  dest: PlacePin | null;
  onOriginChange: (p: PlacePin | null) => void;
  onDestChange: (p: PlacePin | null) => void;
  /** Mapa a altura completa del contenedor (split-screen). */
  fillHeight?: boolean;
  /** Controles A/B + búsqueda; false si el padre los mueve al panel flotante. */
  showChrome?: boolean;
}) {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.LayerGroup | null>(null);
  const [pickMode, setPickMode] = useState<PickMode>("origin");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PlacePin[]>([]);
  const [searching, setSearching] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [hint, setHint] = useState(
    "Toca el mapa o busca una dirección para el origen",
  );

  const pickModeRef = useRef(pickMode);
  pickModeRef.current = pickMode;
  const onOriginRef = useRef(onOriginChange);
  const onDestRef = useRef(onDestChange);
  onOriginRef.current = onOriginChange;
  onDestRef.current = onDestChange;

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const map = L.map(mapEl.current, { zoomControl: true }).setView(
      [4.65, -74.1],
      12,
    );
    L.tileLayer(DARK_TILES, {
      maxZoom: 19,
      attribution: '&copy; <a href="https://carto.com/">CARTO</a> · OSM',
    }).addTo(map);
    const layers = L.layerGroup().addTo(map);
    mapRef.current = map;
    layersRef.current = layers;

    map.on("click", async (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      try {
        const place = await api<PlacePin>(
          "/logistica/servicios/reverse-geocode",
          {
            method: "POST",
            body: JSON.stringify({ lat, lng }),
          },
        );
        if (pickModeRef.current === "origin") {
          onOriginRef.current(place);
          setPickMode("dest");
          setHint("Ahora elige el destino en el mapa o búscalo");
        } else {
          onDestRef.current(place);
          setHint("Revisa la ruta y confirma el servicio");
        }
      } catch {
        const fallback: PlacePin = {
          lat,
          lng,
          label: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        };
        if (pickModeRef.current === "origin") {
          onOriginRef.current(fallback);
          setPickMode("dest");
        } else {
          onDestRef.current(fallback);
        }
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
      layersRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fillHeight) return;
    const ro = new ResizeObserver(() => {
      map.invalidateSize();
    });
    if (mapEl.current) ro.observe(mapEl.current);
    requestAnimationFrame(() => map.invalidateSize());
    return () => ro.disconnect();
  }, [fillHeight]);

  useEffect(() => {
    const map = mapRef.current;
    const layers = layersRef.current;
    if (!map || !layers) return;
    layers.clearLayers();
    const bounds: L.LatLngExpression[] = [];

    if (origin) {
      L.marker([origin.lat, origin.lng], {
        icon: makePin("#FFB800", "A"),
        title: origin.label,
      }).addTo(layers);
      bounds.push([origin.lat, origin.lng]);
    }
    if (dest) {
      L.marker([dest.lat, dest.lng], {
        icon: makePin("#FF2A5F", "B"),
        title: dest.label,
      }).addTo(layers);
      bounds.push([dest.lat, dest.lng]);
    }
    if (preview?.points?.length) {
      const line = preview.points.map(
        (p) => [p.lat, p.lng] as [number, number],
      );
      L.polyline(line, {
        color: "#10B981",
        weight: 5,
        opacity: 0.9,
      }).addTo(layers);
      for (const p of line) bounds.push(p);
    }

    if (bounds.length >= 2) {
      map.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 15 });
    } else if (bounds.length === 1) {
      map.setView(bounds[0], 14);
    }
    requestAnimationFrame(() => map.invalidateSize());
  }, [origin, dest, preview]);

  useEffect(() => {
    if (!origin || !dest) {
      setPreview(null);
      return;
    }
    let alive = true;
    void api<Preview>("/logistica/servicios/preview-ruta", {
      method: "POST",
      body: JSON.stringify({
        originLat: origin.lat,
        originLng: origin.lng,
        destLat: dest.lat,
        destLng: dest.lng,
      }),
    })
      .then((r) => {
        if (alive) setPreview(r);
      })
      .catch(() => {
        if (alive) setPreview(null);
      });
    return () => {
      alive = false;
    };
  }, [origin, dest]);

  const runSearch = useCallback(async () => {
    if (query.trim().length < 3) return;
    setSearching(true);
    setHits([]);
    try {
      const rows = await api<PlacePin[]>(
        `/logistica/servicios/geocode?q=${encodeURIComponent(query.trim())}`,
      );
      setHits(rows);
    } catch {
      setHits([]);
    } finally {
      setSearching(false);
    }
  }, [query]);

  function applyHit(hit: PlacePin) {
    if (pickMode === "origin") {
      onOriginChange(hit);
      setPickMode("dest");
      setHint("Ahora elige el destino");
    } else {
      onDestChange(hit);
      setHint("Ruta lista — confirma el servicio");
    }
    setHits([]);
    setQuery("");
  }

  const chrome = showChrome ? (
    <div className="space-y-2 border-b border-[var(--brand-line)] p-2.5">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
            pickMode === "origin"
              ? "bg-[var(--brand-amber)] text-[#1a1200]"
              : "bg-[var(--brand-surface-2,#1A2230)] text-[var(--brand-muted)]"
          }`}
          onClick={() => {
            setPickMode("origin");
            setHint("Toca el mapa o busca el punto de origen (A)");
          }}
        >
          A · Origen
        </button>
        <button
          type="button"
          className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
            pickMode === "dest"
              ? "bg-[var(--brand-signal)] text-white"
              : "bg-[var(--brand-surface-2,#1A2230)] text-[var(--brand-muted)]"
          }`}
          onClick={() => {
            setPickMode("dest");
            setHint("Toca el mapa o busca el punto de destino (B)");
          }}
        >
          B · Destino
        </button>
        <Button
          type="button"
          variant="ghost"
          className="w-auto"
          onClick={() => {
            onOriginChange(null);
            onDestChange(null);
            setPreview(null);
            setPickMode("origin");
            setHint("Toca el mapa o busca una dirección para el origen");
          }}
        >
          Limpiar puntos
        </Button>
      </div>

      <div className="flex gap-2">
        <input
          className="field flex-1"
          placeholder={
            pickMode === "origin"
              ? "Buscar origen (ej. Aeropuerto El Dorado)"
              : "Buscar destino (ej. Calle 100 Bogotá)"
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void runSearch();
            }
          }}
        />
        <Button
          type="button"
          variant="primary"
          className="w-auto"
          onClick={() => void runSearch()}
        >
          {searching ? "…" : "Buscar"}
        </Button>
      </div>

      {hits.length ? (
        <ul className="max-h-36 overflow-auto rounded-md border border-[var(--brand-line)]">
          {hits.map((h, i) => (
            <li key={`${h.lat}-${h.lng}-${i}`}>
              <button
                type="button"
                className="w-full border-b border-[var(--brand-line)] px-3 py-2 text-left text-xs hover:bg-[var(--brand-primary)]/10"
                onClick={() => applyHit(h)}
              >
                {h.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="text-[11px] text-[var(--brand-muted)]">
        {origin ? `A · ${origin.label}` : hint}
        {dest ? ` → B · ${dest.label}` : ""}
      </p>
      {preview ? (
        <p className="font-data text-xs text-[var(--brand-primary)]">
          Ruta estimada · {preview.distanceKm} km · ~{preview.durationMin} min
        </p>
      ) : null}
    </div>
  ) : null;

  return (
    <div
      className={`overflow-hidden ${fillHeight ? "flex h-full min-h-0 flex-col" : "fsg-panel"}`}
      data-testid="servicio-map-planner"
    >
      {chrome}
      <div
        ref={mapEl}
        className={
          fillHeight
            ? "min-h-0 w-full flex-1 bg-[#0A0D14]"
            : "h-[380px] w-full bg-[#0A0D14]"
        }
      />
    </div>
  );
}
