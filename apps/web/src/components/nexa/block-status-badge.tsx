"use client";

import { useMemo, useState, type ReactNode } from "react";
import { AlertOctagon, FileWarning, ShieldAlert } from "lucide-react";
import { Tooltip } from "@fsg/ui";
import { Modal } from "@/components/audit";
import { StatusPulseBadge } from "@/components/audit/KpiCard";
import {
  humanizeBlockReason,
  isDocumentBlockReason,
  summarizeBlockReasons,
} from "@/lib/block-reasons";

type Props = {
  blocked: boolean;
  reasons?: string[];
  /** Texto cuando está libre */
  clearLabel?: string;
  /** Texto del badge cuando hay bloqueo */
  blockedLabel?: string;
  /** Título del modal */
  entityTitle?: string;
  /** Subtítulo contextual (placa / nombre) */
  entitySubtitle?: string;
  className?: string;
};

/**
 * Badge de bloqueo operativo:
 * - Hover → tooltip con motivos resumidos
 * - Click → modal con detalle (docs expirados / errores)
 */
export function BlockStatusBadge({
  blocked,
  reasons = [],
  clearLabel = "Liberado",
  blockedLabel = "Bloqueo",
  entityTitle = "Detalle de bloqueo",
  entitySubtitle,
  className = "",
}: Props) {
  const [open, setOpen] = useState(false);

  const uniqueReasons = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of reasons) {
      const t = r?.trim();
      if (!t || seen.has(t)) continue;
      seen.add(t);
      out.push(t);
    }
    return out;
  }, [reasons]);

  const tip = blocked
    ? summarizeBlockReasons(
        uniqueReasons.length ? uniqueReasons : ["Motivo no reportado"],
      )
    : "Sin bloqueo operativo";

  const docReasons = uniqueReasons.filter(isDocumentBlockReason);
  const otherReasons = uniqueReasons.filter((r) => !isDocumentBlockReason(r));

  if (!blocked) {
    return (
      <Tooltip content={tip} side="top">
        <span className={`inline-flex ${className}`.trim()}>
          <StatusPulseBadge tone="active" pulse={false}>
            {clearLabel}
          </StatusPulseBadge>
        </span>
      </Tooltip>
    );
  }

  return (
    <>
      <Tooltip content={tip} side="top">
        <button
          type="button"
          className={`inline-flex cursor-pointer rounded-full outline-none transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-brand-danger/50 ${className}`.trim()}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
          aria-label={`${blockedLabel}: ${tip}. Abrir detalle`}
        >
          <StatusPulseBadge tone="danger" pulse>
            {blockedLabel}
          </StatusPulseBadge>
        </button>
      </Tooltip>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={entityTitle}
        description={
          entitySubtitle
            ? `${entitySubtitle} · Kill-Switch / Hard-Stop activo`
            : "Kill-Switch / Hard-Stop activo"
        }
        size="md"
        footer={
          <button
            type="button"
            className="rounded-md border border-brand-border px-3 py-1.5 text-xs text-brand-text-secondary hover:text-brand-text-primary"
            onClick={() => setOpen(false)}
          >
            Cerrar
          </button>
        }
      >
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-lg border border-brand-danger/40 bg-brand-danger/10 p-3">
            <ShieldAlert
              className="mt-0.5 h-4 w-4 shrink-0 text-brand-danger"
              aria-hidden
            />
            <div>
              <p className="font-sans text-sm font-semibold text-brand-text-primary">
                Despacho bloqueado
              </p>
              <p className="mt-0.5 font-data text-[11px] text-brand-text-secondary">
                Corrija el expediente documental o la condición operativa antes
                de liberar la unidad o el conductor.
              </p>
            </div>
          </div>

          {docReasons.length > 0 ? (
            <ReasonGroup
              title="Documentación · vencido / ausente / error"
              icon={<FileWarning className="h-3.5 w-3.5" aria-hidden />}
              items={docReasons}
              doc
            />
          ) : null}

          {otherReasons.length > 0 ? (
            <ReasonGroup
              title="Condición operativa"
              icon={<AlertOctagon className="h-3.5 w-3.5" aria-hidden />}
              items={otherReasons}
            />
          ) : null}

          {!uniqueReasons.length ? (
            <p className="font-data text-xs text-brand-text-secondary">
              No hay detalle tipado. Revise Trámites / RRHH para el expediente.
            </p>
          ) : null}
        </div>
      </Modal>
    </>
  );
}

function ReasonGroup({
  title,
  icon,
  items,
  doc,
}: {
  title: string;
  icon: ReactNode;
  items: string[];
  doc?: boolean;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 font-data text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-text-secondary">
        {icon}
        {title}
      </div>
      <ul className="space-y-1.5">
        {items.map((raw) => {
          const label = humanizeBlockReason(raw);
          const expired = /EXPIRED|VENCID/i.test(raw);
          const missing = /MISSING|AUSENT|FALT/i.test(raw);
          const chip = expired
            ? "Expirado"
            : missing
              ? "Ausente"
              : doc
                ? "Error / alerta"
                : null;
          return (
            <li
              key={raw}
              className="flex items-start justify-between gap-2 rounded-md border border-brand-border/80 bg-brand-surface/60 px-2.5 py-2"
            >
              <span className="font-sans text-xs text-brand-text-primary">
                {label}
              </span>
              {chip ? (
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 font-data text-[9px] font-bold uppercase tracking-wide ${
                    expired || missing
                      ? "bg-brand-danger/15 text-brand-danger"
                      : "bg-brand-warning/15 text-brand-warning"
                  }`}
                >
                  {chip}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
