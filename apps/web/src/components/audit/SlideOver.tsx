"use client";

import { useEffect, useId, type ReactNode } from "react";
import { Button } from "@fsg/ui";

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

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
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
        className={`absolute right-0 top-0 flex max-h-screen w-full ${widthClass} flex-col border-l border-[var(--border-subtle)] bg-[var(--bg-surface-1)] shadow-2xl`}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border-subtle)] px-5 py-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-[var(--text-primary)]">
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-sm text-[var(--text-secondary)]">{description}</p>
            ) : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            className="w-auto px-2 py-1"
            onClick={onClose}
          >
            Esc
          </Button>
        </header>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <footer className="flex shrink-0 justify-end gap-2 border-t border-[var(--border-subtle)] px-5 py-4">
            {footer}
          </footer>
        ) : null}
      </aside>
    </div>
  );
}
