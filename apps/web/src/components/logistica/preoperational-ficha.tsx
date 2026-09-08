"use client";

import { Badge } from "@fsg/ui";
import {
  PREOPERATIONAL_ITEMS,
  normalizePreoperational,
} from "@fsg/shared";

export function PreoperationalFicha({
  preoperationalAt,
  preoperationalJson,
  tripCode,
}: {
  preoperationalAt?: string | null;
  preoperationalJson?: unknown;
  tripCode: string;
}) {
  const checklist = normalizePreoperational(preoperationalJson);
  const at = preoperationalAt ? new Date(preoperationalAt) : null;

  if (!at || !checklist) {
    return (
      <div className="space-y-3 text-sm">
        <p className="font-data text-[10px] uppercase tracking-[0.14em] text-[var(--brand-warning)]">
          Ficha preoperacional · {tripCode}
        </p>
        <p className="text-[var(--brand-text-secondary)]">
          Sin inspección registrada. El conductor debe firmar el checklist
          desde la app antes de iniciar ruta o transmitir GPS.
        </p>
      </div>
    );
  }

  const timeLabel = at.toLocaleString("es-CO", {
    dateStyle: "short",
    timeStyle: "medium",
  });

  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="font-data text-[10px] uppercase tracking-[0.14em] text-[var(--brand-primary)]">
          Ficha preoperacional · {tripCode}
        </p>
        <p
          className="mt-2 font-data text-xs text-[var(--brand-text-primary)]"
          title={`Preoperacional validado por el conductor a las ${timeLabel}`}
        >
          Sellado · {timeLabel}
        </p>
      </div>

      <ul className="space-y-2">
        {PREOPERATIONAL_ITEMS.map((item) => {
          const ok = checklist[item.key];
          return (
            <li
              key={item.key}
              className="flex items-center justify-between gap-2 rounded-lg border border-[var(--brand-border)] px-3 py-2"
            >
              <span className="text-[var(--brand-text-primary)]">{item.label}</span>
              <Badge
                tone={ok ? "success" : "danger"}
                title={
                  ok
                    ? `${item.label}: APTO — validado por el conductor`
                    : `${item.label}: NO APTO`
                }
              >
                {ok ? "APTO" : "NO APTO"}
              </Badge>
            </li>
          );
        })}
      </ul>

      {checklist.observaciones ? (
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--brand-text-secondary)]">
            Observaciones
          </p>
          <p className="text-[var(--brand-text-primary)]">{checklist.observaciones}</p>
        </div>
      ) : null}
    </div>
  );
}
