"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import {
  Ban,
  CheckCircle2,
  Droplets,
  LogIn,
  LogOut,
  MapPin,
  ParkingSquare,
  ShieldAlert,
  Wrench,
} from "lucide-react";
import { api } from "@/lib/api";
import { statusEs } from "@fsg/shared";
import { PageIntro } from "@/components/page-intro";
import {
  EmptyState,
  KpiCard,
  SlideOver,
  StatusPulseBadge,
} from "@/components/audit";

type InYardUnit = {
  parkingLogId: string;
  plate: string;
  checkedInAt: string;
  vehicle?: {
    id: string;
    plate: string;
    complianceBlocked?: boolean;
    complianceReason?: string | null;
    status?: string;
  } | null;
  driver?: { name: string; fatigueScore?: number } | null;
};

type Dash = {
  inventory: {
    count: number;
    inYard: InYardUnit[];
  };
  yardMap: Array<{
    id: string;
    laneCode: string;
    bayCode: string;
    plate: string | null;
    status: string;
    scheduledDepartAt?: string | null;
  }>;
  washQueue: Array<{
    id: string;
    plate: string;
    priority: number;
    status: string;
  }>;
  talanquera: Array<{
    id: string;
    plate: string;
    kind?: string;
    gateOpened: boolean;
    denied: boolean;
    denyReason: string | null;
    blocks?: string[];
    tripCode?: string | null;
    mode?: string | null;
    createdAt?: string;
  }>;
};

type GateResult = {
  gateOpened?: boolean;
  message?: string;
  plate?: string;
  blocks?: string[];
  trip?: { code: string } | null;
  parking?: { id: string };
  access?: { id: string };
};

const BLOCK_ES: Record<string, string> = {
  NO_ACTIVE_TRIP: "Sin viaje activo en ventana de despacho (±4 h)",
  LPR_NO_ACTIVE_TRIP: "Sin viaje activo en ventana de despacho (±4 h)",
  VEHICLE_DOCS_EXPIRED_JURIDICO: "Documentos jurídicos vencidos (SOAT / TO / pólizas)",
  VEHICLE_COMPLIANCE_BLOCKED: "Unidad con hard-stop documental",
  ALCOHOL_CHECK_MISSING_OR_FAILED: "Alcoholimetría ausente, vencida o fallida",
  DRIVER_FATIGUE: "Conductor en fatiga (bloqueo operativo)",
  DRIVER_DISPATCH_BLOCKED: "Conductor bloqueado para despacho",
  DRIVER_INACTIVE: "Conductor inactivo",
  VEHICLE_STATUS_MAINTENANCE: "Unidad en mantenimiento / taller",
  VEHICLE_STATUS_COMPLIANCE_BLOCKED: "Estado flota: compliance bloqueado",
  VEHICLE_STATUS_OUT_OF_SERVICE: "Unidad fuera de servicio",
  GATE_CHECKOUT_DENIED_COMPLIANCE_BLOCK: "Salida denegada por compliance",
  LPR_HARD_STOP: "Hard-stop de talanquera",
  ALREADY_IN_YARD: "La unidad ya está en patio",
  NOT_IN_YARD: "No hay ingreso abierto para esta placa",
  PLATE_NOT_IN_FLEET: "Placa no registrada en la flota",
};

function blockLabel(code: string) {
  return BLOCK_ES[code] || code.replace(/_/g, " ");
}

function extractBlocks(err: unknown): string[] {
  if (!(err instanceof Error)) return [];
  const msg = err.message;
  // formatApiError may stringify JSON body
  try {
    const parsed = JSON.parse(msg) as { blocks?: string[]; message?: string };
    if (Array.isArray(parsed.blocks)) return parsed.blocks;
  } catch {
    /* plain text */
  }
  const known = Object.keys(BLOCK_ES).filter((k) => msg.includes(k));
  return known;
}

