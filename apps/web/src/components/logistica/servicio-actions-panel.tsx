"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@fsg/ui";
import { statusEs } from "@fsg/shared";
import {
  AlertOctagon,
  Download,
  FileText,
  Loader2,
  MessageSquare,
  Wrench,
  X,
} from "lucide-react";
import { api, apiDownload } from "@/lib/api";
import { StatusPulseBadge } from "@/components/audit";
import { OpsChatPanel } from "@/components/logistica/ops-chat-panel";
import type { Servicio, TripEta } from "@/components/logistica/logistica-shared";
import { TripEtaCard } from "@/components/logistica/trip-eta-card";
import { useCanOpenPath, useCanPerform } from "@/lib/route-access";

type FuecItem = {
  id: string;
  number: string;
  status: string;
  validFrom: string;
  validTo: string;
  pdfAvailable: boolean;
  vehicle: { plate: string } | null;
};

type FallaResult = {
  workOrder: { id: string; code: string; plate: string; severity: string };
  vehicleBlockedForDispatch: boolean;
  message: string;
};

const FUEC_PRIORITY = ["VALID", "EXPIRING"];

function pickFuec(items: FuecItem[]): FuecItem | null {
  return (
    items.find((f) => FUEC_PRIORITY.includes(f.status)) ?? items[0] ?? null
  );
}

function SectionTitle({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--brand-text-secondary)]">
      {icon}
      {children}
    </p>
  );
}

function FuecSection({ tripId }: { tripId: string }) {
  const canOpenPath = useCanOpenPath();
  const [items, setItems] = useState<FuecItem[] | null>(null);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  const load = useCallback(async () => {
    setItems(null);
    setError("");
    try {
      const rows = await api<FuecItem[]>(
        `/juridico/fuec?tripId=${encodeURIComponent(tripId)}`,
      );
      setItems(rows);
    } catch (e) {
      setItems([]);
      setError(e instanceof Error ? e.message : "No se pudo consultar el FUEC");
    }
  }, [tripId]);

  useEffect(() => {
    void load();
  }, [load]);

  const fuec = items ? pickFuec(items) : null;

  async function download() {
    if (!fuec) return;
    setDownloading(true);
    setDownloadError("");
    try {
      await apiDownload(`/juridico/fuec/${fuec.id}/pdf`, `FUEC-${fuec.number}.pdf`);
    } catch (e) {
      setDownloadError(
        e instanceof Error ? e.message : "No se pudo descargar el FUEC",
      );
    } finally {
      setDownloading(false);
    }
  }

  return (
    <section className="rounded-lg border border-[var(--brand-border)] p-3" data-testid="servicio-fuec">
      <SectionTitle icon={<FileText className="h-3 w-3" />}>FUEC del servicio</SectionTitle>
      {items === null ? (
        <p className="flex items-center gap-2 text-xs text-[var(--brand-text-secondary)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Consultando FUEC…
        </p>
      ) : error ? (
        <div className="space-y-2">
          <p role="alert" className="text-xs text-[var(--brand-danger)]">{error}</p>
          <Button type="button" variant="ghost" className="w-auto px-2 py-1 text-xs" onClick={() => void load()}>
            Reintentar
          </Button>
        </div>
      ) : !fuec ? (
        <div className="space-y-1">
          <p className="text-xs text-[var(--brand-text-primary)]">
            Este servicio no tiene FUEC emitido.
          </p>
          <p className="text-[11px] text-[var(--brand-text-secondary)]">
            El extracto se emite en Jurídico vinculado al viaje o a su planilla.
            {canOpenPath("/juridico") ? (
              <>
                {" "}
                <Link href="/juridico" className="text-brand-primary underline">
                  Ir a Jurídico
                </Link>
              </>
            ) : null}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-data text-xs text-[var(--brand-text-primary)]">{fuec.number}</span>
            <StatusPulseBadge tone={FUEC_PRIORITY.includes(fuec.status) ? "active" : "neutral"}>
              {statusEs(fuec.status)}
            </StatusPulseBadge>
          </div>
          <p className="text-[11px] text-[var(--brand-text-secondary)]">
            Vigencia {new Date(fuec.validFrom).toLocaleDateString("es-CO")} –{" "}
            {new Date(fuec.validTo).toLocaleDateString("es-CO")}
            {fuec.vehicle?.plate ? ` · ${fuec.vehicle.plate}` : ""}
          </p>
          {fuec.pdfAvailable ? (
            <Button
              type="button"
              variant="primary"
              className="w-auto px-3 py-1.5 text-xs"
              disabled={downloading}
              onClick={() => void download()}
            >
              {downloading ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="mr-1 h-3.5 w-3.5" />
              )}
              {downloading ? "Descargando…" : "Descargar FUEC"}
            </Button>
          ) : (
            <p className="text-[11px] text-[var(--brand-warning)]">
              El FUEC está registrado pero no tiene PDF disponible para descarga.
            </p>
          )}
          {downloadError ? (
            <p role="alert" className="text-xs text-[var(--brand-danger)]">{downloadError}</p>
          ) : null}
        </div>
      )}
    </section>
  );
}

