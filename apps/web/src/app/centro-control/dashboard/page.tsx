"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { Radio, ShieldAlert, Phone } from "lucide-react";
import { api } from "@/lib/api";
import { EmptyState, Modal, StatusPulseBadge } from "@/components/audit";
import { BentoPanel } from "@/components/nexa/bento-panel";
import { NexaTable, NexaRow, NexaCell } from "@/components/nexa/nexa-table";
import { PermissionGuard } from "@/components/auth/PermissionGuard";

type Anomaly = {
  kind: "DESVIO" | "SOS" | "FATIGA";
  id: string;
  plate: string | null;
  label: string;
  severity: "HIGH" | "CRITICAL" | "WARN";
  at: string;
};

type SosSession = {
  id: string;
  code: string;
  plate: string | null;
  vehicleId: string | null;
  defconLevel: number;
  engineShutdownAuthorized: boolean;
  ambientListen: boolean;
  cabinStream: boolean;
  status: string;
};

type VoipEntry = {
  driverId: string;
  name: string;
  phone: string | null;
  fatigueScore: number;
  zone: string;
};

type Dash = {
  anomalies: Anomaly[];
  sosActive: SosSession[];
  voipDirectory: VoipEntry[];
  ui: { theme: string; defcon: number; warRoom: boolean };
  rules: {
    fatigueYellowMin: number;
    fatigueYellowMax: number;
    stopInstructionKm: number;
  };
};

function severityTone(
  s: Anomaly["severity"],
): "danger" | "fatiga" | "neutral" {
  if (s === "CRITICAL") return "danger";
  if (s === "HIGH") return "fatiga";
  return "neutral";
}

