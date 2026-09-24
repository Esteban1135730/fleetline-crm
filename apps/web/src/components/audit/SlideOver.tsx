"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Button } from "@fsg/ui";
import { useScrollLock } from "@/lib/use-scroll-lock";

type SlideOverProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  widthClass?: string;
};

/**
 * Panel lateral derecho — formularios de alta/edición.
 * El scrim no cierra con el clic de apertura ni con clics “fantasma”
 * de un <select> nativo (pointerdown debe haber empezado en el scrim).
 */
export function SlideOver({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  widthClass = "max-w-md",
}: SlideOverProps) {
  const titleId = useId();
  const [mounted, setMounted] = useState(false);
  const [scrimArmed, setScrimArmed] = useState(false);
  const onCloseRef = useRef(onClose);
  const pointerDownOnScrim = useRef(false);
  onCloseRef.current = onClose;
  useScrollLock(open);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setScrimArmed(false);
      pointerDownOnScrim.current = false;
      return;
    }
    const t = window.setTimeout(() => setScrimArmed(true), 200);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCloseRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const onScrimPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      pointerDownOnScrim.current = e.target === e.currentTarget;
    },
    [],
  );

  const closeFromScrim = useCallback(() => {
    const startedHere = pointerDownOnScrim.current;
    pointerDownOnScrim.current = false;
    if (!scrimArmed || !startedHere) return;
    onCloseRef.current();
  }, [scrimArmed]);

  if (!open || !mounted) return null;

  const panel = (
    <div className="fixed inset-0 z-[85]" role="presentation">
      <div
        role="presentation"
        className={`absolute inset-0 z-0 bg-[var(--brand-scrim)] backdrop-blur-sm ${
          scrimArmed ? "pointer-events-auto" : "pointer-events-none"
        }`}
        aria-hidden={!scrimArmed}
        onPointerDown={onScrimPointerDown}
        onClick={closeFromScrim}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`absolute top-0 right-0 bottom-0 z-10 flex w-full ${widthClass} flex-col border-l border-brand-border/70 bg-[color-mix(in_srgb,var(--brand-surface)_82%,transparent)] shadow-[var(--shadow-3d-panel)] backdrop-blur-xl`}
        onPointerDown={() => {
          pointerDownOnScrim.current = false;
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-brand-border/50 px-5 py-4">
          <div className="min-w-0 pr-2">
            <h2
              id={titleId}
              className="font-sans text-lg font-semibold tracking-tight text-[var(--brand-text-primary)]"
            >
              {title}
            </h2>
            {description ? (
              <p className="mt-1 font-sans text-sm leading-relaxed text-[var(--brand-text-secondary)]">
                {description}
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            className="w-auto shrink-0 px-2 py-1 font-data text-[10px] uppercase tracking-wide"
            onClick={() => onCloseRef.current()}
          >
            Esc
          </Button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 pb-8">
          {children}
        </div>

        {footer ? (
          <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-brand-border/50 bg-[color-mix(in_srgb,var(--brand-surface)_88%,transparent)] px-5 py-4 backdrop-blur-md">
            {footer}
          </footer>
        ) : null}
      </aside>
    </div>
  );

  return createPortal(panel, document.body);
}
