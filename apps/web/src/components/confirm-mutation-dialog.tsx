"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@fsg/ui";
import {
  buildDeleteRows,
  buildEditRows,
  registerMutationConfirmHandler,
  type MutationConfirmInput,
  type MutationRow,
} from "@/lib/mutation-confirm";
import { useScrollLock } from "@/lib/use-scroll-lock";

type Pending = {
  kind: "edit" | "delete";
  title: string;
  rows: MutationRow[];
  resolve: (ok: boolean) => void;
};

export function ConfirmMutationHost() {
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  pendingRef.current = pending;

  const ask = useCallback((input: MutationConfirmInput) => {
    const kind = input.kind;
    const rows =
      kind === "delete"
        ? buildDeleteRows(input.record || input.previous || input.next)
        : buildEditRows(input.previous, input.next);
    const title =
      input.title ||
      (kind === "delete" ? "Confirmar eliminación" : "Confirmar edición");
    return new Promise<boolean>((resolve) => {
      setPending({ kind, title, rows, resolve });
    });
  }, []);

  useEffect(() => {
    registerMutationConfirmHandler(ask);
    return () => registerMutationConfirmHandler(null);
  }, [ask]);

  const changed = useMemo(
    () => (pending?.rows || []).filter((r) => r.changed),
    [pending],
  );

  const close = useCallback((ok: boolean) => {
    const current = pendingRef.current;
    if (!current) return;
    pendingRef.current = null;
    current.resolve(ok);
    setPending(null);
  }, []);

  useEffect(() => {
    if (!pending) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, close]);

  useScrollLock(!!pending);

  if (!pending) return null;

  const isDelete = pending.kind === "delete";

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center overflow-hidden p-4"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/70"
        aria-label="Cancelar"
        onClick={() => close(false)}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-mutation-title"
        className="relative z-[1] flex max-h-[min(90dvh,90vh)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] shadow-2xl"
      >
        <div className="shrink-0 px-5 pt-5">
          <h2
            id="confirm-mutation-title"
            className="text-lg font-semibold text-[var(--text-primary)]"
          >
            {pending.title}
          </h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {isDelete
              ? "Revisa los datos que se van a eliminar. Esta acción no se puede deshacer."
              : "Revisa los valores anteriores y los nuevos antes de guardar."}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-5 py-4">
          {pending.rows.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">
              No hay campos para mostrar. Confirma solo si estás seguro.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-[var(--border-subtle)]">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-[var(--text-secondary)]">
                    <th className="px-3 py-2">Campo</th>
                    <th className="px-3 py-2">
                      {isDelete ? "Dato actual" : "Anterior"}
                    </th>
                    {!isDelete ? (
                      <th className="px-3 py-2">Nuevo</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {pending.rows.map((row) => (
                    <tr
                      key={row.key}
                      className={`border-t border-[var(--border-subtle)] ${
                        row.changed
                          ? "bg-[color-mix(in_srgb,var(--accent-metric)_10%,transparent)]"
                          : ""
                      }`}
                    >
                      <td className="px-3 py-2 font-medium">{row.label}</td>
                      <td className="px-3 py-2 font-data text-xs">
                        {row.before}
                      </td>
                      {!isDelete ? (
                        <td className="px-3 py-2 font-data text-xs text-[var(--accent-primary)]">
                          {row.after}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!isDelete && changed.length === 0 ? (
            <p className="mt-3 text-xs text-[var(--text-secondary)]">
              No hay diferencias detectadas. Aun así puedes cancelar si fue un
              clic accidental.
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-[var(--border-subtle)] px-5 py-4">
          <Button
            type="button"
            variant="ghost"
            className="w-auto px-4 py-2"
            onClick={() => close(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="primary"
            className={`w-auto px-4 py-2 ${isDelete ? "!bg-[var(--accent-alert,#FF2A5F)]" : ""}`}
            onClick={() => close(true)}
          >
            {isDelete ? "Sí, eliminar" : "Sí, guardar cambios"}
          </Button>
        </div>
      </div>
    </div>
  );
}
