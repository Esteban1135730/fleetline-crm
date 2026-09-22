"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@fsg/ui";
import { RefreshCw, ShieldAlert, ShieldCheck, Unlock } from "lucide-react";
import { api } from "@/lib/api";
import {
  EmptyState,
  KpiCard,
  SlideOver,
  StatusPulseBadge,
} from "@/components/audit";
import { BentoPanel } from "@/components/nexa/bento-panel";
import { NexaTable, NexaRow, NexaCell } from "@/components/nexa/nexa-table";
import { SarlaftBlockBadge } from "@/components/sarlaft/sarlaft-block-badge";
import { ComplianceBadge } from "@/components/rrhh/compliance-badge";

type BlockedRow = {
  entityType: "CUSTOMER" | "SUPPLIER" | "EMPLOYEE" | "THIRD_PARTY";
  entityId: string | null;
  subjectName: string;
  document: string;
  email?: string | null;
  phone?: string | null;
  riskScore: number;
  updatedAt: string;
  openAlertId: string | null;
  alertRisk: string | null;
  alertStatus: string | null;
  listsMatched: string[];
  notes: string | null;
  source?: "MASTER" | "ALERT";
  hardLocked?: boolean;
};

type BlockedPayload = {
  items: BlockedRow[];
  totals: {
    all: number;
    customers: number;
    suppliers: number;
    employees: number;
    alertsOnly?: number;
    hardLocked?: number;
  };
};

const TYPE_ES: Record<string, string> = {
  CUSTOMER: "Cliente",
  SUPPLIER: "Proveedor",
  EMPLOYEE: "Empleado",
  THIRD_PARTY: "Tercero / consulta",
};

const STATUS_ES: Record<string, string> = {
  PENDING: "Pendiente Oficial",
  UNDER_REVIEW: "En revisión",
  RESOLVED: "Resuelto",
  DISMISSED: "Descartado",
};

function formatWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-CO");
}

