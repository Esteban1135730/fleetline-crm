"use client";

import type { ReactNode } from "react";
import { Button } from "@fsg/ui";

type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
};

/** Estado vacío ilustrado — nunca tabla/contenedor oscuro vacío. */
export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface-1)] px-6 py-14 text-center"
      role="status"
    >
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] text-[var(--text-secondary)]">
        {icon ?? (
          <svg
            viewBox="0 0 24 24"
            className="h-7 w-7"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden
          >
            <path d="M4 7h16M4 12h10M4 17h7" strokeLinecap="round" />
            <circle cx="18" cy="16" r="3" />
          </svg>
        )}
      </div>
      <h3 className="text-base font-semibold text-[var(--text-primary)]">{title}</h3>
      {description ? (
        <p className="mt-2 max-w-md text-sm text-[var(--text-secondary)]">{description}</p>
      ) : null}
      {actionLabel && onAction ? (
        <div className="mt-5 flex w-full justify-end sm:w-auto sm:justify-center">
          <Button variant="primary" className="w-auto px-4 py-2" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
