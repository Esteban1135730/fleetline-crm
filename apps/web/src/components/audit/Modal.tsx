"use client";

import { useEffect, useId, type ReactNode } from "react";
import { Button } from "@fsg/ui";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** md = max-w-lg · lg = max-w-3xl · xl = max-w-5xl */
  size?: "md" | "lg" | "xl";
};

const sizeClass: Record<NonNullable<ModalProps["size"]>, string> = {
  md: "max-w-lg",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
};

/** Formulario largo / edición — flotante, no inline en la vista principal. */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: ModalProps) {
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
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        aria-label="Cerrar"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative z-[1] w-full ${sizeClass[size]} max-h-[90vh] overflow-y-auto rounded-xl border border-slate-800 bg-zinc-950 p-5 shadow-2xl`}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-slate-100">
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-sm text-slate-400">{description}</p>
            ) : null}
          </div>
          <Button type="button" variant="ghost" className="w-auto px-2 py-1" onClick={onClose}>
            ✕
          </Button>
        </div>
        <div>{children}</div>
        {footer ? (
          <div className="mt-5 flex justify-end gap-2 border-t border-slate-800 pt-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