export default function SarlaftBloqueosPage() {
  const [data, setData] = useState<BlockedPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [selected, setSelected] = useState<BlockedRow | null>(null);
  const [notes, setNotes] = useState("");
  const [filter, setFilter] = useState<
    "ALL" | "CUSTOMER" | "SUPPLIER" | "EMPLOYEE" | "THIRD_PARTY"
  >("ALL");

  const load = useCallback(async () => {
    try {
      const res = await api.get<BlockedPayload>("/sarlaft/bloqueados");
      setData(res);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar bloqueos");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const items = (data?.items ?? []).filter(
    (r) => filter === "ALL" || r.entityType === filter,
  );

  async function liberar(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    const justification = notes.trim();
    if (justification.length < 5) {
      setError("La justificación debe tener al menos 5 caracteres");
      return;
    }
    if (!selected.openAlertId && !selected.entityId) {
      setError("No hay alerta ni ficha para liberar");
      return;
    }
    setBusy(true);
    setError("");
    setInfo("");
    try {
      await api.post("/sarlaft/bloqueados/liberar", {
        notes: justification,
        ...(selected.openAlertId
          ? { alertId: selected.openAlertId }
          : {
              entityType: selected.entityType,
              entityId: selected.entityId,
            }),
      });
      setInfo(`Bloqueo liberado · ${selected.subjectName}`);
      setSelected(null);
      setNotes("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo liberar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--brand-border)] pb-4">
        <div>
          <p className="font-data text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--brand-primary)]">
            Oficial de Cumplimiento · SARLAFT
          </p>
          <h1 className="mt-1 font-sans text-2xl font-semibold tracking-tight text-[var(--brand-text-primary)] md:text-3xl">
            Bloqueos activos
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--brand-text-secondary)]">
            Aquí gestiona la cuarentena: alertas pendientes de la matriz
            (BLOQUEADO/ALTO) y hard-locks en fichas. Liberar exige justificación
            auditada.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="ghost"
            className="w-auto px-3 py-1.5 text-xs"
            disabled={busy}
            onClick={() => void load()}
          >
            <RefreshCw className="mr-1 inline h-3 w-3" aria-hidden />
            Refrescar
          </Button>
          <Link
            href="/sarlaft"
            className="inline-flex items-center rounded-lg border border-[var(--brand-border)] px-3 py-1.5 text-xs text-[var(--brand-text-secondary)] hover:border-[var(--brand-border-active)]"
          >
            Matriz de riesgo
          </Link>
        </div>
      </header>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-[var(--brand-danger)]/30 bg-[var(--brand-danger)]/10 px-3 py-2 text-sm text-[var(--brand-danger)]"
        >
          {error}
        </p>
      ) : null}
      {info ? (
        <p className="rounded-lg border border-[var(--brand-success)]/30 bg-[var(--brand-success)]/10 px-3 py-2 text-sm text-[var(--brand-success)]">
          {info}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-4">
        <KpiCard
          label="En cuarentena"
          value={data?.totals.all ?? "—"}
          delta="Alertas + hard-locks"
          tone={(data?.totals.all ?? 0) > 0 ? "danger" : "ok"}
          icon={<ShieldAlert />}
        />
        <KpiCard
          label="Hard-lock ficha"
          value={data?.totals.hardLocked ?? data?.totals.customers ?? "—"}
          delta="sarlaftBlocked en maestro"
          tone="neutral"
        />
        <KpiCard
          label="Solo alerta"
          value={data?.totals.alertsOnly ?? "—"}
          delta="Pendientes de la matriz"
          tone="warn"
        />
        <KpiCard
          label="Clientes"
          value={data?.totals.customers ?? "—"}
          delta="Comercial"
          tone="neutral"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["ALL", "Todos"],
            ["CUSTOMER", "Clientes"],
            ["SUPPLIER", "Proveedores"],
            ["EMPLOYEE", "Empleados"],
            ["THIRD_PARTY", "Consultas"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`rounded-lg border px-3 py-1.5 font-data text-[11px] uppercase tracking-wide transition-colors ${
              filter === key
                ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]"
                : "border-[var(--brand-border)] text-[var(--brand-text-secondary)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <BentoPanel
        title="Sujetos en cuarentena SARLAFT"
        subtitle={`${items.length} registro(s) · liberar requiere justificación`}
        icon={<ShieldAlert className="h-4 w-4" aria-hidden />}
      >
        {!data ? (
          <EmptyState
            title="Cargando bloqueos"
            description="Sincronizando alertas pendientes y hard-locks…"
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck className="h-7 w-7" />}
            title="Sin bloqueos activos"
            description="No hay alertas pendientes BLOQUEADO/ALTO ni fichas con hard-lock. Lo que vea como «Bloqueado» solo en la matriz histórica (ya resuelto) no aparece aquí."
          />
        ) : (
          <NexaTable
            columns={[
              "Sujeto",
              "Tipo",
              "Documento",
              "Riesgo",
              "Estado",
              "Origen",
              "Listas",
              "Acción",
            ]}
          >
            {items.map((r) => (
              <NexaRow
                key={
                  r.openAlertId ||
                  `${r.entityType}:${r.entityId || r.document}`
                }
              >
                <NexaCell>
                  <div className="space-y-1">
                    <p className="text-sm text-[var(--brand-text-primary)]">
                      {r.subjectName}
                    </p>
                    <SarlaftBlockBadge
                      blocked
                      riskScore={r.riskScore}
                      variant="full"
                    />
                    {r.notes ? (
                      <p className="text-[11px] text-[var(--brand-text-secondary)]">
                        {r.notes}
                      </p>
                    ) : null}
                  </div>
                </NexaCell>
                <NexaCell>
                  <span className="font-data text-xs">
                    {TYPE_ES[r.entityType] || r.entityType}
                  </span>
                </NexaCell>
                <NexaCell>
                  <span className="font-data text-xs">{r.document}</span>
                </NexaCell>
                <NexaCell>
                  <ComplianceBadge
                    level={
                      r.riskScore >= 80 || r.alertRisk === "BLOCKED"
                        ? "RED"
                        : "AMBER"
                    }
                    pulse
                  >
                    {r.alertRisk || "BLOCKED"} · {r.riskScore}
                  </ComplianceBadge>
                </NexaCell>
                <NexaCell>
                  {r.alertStatus ? (
                    <StatusPulseBadge
                      tone={
                        r.alertStatus === "UNDER_REVIEW" ? "fatiga" : "danger"
                      }
                    >
                      {STATUS_ES[r.alertStatus] || r.alertStatus}
                    </StatusPulseBadge>
                  ) : (
                    <StatusPulseBadge tone="danger">Hard-lock</StatusPulseBadge>
                  )}
                </NexaCell>
                <NexaCell>
                  <span className="font-data text-[10px] text-[var(--brand-text-secondary)]">
                    {r.hardLocked
                      ? "Ficha bloqueada"
                      : "Alerta matriz"}
                    <br />
                    {formatWhen(r.updatedAt)}
                  </span>
                </NexaCell>
                <NexaCell>
                  <span className="font-data text-[10px] text-[var(--brand-text-secondary)]">
                    {r.listsMatched?.length
                      ? r.listsMatched.slice(0, 3).join(" · ")
                      : "—"}
                  </span>
                </NexaCell>
                <NexaCell>
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-auto px-2 py-1 text-[10px]"
                    disabled={busy}
                    onClick={() => {
                      setSelected(r);
                      setNotes("");
                      setError("");
                    }}
                  >
                    <Unlock className="mr-1 inline h-3 w-3" aria-hidden />
                    Liberar
                  </Button>
                </NexaCell>
              </NexaRow>
            ))}
          </NexaTable>
        )}
      </BentoPanel>

      <SlideOver
        open={Boolean(selected)}
        onClose={() => {
          setSelected(null);
          setNotes("");
        }}
        title={selected ? `Liberar · ${selected.subjectName}` : "Liberar bloqueo"}
        description="Cierra la alerta pendiente de la matriz y, si hay ficha, limpia el hard-lock. Queda registro de auditoría."
        widthClass="max-w-lg"
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              className="w-auto px-4 py-2"
              onClick={() => {
                setSelected(null);
                setNotes("");
              }}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="sarlaft-liberar-form"
              variant="primary"
              className="w-auto px-4 py-2"
              disabled={busy || notes.trim().length < 5}
            >
              <Unlock className="mr-1 inline h-3.5 w-3.5" aria-hidden />
              Confirmar liberación
            </Button>
          </>
        }
      >
        {selected ? (
          <form
            id="sarlaft-liberar-form"
            onSubmit={(e) => void liberar(e)}
            className="space-y-4"
          >
            <div className="rounded-lg border border-[var(--brand-border)] bg-[var(--brand-canvas)] p-3 text-sm">
              <p className="font-semibold text-[var(--brand-text-primary)]">
                {selected.subjectName}
              </p>
              <p className="mt-1 font-data text-xs text-[var(--brand-text-secondary)]">
                {TYPE_ES[selected.entityType]} · Doc. {selected.document}
                {selected.openAlertId
                  ? ` · Alerta ${selected.openAlertId.slice(0, 8)}…`
                  : ""}
                {selected.hardLocked ? " · Hard-lock en ficha" : ""}
              </p>
              {selected.notes ? (
                <p className="mt-2 text-xs text-[var(--brand-text-secondary)]">
                  Motivo: {selected.notes}
                </p>
              ) : null}
              {selected.listsMatched?.length ? (
                <p className="mt-1 font-data text-[10px] text-[var(--brand-danger)]">
                  Listas: {selected.listsMatched.join(" · ")}
                </p>
              ) : null}
            </div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-secondary)]">
              Justificación de liberación
              <textarea
                className="field mt-1 min-h-[120px] w-full"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Explique por qué se libera (mín. 5 caracteres)."
                required
                minLength={5}
                maxLength={2000}
              />
            </label>
          </form>
        ) : null}
      </SlideOver>
    </div>
  );
}
