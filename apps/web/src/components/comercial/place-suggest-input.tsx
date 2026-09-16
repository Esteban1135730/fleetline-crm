"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

type PlaceHit = { lat: number; lng: number; label: string };

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  title?: string;
  required?: boolean;
  className?: string;
  id?: string;
};

/**
 * Autocomplete de lugares CO vía Nominatim ya expuesto en Logística.
 * Solo rellena el texto; no altera contratos ni generación de viajes.
 */
export function PlaceSuggestInput({
  value,
  onChange,
  placeholder = "Ciudad o punto",
  title,
  required,
  className = "field",
  id,
}: Props) {
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = value.trim();
    if (q.length < 3) {
      setHits([]);
      setBusy(false);
      return;
    }
    setBusy(true);
    debounceRef.current = setTimeout(() => {
      void api<PlaceHit[]>(
        `/logistica/servicios/geocode?q=${encodeURIComponent(q)}`,
      )
        .then((rows) => {
          setHits(Array.isArray(rows) ? rows : []);
          setOpen(true);
        })
        .catch(() => setHits([]))
        .finally(() => setBusy(false));
    }, 320);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value]);

  return (
    <div ref={boxRef} className="relative">
      <input
        id={id}
        className={className}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => hits.length > 0 && setOpen(true)}
        required={required}
        title={title}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open}
      />
      {busy ? (
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 font-data text-[10px] text-brand-text-secondary">
          …
        </span>
      ) : null}
      {open && hits.length > 0 ? (
        <ul
          role="listbox"
          className="absolute z-30 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-brand-border bg-brand-surface-elevated shadow-lg"
        >
          {hits.map((hit) => (
            <li key={`${hit.lat}-${hit.lng}-${hit.label}`}>
              <button
                type="button"
                role="option"
                className="block w-full px-3 py-2 text-left text-sm text-brand-text-primary hover:bg-brand-surface-hover"
                onClick={() => {
                  onChange(hit.label);
                  setHits([]);
                  setOpen(false);
                }}
              >
                {hit.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
