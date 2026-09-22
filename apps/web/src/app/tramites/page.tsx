"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Button } from "@fsg/ui";
import { HARD_RULES, statusEs } from "@fsg/shared";
import { FileCheck, Plus, RefreshCw, ShieldAlert } from "lucide-react";
import { api } from "@/lib/api";
import {
  EmptyState,
  KpiCard,
  SlideOver,
  StatusPulseBadge,
} from "@/components/audit";
import { BentoPanel } from "@/components/nexa/bento-panel";
import { BlockStatusBadge } from "@/components/nexa/block-status-badge";
import { NexaTable, NexaRow, NexaCell } from "@/components/nexa/nexa-table";
import {
  WorkbenchSearch,
  WorkbenchTabs,
  WorkbenchToolbar,
} from "@/components/workbench-toolbar";
import { humanizeBlockReason } from "@/lib/block-reasons";

type Vehicle = { id: string; plate: string; brand: string; model: string };

type Procedure = {
  id: string;
  type: string;
  reference?: string | null;
  status: string;
  validTo: string;
  daysLeft?: number | null;
  notes?: string | null;
  vehicle: { plate: string; brand: string; model: string };
};

type FleetMatrix = {
  counts: { green: number; yellow: number; red: number };
  vehicles: {
    vehicleId: string;
    plate: string;
    semaphore: "GREEN" | "YELLOW" | "RED";
    dispatchable: boolean;
    blockReasons: string[];
    warnings: string[];
    odometerKm: number;
  }[];
};

const TYPE_ES: Record<string, string> = {
  SOAT: "SOAT",
  TECNOMECANICA: "Tecnomecánica",
  TARJETA_OPERACION: "Tarjeta de operación",
  LICENCIA_TRANSITO: "Licencia de tránsito",
  REVISION_PREVENTIVA: "Revisión preventiva",
  OTHER: "Otro",
};

const EMPTY_FORM = {
  vehicleId: "",
  type: "SOAT",
  reference: "",
  validTo: "",
  notes: "",
};

const EMPTY_ALTA = {
  plate: "",
  brand: "",
  model: "",
  year: String(new Date().getFullYear()),
};

function asVehicleList(raw: unknown): Vehicle[] {
  if (Array.isArray(raw)) return raw as Vehicle[];
  if (
    raw &&
    typeof raw === "object" &&
    Array.isArray((raw as { items?: unknown }).items)
  ) {
    return (raw as { items: Vehicle[] }).items;
  }
  return [];
}