export default function CentroControlDashboardPage() {
  const [dash, setDash] = useState<Dash | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedSos, setSelectedSos] = useState<string>("");
  const [pipOpen, setPipOpen] = useState(false);
  const [tipPlate, setTipPlate] = useState("");
  const [resolveOpen, setResolveOpen] = useState(false);
  const [resolveNotes, setResolveNotes] = useState("");

  const warRoom = (dash?.ui.warRoom || dash?.ui.defcon === 1) ?? false;
  const hasActiveSos = (dash?.sosActive?.length ?? 0) > 0;

  const load = useCallback(async () => {
    setError(null);
    try {
      const d = await api<Dash>("/api/v1/centro-control/dashboard");
      setDash(d);
      if (!selectedSos && d.sosActive[0]?.id) {
        setSelectedSos(d.sosActive[0].id);
      }
    } catch (e) {
      setError((e as Error).message || "Señal perdida — reintentando conexión");
    }
  }, [selectedSos]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 10_000);
    return () => clearInterval(t);
  }, [load]);

  async function tipificarDesvio() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await api<{ message: string }>(
        "/api/v1/centro-control/desvio-geocerca/tipificar",
        {
          method: "POST",
          body: JSON.stringify({
            plate: tipPlate || undefined,
            tipificacion: "DESVIO_TUBO",
            notes: "Salida de tubo virtual — tipificación de torre de control",
            initiateVoip: true,
            sendSmsToCustomer: true,
          }),
        },
      );
      setMsg(res.message);
      setTipPlate("");
      await load();
    } catch (e) {
      setError((e as Error).message || "No se pudo tipificar desvío");
    } finally {
      setBusy(false);
    }
  }

  async function activarSos() {
    if (hasActiveSos) {
      setError(
        "Ya hay un SOS activo. Resuelva la alerta actual antes de activar otra.",
      );
      return;
    }
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const res = await api<{ message: string; session: SosSession }>(
        "/api/v1/centro-control/sos/activar-protocolo",
        {
          method: "POST",
          body: JSON.stringify({
            plate: tipPlate || undefined,
            contactPolice: true,
            notifyDirector: true,
            authorizeEngineShutdown: true,
            enableAmbientListen: true,
            enableCabinStream: true,
            notes: "Activación de sala de crisis desde consola",
          }),
        },
      );
      setMsg(res.message);
      setSelectedSos(res.session.id);
      setPipOpen(true);
      await load();
    } catch (e) {
      setError((e as Error).message || "No se pudo activar SOS");
    } finally {
      setBusy(false);
    }
  }

  async function resolverSos() {
    const id = selectedSos || dash?.sosActive[0]?.id;
    if (!id) {
      setError("Seleccione la sesión SOS a resolver");
      return;
    }
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const res = await api<{ message: string }>(
        "/api/v1/centro-control/sos/resolver",
        {
          method: "POST",
          body: JSON.stringify({
            sosSessionId: id,
            resolutionNotes:
              resolveNotes.trim() || "Alerta resuelta desde torre de control",
          }),
        },
      );
      setMsg(res.message);
      setResolveOpen(false);
      setResolveNotes("");
      setSelectedSos("");
      setPipOpen(false);
      await load();
    } catch (e) {
      setError((e as Error).message || "No se pudo resolver el SOS");
    } finally {
      setBusy(false);
    }
  }

  async function apagadoRemoto() {
    if (!selectedSos) {
      setError("Seleccione sesión SOS activa");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const sos = dash?.sosActive.find((s) => s.id === selectedSos);
      const res = await api<{ message: string }>(
        "/api/v1/centro-control/iot/apagado-remoto",
        {
          method: "POST",
          body: JSON.stringify({
            sosSessionId: selectedSos,
            vehicleId: sos?.vehicleId || undefined,
            plate: sos?.plate || undefined,
            confirmProtocol: true,
            reason: "Protocolo de emergencia confirmado — alerta máxima",
          }),
        },
      );
      setMsg(res.message);
      await load();
    } catch (e) {
      setError((e as Error).message || "Apagado remoto denegado");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`fade-in relative mx-auto min-h-[100dvh] max-w-[1400px] space-y-4 ${
        warRoom ? "bg-brand-canvas text-brand-text-primary" : "bg-brand-canvas"
      }`}
    >
      {warRoom ? (
        <div className="pointer-events-none fixed inset-0 z-0 animate-pulse bg-brand-danger/10" />
      ) : null}

      <header className="relative z-10 flex flex-wrap items-start justify-between gap-3 border-b border-brand-border pb-4">
        <div>
          <p className="font-data text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-primary">
            Torre de control 24/7
          </p>
          <h1 className="font-sans text-2xl font-semibold tracking-tight text-brand-text-primary md:text-3xl">
            Monitoreo por excepción
          </h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge tone={warRoom ? "danger" : "success"}>
              {warRoom ? "Alerta máxima · Sala de crisis" : "Nominal"}
            </Badge>
            <Badge tone="warning">
              {(dash?.anomalies ?? []).length} excepciones
            </Badge>
          </div>
        </div>
        <StatusPulseBadge tone={warRoom ? "danger" : "active"} pulse={warRoom}>
          Video wall · uplink {warRoom ? "crítico" : "nominal"}
        </StatusPulseBadge>
      </header>

      {error ? (
        <p className="relative z-10 rounded-lg border border-brand-danger/40 bg-brand-danger/10 px-4 py-3 font-data text-sm text-brand-danger">
          {error}
        </p>
      ) : null}
      {msg ? (
        <p className="relative z-10 rounded-lg border border-brand-success/40 bg-brand-success/10 px-4 py-3 font-data text-sm text-brand-success">
          {msg}
        </p>
      ) : null}

      <div className="relative z-10 grid grid-cols-1 gap-3 lg:grid-cols-12 lg:gap-4">
        <BentoPanel
          id="anomalias"
          title="Pantalla de excepciones"
          subtitle="Solo unidades fuera de nominal"
          icon={<ShieldAlert />}
          className="lg:col-span-8"
        >
          {(dash?.anomalies ?? []).length === 0 ? (
            <EmptyState
              title="Flota nominal"
              description="Sin excepciones en la red — telemetría dentro de parámetros."
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(dash?.anomalies ?? []).map((a) => (
                <article
                  key={`${a.kind}-${a.id}`}
                  className={`rounded-lg border px-3 py-3 transition-colors hover:border-brand-border-active ${
                    a.severity === "CRITICAL"
                      ? "border-brand-danger/40 bg-brand-danger/10"
                      : a.severity === "HIGH"
                        ? "border-brand-warning/30 bg-brand-warning/10"
                        : "border-brand-border bg-brand-canvas"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-data text-lg tabular-nums text-brand-text-primary">
                      {a.plate || "SIN-PLACA"}
                    </p>
                    <StatusPulseBadge tone={severityTone(a.severity)}>
                      {a.kind}
                    </StatusPulseBadge>
                  </div>
                  <p className="mt-1 font-sans text-sm text-brand-text-primary">
                    {a.label}
                  </p>
                  <p className="mt-1 font-data text-[10px] tabular-nums text-brand-text-secondary">
                    {new Date(a.at).toLocaleTimeString("es-CO")}
                  </p>
                </article>
              ))}
            </div>
          )}
        </BentoPanel>

        <BentoPanel
          title="Consola VoIP"
          subtitle="Marcación rápida · fatiga"
          icon={<Phone />}
          className="lg:col-span-4"
        >
          {(dash?.voipDirectory ?? []).length === 0 ? (
            <p className="font-sans text-sm text-brand-text-secondary">
              Sin conductores en zona de atención
            </p>
          ) : (
            <NexaTable columns={["Conductor", "Fatiga", "Acción"]}>
              {(dash?.voipDirectory ?? []).map((d) => (
                <NexaRow key={d.driverId}>
                  <NexaCell>{d.name}</NexaCell>
                  <NexaCell mono>
                    {d.fatigueScore}
                    {d.zone === "YELLOW" ? " · AMARILLA" : ""}
                  </NexaCell>
                  <NexaCell>
                    {d.phone ? (
                      <a
                        href={`tel:${d.phone}`}
                        className="font-data text-[10px] font-semibold uppercase tracking-wider text-brand-success hover:underline"
                      >
                        CALL
                      </a>
                    ) : (
                      "—"
                    )}
                  </NexaCell>
                </NexaRow>
              ))}
            </NexaTable>
          )}
        </BentoPanel>

        <BentoPanel
          id="warroom"
          title="Desvío de geocerca"
          subtitle="Tipificar · llamada · SMS cliente"
          className="lg:col-span-6"
        >
          <input
            className="field w-full font-data uppercase"
            placeholder="Placa (opcional)"
            value={tipPlate}
            onChange={(e) => setTipPlate(e.target.value.toUpperCase())}
          />
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="primary"
              className="w-auto px-4 py-2"
              disabled={busy}
              onClick={() => void tipificarDesvio()}
            >
              Tipificar + llamada/SMS
            </Button>
            <PermissionGuard capability="watchtower_sos:CREATE">
              <Button
                type="button"
                variant="secondary"
                className="w-auto px-4 py-2 !bg-brand-danger !text-white"
                disabled={busy || hasActiveSos}
                title={
                  hasActiveSos
                    ? "Ya hay un SOS activo — resuélvalo primero"
                    : undefined
                }
                onClick={() => void activarSos()}
              >
                {hasActiveSos ? "SOS ya activo" : "Activar SOS"}
              </Button>
            </PermissionGuard>
            <PermissionGuard capability="watchtower_sos:UPDATE">
              {hasActiveSos ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="w-auto px-4 py-2"
                  disabled={busy}
                  onClick={() => setResolveOpen(true)}
                >
                  Desactivar SOS / Resolver alerta
                </Button>
              ) : null}
            </PermissionGuard>
          </div>
        </BentoPanel>

        <BentoPanel
          title="IoT · Apagado remoto"
          subtitle="SOS ACTIVE + protocolo confirmado"
          icon={<Radio />}
          className="lg:col-span-6 border-brand-danger/30"
        >
          <select
            className="field w-full font-data"
            value={selectedSos}
            onChange={(e) => setSelectedSos(e.target.value)}
          >
            <option value="">Sesión SOS…</option>
            {(dash?.sosActive ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} · {s.plate || "—"} · Alerta {s.defconLevel}
              </option>
            ))}
          </select>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="primary"
              className="w-auto px-4 py-2"
              disabled={busy || !selectedSos}
              onClick={() => void apagadoRemoto()}
            >
              Transmitir apagado de motor
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="w-auto px-4 py-2"
              onClick={() => setPipOpen((v) => !v)}
            >
              {pipOpen ? "Cerrar cabina" : "Ventana cabina"}
            </Button>
          </div>
        </BentoPanel>
      </div>

      {pipOpen ? (
        <div className="fixed bottom-4 right-4 z-50 w-[280px] overflow-hidden rounded-xl border border-brand-danger/50 bg-brand-surface shadow-2xl sm:w-[360px]">
          <div className="flex items-center justify-between border-b border-brand-border px-3 py-2">
            <p className="font-data text-xs text-brand-danger">CABINA EN VIVO</p>
            <button
              type="button"
              className="font-data text-xs text-brand-text-secondary"
              onClick={() => setPipOpen(false)}
            >
              Cerrar
            </button>
          </div>
          <div className="relative flex h-44 items-center justify-center bg-brand-canvas">
            <div className="absolute left-2 top-2 h-2 w-2 animate-pulse rounded-full bg-brand-danger" />
            <p className="font-data text-xs text-brand-text-secondary">
              Stream IP · escucha ambiental
              {warRoom ? " · Alerta máxima" : ""}
            </p>
          </div>
        </div>
      ) : null}

      <Modal
        open={resolveOpen}
        onClose={() => !busy && setResolveOpen(false)}
        title="Desactivar SOS / Resolver alerta"
        description="Confirme que la emergencia quedó atendida. La sesión saldrá de la lista activa."
      >
        <div className="space-y-4">
          <p className="font-sans text-sm text-brand-text-secondary">
            Sesión:{" "}
            <span className="font-data text-brand-text-primary">
              {dash?.sosActive.find((s) => s.id === selectedSos)?.code ||
                dash?.sosActive[0]?.code ||
                "—"}
            </span>
          </p>
          <label className="block space-y-1.5">
            <span className="font-data text-[10px] font-semibold uppercase tracking-wider text-brand-text-secondary">
              Nota de resolución
            </span>
            <textarea
              className="field min-h-[88px] w-full"
              value={resolveNotes}
              onChange={(e) => setResolveNotes(e.target.value)}
              placeholder="Ej. Unidad contactada · situación controlada"
            />
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              className="w-auto px-4 py-2"
              disabled={busy}
              onClick={() => setResolveOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="primary"
              className="w-auto px-4 py-2"
              disabled={busy}
              onClick={() => void resolverSos()}
            >
              Confirmar resolución
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