export default function CoordinadorPatioDashboard() {
  const [dash, setDash] = useState<Dash | null>(null);
  const [panel, setPanel] = useState<"none" | "ingreso" | "salida">("none");
  const [plate, setPlate] = useState("");
  const [guardName, setGuardName] = useState("");
  const [odometerKm, setOdometerKm] = useState("");
  const [departAt, setDepartAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastBlocks, setLastBlocks] = useState<string[]>([]);
  const [lastPlate, setLastPlate] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api.get<Dash>("/api/v1/patio/coordinador/dashboard");
      setDash(d);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Conexión fallida");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const blocked = useMemo(
    () =>
      (dash?.talanquera || []).filter((t) => t.denied || !t.gateOpened).length,
    [dash],
  );
  const granted = useMemo(
    () => (dash?.talanquera || []).filter((t) => t.gateOpened).length,
    [dash],
  );

  function openPanel(mode: "ingreso" | "salida", prefillPlate?: string) {
    setPanel(mode);
    setPlate(prefillPlate?.toUpperCase() ?? "");
    setMsg(null);
    setError(null);
    setLastBlocks([]);
  }

  async function assignLifo(forPlate: string) {
    const when =
      departAt.trim() ||
      new Date(Date.now() + 2 * 3600_000).toISOString();
    try {
      const res = await api.post<{ message: string; bayCode?: string }>(
        "/api/v1/patio/parqueo/lifo",
        {
          plate: forPlate,
          scheduledDepartAt: when,
        },
      );
      setMsg(res.message || `Bahía LIFO asignada a ${forPlate}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo asignar bahía");
    }
  }

  async function submitGate() {
    if (!plate.trim()) return;
    setBusy(true);
    setMsg(null);
    setError(null);
    setLastBlocks([]);
    setLastPlate(plate.trim().toUpperCase());
    try {
      if (panel === "ingreso") {
        const res = await api.post<GateResult>("/api/v1/patio/access-log", {
          kind: "CHECK_IN",
          plate: plate.trim().toUpperCase(),
          guardName: guardName.trim() || undefined,
          odometerKm: odometerKm ? Number(odometerKm) : undefined,
          scheduledDepartAt: departAt.trim()
            ? new Date(departAt).toISOString()
            : undefined,
        });
        setMsg(
          res.message ||
            `Ingreso OK · ${res.plate || plate} — talanquera abierta y bahía LIFO.`,
        );
        setPanel("none");
        setPlate("");
        await load();
      } else {
        const res = await api.post<GateResult>(
          "/api/v1/patio/talanquera/lpr-check",
          { plate: plate.trim().toUpperCase() },
        );
        setMsg(
          `${res.message || "Talanquera abierta"}${
            res.trip?.code ? ` · Viaje ${res.trip.code}` : ""
          }`,
        );
        setLastBlocks([]);
        setPanel("none");
        setPlate("");
        await load();
      }
    } catch (e) {
      const blocks = extractBlocks(e);
      setLastBlocks(blocks);
      const readable =
        blocks.length > 0
          ? blocks.map(blockLabel).join(" · ")
          : e instanceof Error
            ? e.message
            : "Bloqueo de talanquera";
      setError(readable);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function checkoutUnit(unitPlate: string) {
    openPanel("salida", unitPlate);
  }

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <PageIntro module="parqueadero" title="Patio inteligente" />
          <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">
            Flujo operativo: <strong>1)</strong> registrar ingreso → bahía LIFO ·{" "}
            <strong>2)</strong> validar salida LPR (viaje + docs + alcoholimetría).
            Si hay hard-stop, el ledger muestra el motivo accionable.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            className="w-auto px-4 py-2"
            onClick={() => openPanel("ingreso")}
          >
            <LogIn className="mr-1.5 h-4 w-4" />
            Registrar ingreso
          </Button>
          <Button
            type="button"
            variant="primary"
            className="w-auto px-4 py-2"
            onClick={() => openPanel("salida")}
          >
            <LogOut className="mr-1.5 h-4 w-4" />
            Validar salida LPR
          </Button>
        </div>
      </header>

      {error ? (
        <div
          role="alert"
          className="space-y-3 rounded-lg border border-[var(--accent-alert)]/40 bg-[color-mix(in_srgb,var(--accent-alert)_10%,transparent)] px-4 py-3"
        >
          <p className="font-mono text-sm text-[var(--accent-alert)]">{error}</p>
          {lastBlocks.length > 0 ? (
            <ul className="space-y-1 text-sm text-[var(--text-primary)]">
              {lastBlocks.map((b) => (
                <li key={b} className="flex items-start gap-2">
                  <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--accent-alert)]" />
                  <span>{blockLabel(b)}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {lastBlocks.some((b) =>
              /NO_ACTIVE_TRIP|TRIP/i.test(b),
            ) ? (
              <Link
                href="/logistica"
                className="rounded-md border border-[var(--border-subtle)] px-3 py-1.5 text-xs hover:bg-[var(--bg-canvas)]"
              >
                Ir a Despacho / Logística
              </Link>
            ) : null}
            {lastBlocks.some((b) =>
              /DOC|COMPLIANCE|JURIDICO|SOAT/i.test(b),
            ) ? (
              <Link
                href="/tramites"
                className="rounded-md border border-[var(--border-subtle)] px-3 py-1.5 text-xs hover:bg-[var(--bg-canvas)]"
              >
                Ir a Trámites / docs
              </Link>
            ) : null}
            {lastBlocks.some((b) => /MAINTENANCE|TALLER/i.test(b)) ? (
              <Link
                href="/taller/coordinador/dashboard"
                className="rounded-md border border-[var(--border-subtle)] px-3 py-1.5 text-xs hover:bg-[var(--bg-canvas)]"
              >
                <Wrench className="mr-1 inline h-3.5 w-3.5" />
                Abrir Taller
              </Link>
            ) : null}
            {lastPlate ? (
              <Button
                type="button"
                variant="ghost"
                className="w-auto px-3 py-1 text-xs"
                onClick={() => openPanel("ingreso", lastPlate)}
              >
                Registrar ingreso de {lastPlate}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {msg ? (
        <p className="rounded-lg border border-[var(--accent-primary)]/30 bg-[color-mix(in_srgb,var(--accent-primary)_8%,transparent)] px-4 py-3 text-sm">
          <CheckCircle2 className="mr-1.5 inline h-4 w-4 text-[var(--accent-primary)]" />
          {msg}
        </p>
      ) : null}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Unidades en patio"
          value={dash?.inventory.count ?? "—"}
          delta="Inventario LIFO"
          tone="ok"
          icon={<ParkingSquare />}
        />
        <KpiCard
          label="Salidas / ingresos OK"
          value={granted}
          delta="Talanquera abierta"
          tone="ok"
          icon={<LogIn />}
        />
        <KpiCard
          label="Talanquera bloqueada"
          value={blocked}
          delta="Hard-stop documental / despacho"
          tone={blocked > 0 ? "danger" : "ok"}
          icon={<Ban />}
        />
        <KpiCard
          label="Cola lavado"
          value={dash?.washQueue.length ?? 0}
          delta="Prioridad operativa"
          tone={(dash?.washQueue.length ?? 0) > 3 ? "warn" : "neutral"}
          icon={<Droplets />}
        />
      </section>

      {/* Unidades en patio — acción real */}
      <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg text-[var(--text-primary)]">
            Unidades en patio
          </h2>
          <Button
            type="button"
            variant="secondary"
            className="w-auto px-3 py-2"
            onClick={() => openPanel("ingreso")}
          >
            + Ingreso
          </Button>
        </div>
        {(dash?.inventory.inYard ?? []).length === 0 ? (
          <EmptyState
            icon={<ParkingSquare className="h-7 w-7" aria-hidden />}
            title="Patio vacío"
            description="Registre el ingreso LPR/manual para ocupar bahías y alimentar el mapa."
            actionLabel="Registrar ingreso"
            onAction={() => openPanel("ingreso")}
          />
        ) : (
          <ul className="space-y-2">
            {(dash?.inventory.inYard ?? []).map((u) => (
              <li
                key={u.parkingLogId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] px-3 py-2"
              >
                <div>
                  <p className="font-mono text-base tabular-nums text-[var(--text-primary)]">
                    {u.plate}
                  </p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Desde{" "}
                    {new Date(u.checkedInAt).toLocaleString("es-CO")}
                    {u.driver?.name ? ` · ${u.driver.name}` : ""}
                    {u.vehicle?.complianceBlocked
                      ? " · docs en alerta"
                      : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-auto px-3 py-1 text-xs"
                    onClick={() => void assignLifo(u.plate)}
                  >
                    <MapPin className="mr-1 h-3.5 w-3.5" />
                    Bahía LIFO
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    className="w-auto px-3 py-1 text-xs"
                    onClick={() => void checkoutUnit(u.plate)}
                  >
                    Validar salida
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        id="talanquera"
        className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] p-5"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-display text-lg text-[var(--text-primary)]">
            Ledger talanquera
          </h2>
          <StatusPulseBadge
            tone={blocked > 0 ? "danger" : "active"}
            pulse={blocked > 0}
          >
            {blocked > 0 ? "ALERTA" : "NOMINAL"}
          </StatusPulseBadge>
        </div>
        {(dash?.talanquera || []).length === 0 ? (
          <EmptyState
            icon={<ShieldAlert className="h-7 w-7" aria-hidden />}
            title="Sin eventos LPR"
            description="Cada ingreso o intento de salida queda registrado aquí con el motivo."
            actionLabel="Validar salida LPR"
            onAction={() => openPanel("salida")}
          />
        ) : (
          <ul className="space-y-2">
            {(dash?.talanquera || []).map((t) => (
              <li
                key={t.id}
                className="rounded-lg border border-[var(--border-subtle)] px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono tabular-nums">{t.plate}</span>
                  <Badge tone={t.gateOpened ? "emerald" : "rose"}>
                    {t.gateOpened
                      ? t.kind === "CHECK_IN"
                        ? "INGRESO OK"
                        : "SALIDA OK"
                      : "BLOQUEO"}
                  </Badge>
                </div>
                {!t.gateOpened && (t.blocks?.length || t.denyReason) ? (
                  <ul className="mt-2 space-y-0.5 text-xs text-[var(--accent-alert)]">
                    {(t.blocks?.length
                      ? t.blocks
                      : [t.denyReason || "BLOQUEO"]
                    ).map((b) => (
                      <li key={`${t.id}-${b}`}>· {blockLabel(String(b))}</li>
                    ))}
                  </ul>
                ) : null}
                {t.tripCode ? (
                  <p className="mt-1 font-mono text-[11px] text-[var(--text-secondary)]">
                    Viaje {t.tripCode}
                  </p>
                ) : null}
                {t.createdAt ? (
                  <p className="mt-0.5 font-mono text-[10px] text-[var(--text-secondary)]">
                    {new Date(t.createdAt).toLocaleString("es-CO")}
                  </p>
                ) : null}
                {!t.gateOpened ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="mt-2 w-auto px-2 py-1 text-xs"
                    onClick={() => openPanel("salida", t.plate)}
                  >
                    Reintentar salida
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] p-5">
        <h2 className="mb-4 font-display text-lg text-[var(--text-primary)]">
          Yard Map · LIFO
        </h2>
        {(dash?.yardMap || []).filter((s) => s.status === "OCCUPIED" || s.plate)
          .length === 0 ? (
          <EmptyState
            icon={<ParkingSquare className="h-7 w-7" aria-hidden />}
            title="Sin bahías ocupadas"
            description="Tras un ingreso, use «Bahía LIFO» en la unidad para ubicarla por hora de salida."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(dash?.yardMap || [])
              .filter((s) => s.plate || s.status === "OCCUPIED")
              .map((s) => (
                <div
                  key={s.id}
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm text-[var(--accent-primary)]">
                      {s.laneCode}/{s.bayCode}
                    </span>
                    <Badge
                      tone={s.status === "OCCUPIED" ? "amber" : "neutral"}
                    >
                      {statusEs(s.status)}
                    </Badge>
                  </div>
                  <p className="mt-2 font-mono text-lg text-[var(--text-primary)]">
                    {s.plate || "—"}
                  </p>
                  {s.scheduledDepartAt ? (
                    <p className="mt-1 font-mono text-xs text-[var(--text-secondary)]">
                      Salida{" "}
                      {new Date(s.scheduledDepartAt).toLocaleString("es-CO")}
                    </p>
                  ) : null}
                </div>
              ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] p-5">
        <h2 className="mb-3 font-display text-lg">Cola de lavado</h2>
        {(dash?.washQueue || []).length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">
            Sin unidades en cola de lavado.
          </p>
        ) : (
          <ul className="space-y-2">
            {(dash?.washQueue || []).map((w) => (
              <li
                key={w.id}
                className="flex justify-between rounded-lg border border-[var(--border-subtle)] px-3 py-2 font-mono text-sm"
              >
                <span>{w.plate}</span>
                <span className="text-[var(--text-secondary)]">
                  P{w.priority} · {statusEs(w.status)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <SlideOver
        open={panel !== "none"}
        onClose={() => setPanel("none")}
        title={
          panel === "ingreso" ? "Registrar ingreso" : "Validar salida LPR"
        }
        description={
          panel === "ingreso"
            ? "CHECK_IN: abre talanquera, crea parking log y permite asignar bahía LIFO."
            : "CHECK_OUT LPR: exige viaje activo, docs jurídicos y alcoholimetría vigente."
        }
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              className="w-auto px-4 py-2"
              onClick={() => setPanel("none")}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="primary"
              className="w-auto px-4 py-2"
              loading={busy}
              disabled={busy || !plate.trim()}
              onClick={() => void submitGate()}
            >
              {panel === "ingreso" ? "Confirmar ingreso" : "Validar y abrir"}
            </Button>
          </>
        }
      >
        <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-[var(--text-secondary)]">
          Placa
          <input
            className="field font-mono"
            value={plate}
            onChange={(e) => setPlate(e.target.value.toUpperCase())}
            placeholder="GAA125"
            autoFocus
          />
        </label>
        {panel === "ingreso" ? (
          <>
            <label className="mt-3 flex flex-col gap-1 text-xs uppercase text-[var(--text-secondary)]">
              Guardia / auxiliar
              <input
                className="field"
                value={guardName}
                onChange={(e) => setGuardName(e.target.value)}
                placeholder="Nombre en portería"
              />
            </label>
            <label className="mt-3 flex flex-col gap-1 text-xs uppercase text-[var(--text-secondary)]">
              Odómetro (km)
              <input
                className="field font-mono"
                inputMode="numeric"
                value={odometerKm}
                onChange={(e) =>
                  setOdometerKm(e.target.value.replace(/\D/g, ""))
                }
              />
            </label>
            <label className="mt-3 flex flex-col gap-1 text-xs uppercase text-[var(--text-secondary)]">
              Salida programada (LIFO)
              <input
                className="field font-mono"
                type="datetime-local"
                value={departAt}
                onChange={(e) => setDepartAt(e.target.value)}
              />
            </label>
          </>
        ) : (
          <p className="mt-3 text-xs text-[var(--text-secondary)]">
            Controles: viaje en logística (±4 h), compliance documental y
            alcoholimetría. Si falla alguno, la barrera no abre y el motivo
            queda en el ledger.
          </p>
        )}
      </SlideOver>
    </div>
  );
}