export default function TramitesPage() {
  const [rows, setRows] = useState<Procedure[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [matrix, setMatrix] = useState<FleetMatrix | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [alta, setAlta] = useState(EMPTY_ALTA);
  const [showAlta, setShowAlta] = useState(false);
  const [fleetTab, setFleetTab] = useState<"all" | "route" | "alerts">("all");
  const [fleetQuery, setFleetQuery] = useState("");
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState<string | null>(null);

  async function syncRunt(vehicleId: string) {
    setSyncBusy(vehicleId);
    setLoadError("");
    try {
      await api(`/tramites/sync/${vehicleId}`, { method: "POST" });
      await load();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Sync RUNT fallido");
    } finally {
      setSyncBusy(null);
    }
  }

  async function loadFleetUnits(): Promise<Vehicle[]> {
    try {
      const v = await api<unknown>("/tramites/vehicles");
      const list = asVehicleList(v);
      if (list.length) return list;
    } catch {
      /* fallback */
    }
    try {
      const v = await api<unknown>("/fleet/vehicles");
      const list = asVehicleList(v);
      if (list.length) return list;
    } catch {
      /* matriz */
    }
    return [];
  }

  async function load() {
    setLoadError("");
    const [p, v, m] = await Promise.allSettled([
      api<Procedure[]>("/tramites/procedures"),
      loadFleetUnits(),
      api<FleetMatrix>("/tramites/fleet-matrix"),
    ]);
    const errors: string[] = [];
    if (p.status === "fulfilled")
      setRows(Array.isArray(p.value) ? p.value : []);
    else
      errors.push(
        p.reason instanceof Error ? p.reason.message : "Trámites no disponibles",
      );

    let fleet: Vehicle[] = v.status === "fulfilled" ? v.value : [];
    if (m.status === "fulfilled") {
      setMatrix(m.value);
      if (!fleet.length && m.value?.vehicles?.length) {
        fleet = m.value.vehicles.map((row) => ({
          id: row.vehicleId,
          plate: row.plate,
          brand: "",
          model: "",
        }));
      }
    } else {
      errors.push(
        m.reason instanceof Error
          ? m.reason.message
          : "Semáforo de flota no disponible",
      );
    }
    setVehicles(fleet);
    if (errors.length) setLoadError(errors.join(" · "));
  }

  useEffect(() => {
    void load().catch((e) =>
      setLoadError(e instanceof Error ? e.message : "Conexión fallida"),
    );
  }, []);

  function openForm() {
    setFormError("");
    setForm(EMPTY_FORM);
    setAlta(EMPTY_ALTA);
    setShowAlta(vehicles.length === 0);
    setFormOpen(true);
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setFormError("");
    setBusy(true);
    try {
      let vehicleId = form.vehicleId;
      if (!vehicleId) {
        const plate = alta.plate.trim();
        if (!plate) {
          setFormError("Seleccione una placa o matricule la unidad");
          return;
        }
        const created = await api<Vehicle>("/tramites/vehicles", {
          method: "POST",
          body: JSON.stringify({
            plate,
            brand: alta.brand.trim() || "N/D",
            model: alta.model.trim() || "N/D",
            year: Number(alta.year) || new Date().getFullYear(),
          }),
        });
        vehicleId = created.id;
      }
      if (!form.validTo) {
        setFormError("Indique la vigencia del documento");
        return;
      }
      await api("/tramites/procedures", {
        method: "POST",
        body: JSON.stringify({
          vehicleId,
          type: form.type,
          reference: form.reference,
          validTo: form.validTo,
          notes: form.notes,
        }),
      });
      setForm(EMPTY_FORM);
      setAlta(EMPTY_ALTA);
      setFormOpen(false);
      await load();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "No se pudo registrar el trámite",
      );
    } finally {
      setBusy(false);
    }
  }

  const filteredFleet = useMemo(() => {
    const list = matrix?.vehicles || [];
    const q = fleetQuery.trim().toLowerCase();
    return list.filter((v) => {
      if (fleetTab === "route" && v.semaphore !== "GREEN") return false;
      if (
        fleetTab === "alerts" &&
        v.semaphore !== "YELLOW" &&
        v.semaphore !== "RED"
      ) {
        return false;
      }
      if (!q) return true;
      const hay = [v.plate, ...v.blockReasons, ...v.warnings]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [matrix, fleetTab, fleetQuery]);

  const alertCount = (matrix?.counts.yellow ?? 0) + (matrix?.counts.red ?? 0);
  const warnDays = HARD_RULES.DOC_EXPIRING_DAYS;
  const expiredDocs = useMemo(
    () => rows.filter((r) => r.status === "EXPIRED"),
    [rows],
  );
  const expiringDocs = useMemo(
    () => rows.filter((r) => r.status === "EXPIRING"),
    [rows],
  );

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-border pb-4">
        <div>
          <p className="font-data text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-primary">
            Trámites · Compliance
          </p>
          <h1 className="font-sans text-2xl font-semibold tracking-tight text-brand-text-primary md:text-3xl">
            Escudo documental · SOAT / RTM
          </h1>
          <p className="mt-1 font-sans text-sm text-brand-text-secondary">
            RUNT en vivo · Kill-Switch activo
          </p>
        </div>
        <Button
          type="button"
          variant="primary"
          className="w-auto px-4 py-2"
          onClick={openForm}
        >
          <Plus className="mr-1.5 inline h-4 w-4" aria-hidden />
          Nuevo trámite
        </Button>
      </header>

      {matrix && matrix.counts.red > 0 ? (
        <div className="flex items-start gap-3 rounded-lg border border-brand-danger/40 bg-brand-danger/10 px-4 py-3">
          <ShieldAlert
            className="mt-0.5 h-5 w-5 shrink-0 text-brand-danger"
            aria-hidden
          />
          <div>
            <p className="font-sans text-sm font-semibold text-brand-text-primary">
              Kill-Switch activo · {matrix.counts.red} unidad
              {matrix.counts.red !== 1 ? "es" : ""} bloqueada
              {matrix.counts.red !== 1 ? "s" : ""}
            </p>
            <p className="mt-0.5 font-sans text-xs text-brand-text-secondary">
              Despacho restringido por SOAT, RTM o tarjeta de operación vencidos
              o ausentes.
            </p>
          </div>
        </div>
      ) : null}

      {expiredDocs.length > 0 || expiringDocs.length > 0 ? (
        <div
          className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${
            expiredDocs.length
              ? "border-brand-danger/40 bg-brand-danger/10"
              : "border-brand-warning/40 bg-brand-warning/10"
          }`}
        >
          <ShieldAlert
            className={`mt-0.5 h-5 w-5 shrink-0 ${
              expiredDocs.length ? "text-brand-danger" : "text-brand-warning"
            }`}
            aria-hidden
          />
          <div>
            <p className="font-sans text-sm font-semibold text-brand-text-primary">
              Vigencia automática · {expiredDocs.length} vencido
              {expiredDocs.length !== 1 ? "s" : ""}
              {expiringDocs.length
                ? ` · ${expiringDocs.length} por vencer (≤${warnDays} d)`
                : ""}
            </p>
            <p className="mt-0.5 font-sans text-xs text-brand-text-secondary">
              Amarillo si faltan ≤{warnDays} días. El día de vencimiento sigue
              vigente; al día siguiente pasa a rojo y bloquea la unidad.
            </p>
          </div>
        </div>
      ) : null}

      {loadError ? (
        <p className="rounded-lg border border-brand-danger/40 bg-brand-danger/10 px-3 py-2 font-data text-sm text-brand-danger">
          {loadError}
        </p>
      ) : null}

      {matrix ? (
        <section className="grid gap-3 sm:grid-cols-3">
          <KpiCard
            label="Verde · aptos"
            value={matrix.counts.green}
            delta={`Documentación vigente (>${warnDays} d)`}
            tone="ok"
          />
          <KpiCard
            label={`Amarillo · ≤${warnDays} días`}
            value={matrix.counts.yellow}
            delta="Renovación planificada"
            tone="warn"
          />
          <KpiCard
            label="Rojo · bloqueados"
            value={matrix.counts.red}
            delta={`Bloqueo operativo · alertas ${alertCount}`}
            tone="danger"
          />
        </section>
      ) : null}

      {matrix ? (
        <BentoPanel
          title="Semáforo de flota"
          subtitle="Documentación · despacho"
          icon={<FileCheck />}
          tour="kpi"
        >
          <WorkbenchToolbar>
            <WorkbenchTabs
              value={fleetTab}
              onChange={(id) =>
                setFleetTab(id as "all" | "route" | "alerts")
              }
              tabs={[
                {
                  id: "all",
                  label: "Todos",
                  count: matrix.vehicles.length,
                  tip: "Toda la flota con semáforo documental",
                },
                {
                  id: "route",
                  label: "Aptos",
                  count: matrix.counts.green,
                  tip: `Verde: documentación vigente (>${warnDays} días). Aptos para despacho.`,
                },
                {
                  id: "alerts",
                  label: "Alertas / bloqueados",
                  count: matrix.counts.yellow + matrix.counts.red,
                  tip: `Amarillo ≤${warnDays} días o rojo vencido. Rojo bloquea despacho.`,
                },
              ]}
            />
            <WorkbenchSearch
              value={fleetQuery}
              onChange={setFleetQuery}
              placeholder="Buscar por placa…"
            />
          </WorkbenchToolbar>

          {!filteredFleet.length ? (
            <div className="mt-3">
              <EmptyState
                icon={<FileCheck className="h-7 w-7" />}
                title={
                  vehicles.length === 0
                    ? "Sin unidades matriculadas"
                    : "Sin unidades en filtro"
                }
                description={
                  vehicles.length === 0
                    ? "Matricule una placa desde Nuevo trámite para indexar SOAT, tecnomecánica o TO."
                    : "Ajuste pestaña o búsqueda de placa."
                }
                actionLabel="+ Nuevo trámite"
                onAction={openForm}
              />
            </div>
          ) : (
            <div className="mt-3">
              <NexaTable
                columns={["Placa", "Odómetro", "Semáforo", "Detalle", "RUNT"]}
              >
                {filteredFleet.map((v) => (
                  <NexaRow key={v.vehicleId}>
                    <NexaCell mono>{v.plate}</NexaCell>
                    <NexaCell mono className="text-xs">
                      {v.odometerKm.toLocaleString("es-CO")} km
                    </NexaCell>
                    <NexaCell>
                      {v.semaphore === "RED" || !v.dispatchable ? (
                        <BlockStatusBadge
                          blocked
                          reasons={[...v.blockReasons, ...v.warnings]}
                          blockedLabel="Bloqueo"
                          entityTitle={`Bloqueo · ${v.plate}`}
                          entitySubtitle="Unidad · compliance documental"
                        />
                      ) : (
                        <StatusPulseBadge
                          tone={
                            v.semaphore === "GREEN" ? "active" : "fatiga"
                          }
                          pulse={v.semaphore !== "GREEN"}
                        >
                          {v.semaphore === "GREEN" ? "Verde" : "Amarillo"}
                        </StatusPulseBadge>
                      )}
                    </NexaCell>
                    <NexaCell className="text-xs text-brand-text-secondary">
                      {[...v.blockReasons, ...v.warnings]
                        .map(humanizeBlockReason)
                        .join(" · ") || "Documentación al día"}
                    </NexaCell>
                    <NexaCell>
                      <Button
                        type="button"
                        variant="ghost"
                        className="w-auto px-2 py-1 text-[10px]"
                        loading={syncBusy === v.vehicleId}
                        onClick={() => void syncRunt(v.vehicleId)}
                      >
                        <RefreshCw
                          className="mr-1 inline h-3 w-3"
                          aria-hidden
                        />
                        Sync RUNT
                      </Button>
                    </NexaCell>
                  </NexaRow>
                ))}
              </NexaTable>
            </div>
          )}
        </BentoPanel>
      ) : null}

      {!rows.length ? (
        <EmptyState
          icon={<FileCheck className="h-7 w-7" />}
          title="Sin trámites registrados"
          description="Indexe SOAT, tecnomecánica o tarjeta de operación."
          actionLabel="+ Nuevo trámite"
          onAction={openForm}
        />
      ) : (
        <BentoPanel
          title="Planilla documental"
          subtitle={`${rows.length} trámites indexados`}
          tour="table"
        >
          <NexaTable
            columns={["Vehículo", "Trámite", "Vence", "Estado", "Acciones"]}
          >
            {rows.map((r) => (
              <NexaRow key={r.id}>
                <NexaCell mono>{r.vehicle.plate}</NexaCell>
                <NexaCell>
                  {TYPE_ES[r.type] || r.type}
                  {r.reference ? (
                    <span className="mt-0.5 block font-data text-[11px] text-brand-text-secondary">
                      Ref: {r.reference}
                    </span>
                  ) : null}
                </NexaCell>
                <NexaCell mono className="text-xs">
                  {new Date(r.validTo).toLocaleDateString("es-CO")}
                  {typeof r.daysLeft === "number" ? (
                    <span
                      className={`mt-0.5 block ${
                        r.daysLeft < 0
                          ? "text-brand-danger"
                          : r.daysLeft <= warnDays
                            ? "text-brand-warning"
                            : "text-brand-text-secondary"
                      }`}
                    >
                      {r.daysLeft < 0
                        ? `Venció hace ${Math.abs(r.daysLeft)} d`
                        : r.daysLeft === 0
                          ? "Vence hoy · vigente hasta medianoche"
                          : `${r.daysLeft} d restantes`}
                    </span>
                  ) : null}
                </NexaCell>
                <NexaCell>
                  <StatusPulseBadge
                    tone={
                      r.status === "VALID"
                        ? "active"
                        : r.status === "EXPIRING"
                          ? "fatiga"
                          : "danger"
                    }
                    pulse={r.status !== "VALID"}
                  >
                    {r.status === "VALID"
                      ? "Vigente"
                      : r.status === "EXPIRING"
                        ? "Por vencer"
                        : r.status === "EXPIRED"
                          ? "Expirado"
                          : statusEs(r.status)}
                  </StatusPulseBadge>
                  {r.status === "EXPIRED" ||
                  (typeof r.daysLeft === "number" && r.daysLeft < 0) ? (
                    <p className="mt-1 font-data text-[10px] text-brand-danger">
                      Documento expirado · renueve o actualice
                    </p>
                  ) : r.status === "EXPIRING" ? (
                    <p className="mt-1 font-data text-[10px] text-brand-warning">
                      Por vencer · actualice vigencia
                    </p>
                  ) : null}
                </NexaCell>
                <NexaCell>
                  <div className="flex flex-wrap items-center gap-1">
                    <input
                      className="field w-28 py-1 font-data text-xs"
                      type="date"
                      id={`renew-${r.id}`}
                      defaultValue={r.validTo.slice(0, 10)}
                    />
                    <Button
                      variant="ghost"
                      className="w-auto px-2 py-1"
                      onClick={async () => {
                        const el = document.getElementById(
                          `renew-${r.id}`,
                        ) as HTMLInputElement | null;
                        if (!el?.value) return;
                        await api(`/tramites/procedures/${r.id}`, {
                          method: "PATCH",
                          body: JSON.stringify({ validTo: el.value }),
                        });
                        await load();
                      }}
                    >
                      Renovar
                    </Button>
                  </div>
                </NexaCell>
              </NexaRow>
            ))}
          </NexaTable>
        </BentoPanel>
      )}

      <SlideOver
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Nuevo trámite"
        description="SOAT, RTM, TO · sincronización RUNT o carga OCR anti-fraude"
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              className="w-auto px-4 py-2"
              onClick={() => setFormOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="tramite-form"
              variant="primary"
              className="w-auto px-4 py-2"
              disabled={busy}
            >
              {busy ? "Registrando…" : "Registrar"}
            </Button>
          </>
        }
      >
        <form id="tramite-form" onSubmit={onCreate} className="space-y-4">
          {formError ? (
            <p className="rounded-md border border-brand-danger/40 bg-brand-danger/10 px-3 py-2 font-data text-xs text-brand-danger">
              {formError}
            </p>
          ) : null}
          <label className="block space-y-1.5">
            <span className="font-data text-[10px] font-semibold uppercase tracking-wider text-brand-text-secondary">
              Vehículo
            </span>
            <select
              className="field w-full font-data"
              value={showAlta ? "__alta__" : form.vehicleId}
              onChange={(e) => {
                const id = e.target.value;
                if (id === "__alta__") {
                  setShowAlta(true);
                  setForm({ ...form, vehicleId: "" });
                  return;
                }
                setShowAlta(false);
                setForm({ ...form, vehicleId: id });
              }}
              required={vehicles.length > 0 && !showAlta}
            >
              <option value="">
                {vehicles.length
                  ? "Seleccione placa…"
                  : "Sin unidades — matricule abajo"}
              </option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plate}
                  {v.brand || v.model
                    ? ` — ${v.brand} ${v.model}`.trim()
                    : ""}
                </option>
              ))}
              <option value="__alta__">+ Agregar auto / matricular unidad</option>
            </select>
            {form.vehicleId ? (
              <Button
                type="button"
                variant="ghost"
                className="mt-2 w-auto text-xs"
                loading={syncBusy === form.vehicleId}
                onClick={() => void syncRunt(form.vehicleId)}
              >
                <RefreshCw className="mr-1 inline h-3 w-3" aria-hidden />
                Descargar vigencias desde RUNT
              </Button>
            ) : null}
          </label>
          {showAlta || vehicles.length === 0 ? (
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-brand-border p-3">
              <label className="col-span-2 block space-y-1.5">
                <span className="font-data text-[10px] font-semibold uppercase tracking-wider text-brand-text-secondary">
                  Placa
                </span>
                <input
                  className="field w-full font-data"
                  data-field="skip"
                  placeholder="ABC-123"
                  value={alta.plate}
                  onChange={(e) =>
                    setAlta({ ...alta, plate: e.target.value.toUpperCase() })
                  }
                  required={!form.vehicleId}
                />
              </label>
              <label className="block space-y-1.5">
                <span className="font-data text-[10px] font-semibold uppercase tracking-wider text-brand-text-secondary">
                  Marca
                </span>
                <input
                  className="field w-full font-sans"
                  data-field="skip"
                  placeholder="Chevrolet"
                  value={alta.brand}
                  onChange={(e) => setAlta({ ...alta, brand: e.target.value })}
                  required={!form.vehicleId}
                />
              </label>
              <label className="block space-y-1.5">
                <span className="font-data text-[10px] font-semibold uppercase tracking-wider text-brand-text-secondary">
                  Modelo
                </span>
                <input
                  className="field w-full font-sans"
                  data-field="skip"
                  placeholder="NPR"
                  value={alta.model}
                  onChange={(e) => setAlta({ ...alta, model: e.target.value })}
                  required={!form.vehicleId}
                />
              </label>
              <label className="col-span-2 block space-y-1.5">
                <span className="font-data text-[10px] font-semibold uppercase tracking-wider text-brand-text-secondary">
                  Año
                </span>
                <input
                  className="field w-full font-data"
                  data-field="skip"
                  inputMode="numeric"
                  value={alta.year}
                  onChange={(e) => setAlta({ ...alta, year: e.target.value })}
                />
              </label>
            </div>
          ) : null}
          <label className="block space-y-1.5">
            <span className="font-data text-[10px] font-semibold uppercase tracking-wider text-brand-text-secondary">
              Tipo
            </span>
            <select
              className="field w-full"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              {Object.entries(TYPE_ES).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="font-data text-[10px] font-semibold uppercase tracking-wider text-brand-text-secondary">
              Nº póliza / referencia
            </span>
            <input
              className="field w-full font-data"
              data-field="skip"
              value={form.reference}
              onChange={(e) => setForm({ ...form, reference: e.target.value })}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="font-data text-[10px] font-semibold uppercase tracking-wider text-brand-text-secondary">
              Vigente hasta
            </span>
            <input
              className="field w-full font-data"
              type="date"
              value={form.validTo}
              onChange={(e) => setForm({ ...form, validTo: e.target.value })}
              required
            />
          </label>
          <label className="block space-y-1.5">
            <span className="font-data text-[10px] font-semibold uppercase tracking-wider text-brand-text-secondary">
              Notas
            </span>
            <textarea
              className="field min-h-[72px] w-full font-sans"
              data-field="notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </label>
        </form>
      </SlideOver>
    </div>
  );
}
