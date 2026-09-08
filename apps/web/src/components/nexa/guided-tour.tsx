"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { TourDefinition, TourStep } from "@/lib/tour-definitions";

type Rect = { top: number; left: number; width: number; height: number };

function pickElement(selector: string): Element | null {
  const parts = selector.split(",").map((s) => s.trim());
  for (const part of parts) {
    try {
      const el = document.querySelector(part);
      if (el) return el;
    } catch {
      /* selector inválido */
    }
  }
  return null;
}

function resolveSteps(steps: TourStep[]): TourStep[] {
  return steps.filter((step) => {
    if (!step.optional) return true;
    return Boolean(pickElement(step.selector));
  });
}

function measure(el: Element): Rect {
  const r = el.getBoundingClientRect();
  const pad = 8;
  return {
    top: Math.max(8, r.top - pad),
    left: Math.max(8, r.left - pad),
    width: Math.min(window.innerWidth - 16, r.width + pad * 2),
    height: Math.min(window.innerHeight - 16, r.height + pad * 2),
  };
}

function cardStyle(
  rect: Rect,
  placement: TourStep["placement"],
): CSSProperties {
  const gap = 14;
  const cardW = Math.min(360, window.innerWidth - 24);
  const prefer = placement || "auto";

  let top = rect.top + rect.height + gap;
  let left = rect.left;

  const spaceBottom = window.innerHeight - (rect.top + rect.height);
  const spaceTop = rect.top;
  const spaceRight = window.innerWidth - (rect.left + rect.width);
  const spaceLeft = rect.left;

  let place = prefer;
  if (prefer === "auto") {
    if (spaceBottom >= 180) place = "bottom";
    else if (spaceTop >= 180) place = "top";
    else if (spaceRight >= cardW + 20) place = "right";
    else place = "left";
  }

  if (place === "bottom") {
    top = rect.top + rect.height + gap;
    left = Math.min(rect.left, window.innerWidth - cardW - 12);
  } else if (place === "top") {
    top = Math.max(12, rect.top - gap - 168);
    left = Math.min(rect.left, window.innerWidth - cardW - 12);
  } else if (place === "right") {
    top = Math.max(12, rect.top);
    left = Math.min(rect.left + rect.width + gap, window.innerWidth - cardW - 12);
  } else {
    top = Math.max(12, rect.top);
    left = Math.max(12, rect.left - cardW - gap);
  }

  left = Math.max(12, Math.min(left, window.innerWidth - cardW - 12));
  top = Math.max(12, Math.min(top, window.innerHeight - 200));

  return { top, left, width: cardW };
}

type Props = {
  tour: TourDefinition;
  onClose: (completed: boolean) => void;
};

/** Overlay de recorrido: oscurece todo y señala el elemento activo. */
export function GuidedTour({ tour, onClose }: Props) {
  const steps = useMemo(() => resolveSteps(tour.steps), [tour.steps]);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [mounted, setMounted] = useState(false);

  const step = steps[index];
  const total = steps.length;

  const refresh = useCallback(() => {
    if (!step) return;
    const el = pickElement(step.selector);
    if (!el) {
      setRect(null);
      return;
    }
    el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    setRect(measure(el));
  }, [step]);

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    refresh();
    const onWin = () => refresh();
    window.addEventListener("resize", onWin);
    window.addEventListener("scroll", onWin, true);
    return () => {
      window.removeEventListener("resize", onWin);
      window.removeEventListener("scroll", onWin, true);
    };
  }, [refresh, index]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose(false);
      } else if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        if (index >= total - 1) onClose(true);
        else setIndex((i) => i + 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setIndex((i) => Math.max(0, i - 1));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, total, onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (!mounted || !step || total === 0) return null;

  const hole = rect ?? {
    top: window.innerHeight / 2 - 40,
    left: window.innerWidth / 2 - 80,
    width: 160,
    height: 80,
  };

  const style = cardStyle(hole, step.placement);

  return createPortal(
    <div
      className="fixed inset-0 z-[120]"
      role="dialog"
      aria-modal="true"
      aria-label={`Recorrido: ${tour.title}`}
      data-testid="guided-tour"
    >
      {/* Scrim con recorte */}
      <svg className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <mask id="nexa-tour-mask">
            <rect width="100%" height="100%" fill="white" />
            <rect
              x={hole.left}
              y={hole.top}
              width={hole.width}
              height={hole.height}
              rx="12"
              fill="black"
            />
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(5, 11, 20, 0.72)"
          mask="url(#nexa-tour-mask)"
        />
      </svg>

      {/* Halo del elemento */}
      <div
        className="pointer-events-none absolute rounded-xl border border-[color-mix(in_srgb,var(--brand-primary)_55%,transparent)] shadow-[0_0_0_1px_color-mix(in_srgb,var(--brand-primary)_25%,transparent),0_0_28px_color-mix(in_srgb,var(--brand-primary)_22%,transparent)] transition-all duration-150"
        style={{
          top: hole.top,
          left: hole.left,
          width: hole.width,
          height: hole.height,
        }}
      />

      {/* Tarjeta */}
      <div
        className="absolute z-[121] rounded-2xl border border-[var(--brand-border)] bg-[color-mix(in_srgb,var(--brand-surface)_92%,transparent)] p-4 shadow-[var(--shadow-3d-panel)] backdrop-blur-xl"
        style={style}
      >
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-data text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--brand-primary)]">
              Recorrido · {index + 1}/{total}
            </p>
            <h3 className="mt-0.5 font-sans text-sm font-semibold text-[var(--brand-text-primary)]">
              {step.title}
            </h3>
          </div>
          <button
            type="button"
            className="rounded-md p-1 text-[var(--brand-text-secondary)] hover:text-[var(--brand-text-primary)]"
            onClick={() => onClose(false)}
            aria-label="Cerrar recorrido"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="font-sans text-xs leading-relaxed text-[var(--brand-text-secondary)]">
          {step.body}
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            className="font-data text-[10px] uppercase tracking-wide text-[var(--brand-text-secondary)] hover:text-[var(--brand-text-primary)]"
            onClick={() => onClose(false)}
          >
            Omitir
          </button>
          <div className="flex gap-2">
            {index > 0 ? (
              <button
                type="button"
                className="rounded-md border border-[var(--brand-border)] px-3 py-1.5 text-xs text-[var(--brand-text-secondary)] hover:text-[var(--brand-text-primary)]"
                onClick={() => setIndex((i) => i - 1)}
              >
                Atrás
              </button>
            ) : null}
            <button
              type="button"
              className="rounded-md bg-[var(--brand-primary)] px-3 py-1.5 text-xs font-semibold text-brand-on-primary shadow-[var(--brand-glow-active)]"
              onClick={() => {
                if (index >= total - 1) onClose(true);
                else setIndex((i) => i + 1);
              }}
            >
              {index >= total - 1 ? "Finalizar" : "Siguiente"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