function FallaMecanicaSection({
  servicio,
  onCreated,
}: {
  servicio: Servicio;
  onCreated?: (result: FallaResult) => void;
}) {
  const canReport = useCanPerform("logistica.servicio.fallaMecanica");
  const canOpenPath = useCanOpenPath();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [critical, setCritical] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<FallaResult | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (description.trim().length < 5) {
      setError("Describe la falla (mínimo 5 caracteres)");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await api<FallaResult>(
        `/logistica/servicios/${servicio.id}/falla-mecanica`,
        {
          method: "POST",
          body: JSON.stringify({ description: description.trim(), critical }),
        },
      );
      setResult(res);
      setOpen(false);
      setDescription("");
      setCritical(false);
      onCreated?.(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la OT");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-lg border border-[var(--brand-border)] p-3" data-testid="servicio-falla">
      <SectionTitle icon={<Wrench className="h-3 w-3" />}>Falla mecánica</SectionTitle>
      {result ? (
        <div className="mb-2 rounded border border-[var(--brand-primary)]/30 bg-[var(--brand-primary)]/10 p-2 text-xs text-[var(--brand-primary)]" role="status">
          <p>{result.message}</p>
          {result.vehicleBlockedForDispatch ? (
            <p className="mt-1 text-[var(--brand-danger)]">
              Falla crítica: la unidad queda bloqueada para despacho.
            </p>
          ) : null}
          {canOpenPath("/taller") ? (
            <Link href="/taller" className="mt-1 inline-block underline">
              Ver en Taller
            </Link>
          ) : null}
        </div>
      ) : null}

      {!canReport ? (
        <p className="text-[11px] text-[var(--brand-text-secondary)]">
          Tu cargo no puede reportar fallas desde operaciones.
        </p>
      ) : !servicio.vehicle ? (
        <p className="text-[11px] text-[var(--brand-text-secondary)]">
          El servicio no tiene vehículo asignado; asigna una placa para reportar fallas.
        </p>
      ) : servicio.status === "CANCELLED" ? (
        <p className="text-[11px] text-[var(--brand-text-secondary)]">
          El servicio está cancelado.
        </p>
      ) : !open ? (
        <Button
          type="button"
          variant="ghost"
          className="w-auto border border-[var(--brand-danger)]/40 px-3 py-1.5 text-xs text-[var(--brand-danger)] hover:bg-[var(--brand-danger)]/10"
          onClick={() => {
            setOpen(true);
            setError("");
          }}
        >
          <AlertOctagon className="mr-1 h-3.5 w-3.5" />
          Reportar falla mecánica
        </Button>
      ) : (
        <form onSubmit={submit} className="space-y-2">
          <p className="text-[11px] text-[var(--brand-text-secondary)]">
            Se abrirá una OT en Taller para la placa{" "}
            <span className="font-data text-[var(--brand-text-primary)]">{servicio.vehicle.plate}</span>{" "}
            y la unidad pasará a mantenimiento.
          </p>
          <textarea
            className="field min-h-[72px] w-full text-sm"
            placeholder="Describe la falla reportada…"
            value={description}
            maxLength={2000}
            onChange={(e) => setDescription(e.target.value)}
            disabled={submitting}
          />
          <label className="flex items-start gap-2 text-[11px] text-[var(--brand-text-secondary)]">
            <input
              type="checkbox"
              checked={critical}
              onChange={(e) => setCritical(e.target.checked)}
              disabled={submitting}
            />
            Falla crítica (bloquea la unidad para despacho)
          </label>
          {error ? (
            <p role="alert" className="text-xs text-[var(--brand-danger)]">{error}</p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              className="w-auto px-2 py-1 text-xs"
              disabled={submitting}
              onClick={() => {
                setOpen(false);
                setError("");
              }}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              className="w-auto px-3 py-1 text-xs"
              disabled={submitting || description.trim().length < 5}
            >
              {submitting ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
              {submitting ? "Creando OT…" : "Crear OT en Taller"}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

/**
 * Panel lateral (no modal) de acciones del servicio seleccionado en Operaciones:
 * FUEC del viaje, chat con el conductor asignado y reporte de falla → OT Taller.
 */
export function ServicioActionsPanel({
  servicio,
  eta,
  etaLoading,
  onClose,
  onWorkOrderCreated,
  className = "",
}: {
  servicio: Servicio;
  eta?: TripEta | null;
  etaLoading?: boolean;
  onClose: () => void;
  onWorkOrderCreated?: (result: FallaResult) => void;
  className?: string;
}) {
  return (
    <aside
      className={`nexa-panel relative z-10 flex min-h-0 flex-col overflow-hidden ${className}`}
      aria-label={`Acciones del servicio ${servicio.code}`}
      data-testid="servicio-actions-panel"
    >
      <header className="flex items-start justify-between gap-2 border-b border-[var(--brand-border)] px-3 py-2">
        <div className="min-w-0">
          <p className="font-data text-sm font-semibold text-brand-primary">{servicio.code}</p>
          <p className="line-clamp-2 text-xs text-[var(--brand-text-secondary)]">
            {servicio.origin} → {servicio.destination}
          </p>
          <p className="mt-1 font-data text-[11px] text-[var(--brand-text-secondary)]">
            {servicio.driver?.name ?? "Sin conductor"} · {servicio.vehicle?.plate ?? "Sin placa"} ·{" "}
            {statusEs(servicio.status)}
          </p>
        </div>
        <button
          type="button"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-transparent text-[var(--brand-text-secondary)] hover:border-[var(--brand-border)]"
          aria-label="Cerrar panel del servicio"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {servicio.status === "IN_TRANSIT" ? (
          <TripEtaCard eta={eta} loading={etaLoading} />
        ) : null}

        <FuecSection tripId={servicio.id} />

        <section data-testid="servicio-chat">
          <SectionTitle icon={<MessageSquare className="h-3 w-3" />}>
            Chat con el conductor
          </SectionTitle>
          {servicio.driver ? (
            <>
              <p className="mb-2 text-[11px] text-[var(--brand-text-secondary)]">
                {servicio.driver.name} · canal del servicio {servicio.code} en la app del conductor
              </p>
              <OpsChatPanel
                mode="trip"
                tripId={servicio.id}
                tripCode={servicio.code}
                heightClass="h-[300px]"
              />
            </>
          ) : (
            <p className="rounded-lg border border-[var(--brand-border)] p-3 text-[11px] text-[var(--brand-text-secondary)]">
              El servicio no tiene conductor asignado. Asígnalo para habilitar el chat del viaje.
            </p>
          )}
        </section>

        <FallaMecanicaSection servicio={servicio} onCreated={onWorkOrderCreated} />
      </div>
    </aside>
  );
}
