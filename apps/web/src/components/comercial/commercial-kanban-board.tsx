"use client";

import { useState } from "react";
import { SarlaftBlockBadge } from "@/components/sarlaft/sarlaft-block-badge";

export type CommercialDealCard = {
  id: string;
  code: string;
  accountName: string;
  stage: string;
  estimatedMonthlyValue: number;
  zone?: string | null;
  vehicleType?: string | null;
  distanceKm?: number | null;
  customerId?: string | null;
  customer?: {
    id: string;
    name: string;
    nit: string;
    email?: string | null;
    phone?: string | null;
    sarlaftBlocked?: boolean;
    sarlaftRiskScore?: number;
  } | null;
  latestQuoteId?: string | null;
  pdfRef?: string | null;
};

export const PIPELINE_COLUMNS = [
  { key: "NUEVO_LEAD", label: "Prospectos" },
  { key: "REUNION_AGENDADA", label: "Reunión" },
  { key: "COTIZACION_ENVIADA", label: "Cotizados" },
  { key: "EN_NEGOCIACION", label: "Negociación" },
  { key: "CERRADO_GANADO", label: "Ganados" },
] as const;

function money(n: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

type Props = {
  kanban: Record<string, CommercialDealCard[]>;
  onOpenDeal: (deal: CommercialDealCard) => void;
  onMoveDeal: (dealId: string, stage: string) => Promise<void> | void;
  busy?: boolean;
};

/** Embudo comercial — columnas + drag & drop HTML5 (mismo patrón que Ops). */
export function CommercialKanbanBoard({
  kanban,
  onOpenDeal,
  onMoveDeal,
  busy,
}: Props) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);

  return (
    <div className="grid gap-3 overflow-x-auto md:grid-cols-5">
      {PIPELINE_COLUMNS.map((col) => {
        const deals = kanban[col.key] ?? [];
        const stageValue = deals.reduce(
          (sum, d) => sum + Number(d.estimatedMonthlyValue || 0),
          0,
        );
        const isOver = overStage === col.key;
        return (
          <div
            key={col.key}
            className={`nexa-panel min-w-[170px] !p-3 transition-colors ${
              isOver ? "border-[var(--brand-primary)]/50 bg-[var(--brand-primary)]/5" : ""
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setOverStage(col.key);
            }}
            onDragLeave={() => {
              if (overStage === col.key) setOverStage(null);
            }}
            onDrop={() => {
              setOverStage(null);
              if (dragId) {
                void onMoveDeal(dragId, col.key);
                setDragId(null);
              }
            }}
          >
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-primary)]">
                {col.label}
              </h3>
              <span className="font-data text-[10px] tabular-nums text-[var(--brand-text-secondary)]">
                {deals.length} · {money(stageValue)}
              </span>
            </div>
            <div className="space-y-2 min-h-[120px]">
              {deals.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  draggable={!busy}
                  onDragStart={() => setDragId(d.id)}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverStage(null);
                  }}
                  onClick={() => onOpenDeal(d)}
                  className={`w-full cursor-grab rounded-lg border border-[var(--brand-border)] bg-[var(--brand-canvas)] p-2 text-left transition-colors hover:border-[var(--brand-border-active)] active:cursor-grabbing ${
                    dragId === d.id ? "opacity-60" : ""
                  }`}
                >
                  <p className="truncate text-sm text-[var(--brand-text-primary)]">
                    {d.accountName}
                  </p>
                  <p className="font-data text-[10px] text-[var(--brand-text-secondary)]">
                    {d.code}
                    {d.zone ? ` · ${d.zone}` : ""}
                  </p>
                  {d.customer?.sarlaftBlocked ? (
                    <div className="mt-1">
                      <SarlaftBlockBadge
                        blocked
                        riskScore={d.customer.sarlaftRiskScore}
                      />
                    </div>
                  ) : null}
                  <p className="mt-1 font-data text-xs tabular-nums text-[var(--brand-warning)]">
                    {money(Number(d.estimatedMonthlyValue))}
                  </p>
                </button>
              ))}
              {!deals.length ? (
                <p className="px-1 py-6 text-center text-xs text-[var(--brand-text-secondary)]">
                  Sin oportunidades
                </p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
