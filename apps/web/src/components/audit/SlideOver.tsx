"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
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

/** Panel lateral derecho — formularios de alta/edición (auditoría UI/UX). */
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
  useScrollLock(open);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  const panel = (
    <div className="fixed inset-0 z-[85]" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-black/55"
        aria-label="Cerrar panel"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`absolute top-0 right-0 bottom-0 flex w-full ${widthClass} flex-col border-l border-[var(--border-subtle)] bg-[var(--bg-surface-1)] shadow-2xl`}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border-subtle)] px-5 py-4">
          <div className="min-w-0 pr-2">
            <h2
              id={titleId}
              className="text-lg font-semibold text-[var(--text-primary)]"
            >
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                {description}
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            className="w-auto shrink-0 px-2 py-1"
            onClick={onClose}
          >
            Esc
          </Button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 pb-8">
          {children}
        </div>

        {footer ? (
          <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-[var(--border-subtle)] bg-[var(--bg-surface-1)] px-5 py-4">
            {footer}
          </footer>
        ) : null}
      </aside>
    </div>
  );

  return createPortal(panel, document.body);
}
