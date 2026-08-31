"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { Button } from "@fsg/ui";

type SlideOverHelpProps = {
  title: string;
  summary?: string;
  steps: string[];
  /** Contenido extra (polÃ­ticas, enlaces). */
  children?: ReactNode;
  /** Control externo opcional. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

/**
 * Protocolos e instrucciones â€” fuera del top 30% de la vista.
 * Atajo: tecla `?` (sin foco en input).
 */
export function SlideOverHelp({
  title,
  summary,
  steps,
  children,
  open: controlledOpen,
  onOpenChange,
}: SlideOverHelpProps) {
  const [internal, setInternal] = useState(false);
  const open = controlledOpen ?? internal;
  const setOpen = onOpenChange ?? setInternal;
  const titleId = useId();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) {
        return;
      }
      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        className="w-auto px-3 py-1.5 text-xs"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        title="Ayuda (?)"
      >
        ? Ayuda
      </Button>

      {open ? (
        <div className="fixed inset-0 z-[80]" role="presentation">
          <button
            type="button"
            className="absolute inset-0 bg-black/55"
            aria-label="Cerrar ayuda"
            onClick={() => setOpen(false)}
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-[var(--brand-border)] bg-[var(--brand-surface)] shadow-2xl"
          >
            <header className="flex items-start justify-between gap-3 border-b border-[var(--brand-border)] px-5 py-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--brand-primary)]">
                  Protocolo operativo
                </p>
                <h2 id={titleId} className="mt-1 text-lg font-semibold text-[var(--brand-text-primary)]">
                  {title}
                </h2>
                {summary ? (
                  <p className="mt-1 text-sm text-[var(--brand-text-secondary)]">{summary}</p>
                ) : null}
              </div>
              <Button
                type="button"
                variant="ghost"
                className="w-auto px-2 py-1"
                onClick={() => setOpen(false)}
              >
                Esc
              </Button>
            </header>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <ol className="list-decimal space-y-2 pl-4 text-sm text-[var(--brand-text-primary)]">
                {steps.map((s) => (
                  <li key={s} className="leading-relaxed">
                    {s}
                  </li>
                ))}
              </ol>
              {children ? <div className="mt-6 border-t border-[var(--brand-border)] pt-4">{children}</div> : null}
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
