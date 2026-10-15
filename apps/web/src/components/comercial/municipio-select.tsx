"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { COLOMBIA_MUNICIPIOS } from "@/lib/colombia-municipios";

function fold(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

type Props = {
  value: string;
  onChange: (value: string) => void;
  title?: string;
};

export function MunicipioSelect({ value, onChange, title }: Props) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const hits = useMemo(() => {
    const q = fold(query.trim());
    if (q.length < 1) return [];
    return COLOMBIA_MUNICIPIOS.filter((item) => fold(item).includes(q)).slice(
      0,
      40,
    );
  }, [query]);

  return (
    <div ref={boxRef} className="relative">
      <input
        className="field"
        value={query}
        title={title}
        placeholder="Buscar municipio"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onBlur={() => {
          const exact = COLOMBIA_MUNICIPIOS.find((item) => item === query.trim());
          if (exact) {
            onChange(exact);
            setQuery(exact);
          } else {
            setQuery(value);
          }
        }}
      />
      {open && hits.length > 0 ? (
        <ul
          role="listbox"
          className="absolute z-30 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-brand-border bg-brand-surface-elevated shadow-lg"
        >
          {hits.map((item) => (
            <li key={item}>
              <button
                type="button"
                role="option"
                className="block w-full px-3 py-2 text-left text-sm text-brand-text-primary hover:bg-brand-surface-hover"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(item);
                  setQuery(item);
                  setOpen(false);
                }}
              >
                {item}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
