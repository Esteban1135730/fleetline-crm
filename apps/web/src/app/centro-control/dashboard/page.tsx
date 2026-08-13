"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { api } from "@/lib/api";
import { HowToBox, PageIntro } from "@/components/page-intro";

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

const SEV_CLASS: Record<Anomaly["severity"], string> = {
  CRITICAL: "border-[#FF2A5F] bg-[#FF2A5F]/20 text-[#F8FAFC]",
  HIGH: "border-[#FFB800]/60 bg-[#FFB800]/10 text-[#F8FAFC]",
  WARN: "border-white/20 bg-white/5 text-[#F8FAFC]",
};

export default function CentroControlDashboardPage() {
  const [dash, setDash] = useState<Dash | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedSos, setSelectedSos] = useState<string>("");
  const [pipOpen, setPipOpen] = useState(false);
  const [tipPlate, setTipPlate] = useState("");

  const warRoom = (dash?.ui.warRoom || dash?.ui.defcon === 1) ?? false;

  const load = useCallback(async () => {
    setError(null);
    try {
      const d = await api<Dash>("/api/v1/centro-control/dashboard");
      setDash(d);
      if (!selectedSos && d.sosActive[0]?.id) {
        setSelectedSos(d.sosActive[0].id);
      }
    } catch (e) {
      setError((e as Error).message || "Señal perdida — reintentando uplink");
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
            notes: "Salida de tubo virtual — tipificación Watchtower",
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
    setBusy(true);
    setMsg(null);
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
            notes: "Activación War Room desde consola",
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
            reason: "Protocolo emergencia confirmado — DEFCON 1",
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
      className={`fade-in relative mx-auto min-h-[100dvh] max-w-[1400px] space-y-4 p-3 md:p-6 ${
        warRoom
          ? "bg-[#1a0508] text-[#F8FAFC]"
          : "bg-[#000000] text-[#F8FAFC]"
      }`}
    >
      {warRoom ? (
        <div className="pointer-events-none fixed inset-0 z-0 animate-pulse bg-[#FF2A5F]/10" />
      ) : null}

      <div className="relative z-10 rounded-xl border border-white/10 bg-[#0A0D14]/95 p-4">
        <PageIntro module="logistica" title="Watchtower 24/7" />
        <p className="mt-1 text-sm text-[#94A3B8]">
          Video wall · monitoreo por excepción · solo anomalías
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge tone={warRoom ? "rose" : "emerald"}>
            {warRoom ? "DEFCON 1 · War Room" : "Nominal"}
          </Badge>
          <Badge tone="amber">
            {(dash?.anomalies ?? []).length} excepciones
          </Badge>
        </div>
      </div>

      <div className="relative z-10">
        <HowToBox
          steps={[
            "Solo emergen unidades con anomalía (desvío, SOS, fatiga).",
            "Desvío: tipificar → VoIP conductor + SMS cliente.",
            "SOS: Modo Rojo · checklist · apagado IoT solo con protocolo confirmado.",
          ]}
        />
      </div>

      {error ? (
        <p className="relative z-10 rounded-xl border border-[#FF2A5F]/50 bg-[#FF2A5F]/15 px-4 py-3 text-sm">
          {error}
        </p>
      ) : null}
      {msg ? (
        <p className="relative z-10 rounded-xl border border-[#10B981]/40 bg-[#10B981]/10 px-4 py-3 text-sm">
          {msg}
        </p>
      ) : null}

      {/* Video wall — anomalías */}
      <section
        id="anomalias"
        className="relative z-10 rounded-xl border border-white/10 bg-[#05070c] p-4"
      >
        <h3 className="font-display text-xl">Video Wall · Excepciones</h3>
        <p className="text-sm text-[#64748B]">
          Fondo negro — solo unidades fuera de nominal
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(dash?.anomalies ?? []).length === 0 ? (
            <p className="col-span-full py-16 text-center font-mono text-sm text-[#334155]">
              Flota nominal — sin excepciones en uplink
            </p>
          ) : (
            (dash?.anomalies ?? []).map((a) => (
              <article
                key={`${a.kind}-${a.id}`}
                className={`rounded-lg border p-4 ${SEV_CLASS[a.severity]}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-lg text-[#10B981]">
                    {a.plate || "SIN-PLACA"}
                  </p>
                  <Badge
                    tone={
                      a.severity === "CRITICAL"
                        ? "rose"
                        : a.severity === "HIGH"
                          ? "amber"
                          : "slate"
                    }
                  >
                    {a.kind}
                  </Badge>
                </div>
                <p className="mt-2 text-sm">{a.label}</p>
                <p className="mt-1 font-mono text-xs text-[#94A3B8]">
                  {new Date(a.at).toLocaleTimeString("es-CO")}
                </p>
              </article>
            ))
          )}
        </div>
      </section>

      {/* Acciones desvío / SOS */}
      <section
        id="warroom"
        className="relative z-10 grid grid-cols-1 gap-3 lg:grid-cols-2"
      >
        <div className="rounded-xl border border-white/10 bg-[#0A0D14] p-4">
          <h3 className="font-display text-lg">Desvío de geocerca</h3>
          <input
            className="field mt-3 min-h-[48px] w-full !bg-black !text-white"
            placeholder="Placa (opcional)"
            value={tipPlate}
            onChange={(e) => setTipPlate(e.target.value.toUpperCase())}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="primary"
              disabled={busy}
              onClick={() => void tipificarDesvio()}
            >
              Tipificar + VoIP/SMS
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="!bg-[#FF2A5F] !text-white"
              disabled={busy}
              onClick={() => void activarSos()}
            >
              Activar SOS / War Room
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-[#FF2A5F]/40 bg-[#12060a] p-4">
          <h3 className="font-display text-lg text-[#FF2A5F]">
            IoT · Apagado remoto
          </h3>
          <p className="text-sm text-[#94A3B8]">
            Requiere SOS ACTIVE + confirmación de protocolo
          </p>
          <select
            className="field mt-3 min-h-[48px] w-full !bg-black !text-white"
            value={selectedSos}
            onChange={(e) => setSelectedSos(e.target.value)}
          >
            <option value="">Sesión SOS…</option>
            {(dash?.sosActive ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} · {s.plate || "—"} · DEFCON {s.defconLevel}
              </option>
            ))}
          </select>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="primary"
              disabled={busy || !selectedSos}
              onClick={() => void apagadoRemoto()}
            >
              Transmitir ENGINE_SHUTDOWN
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPipOpen((v) => !v)}
            >
              {pipOpen ? "Cerrar PIP" : "PIP Cabina"}
            </Button>
          </div>
        </div>
      </section>

      {/* Consola VoIP */}
      <section
        id="voip"
        className="relative z-10 rounded-xl border border-white/10 bg-[#0A0D14] p-4"
      >
        <h3 className="font-display text-lg">Consola VoIP · Marcación rápida</h3>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(dash?.voipDirectory ?? []).map((d) => (
            <a
              key={d.driverId}
              href={d.phone ? `tel:${d.phone}` : undefined}
              className="flex items-center justify-between rounded-lg border border-white/10 bg-black/60 px-3 py-3 hover:border-[#10B981]/50"
            >
              <div>
                <p className="text-sm font-medium">{d.name}</p>
                <p className="font-mono text-xs text-[#94A3B8]">
                  Fatiga {d.fatigueScore}
                  {d.zone === "YELLOW" ? " · AMARILLA" : ""}
                </p>
              </div>
              <span className="rounded bg-[#10B981]/20 px-2 py-1 font-mono text-xs text-[#10B981]">
                CALL
              </span>
            </a>
          ))}
          {(dash?.voipDirectory ?? []).length === 0 ? (
            <p className="text-sm text-[#64748B]">
              Sin conductores en zona de atención
            </p>
          ) : null}
        </div>
      </section>

      {/* PIP flotante */}
      {pipOpen ? (
        <div className="fixed bottom-4 right-4 z-50 w-[280px] overflow-hidden rounded-xl border border-[#FF2A5F]/50 bg-[#0A0D14] shadow-2xl sm:w-[360px]">
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
            <p className="font-mono text-xs text-[#FF2A5F]">PIP · CABINA LIVE</p>
            <button
              type="button"
              className="text-xs text-[#94A3B8]"
              onClick={() => setPipOpen(false)}
            >
              Cerrar
            </button>
          </div>
          <div className="relative flex h-44 items-center justify-center bg-[radial-gradient(circle_at_center,#1a0a0e,#000)]">
            <div className="absolute left-2 top-2 h-2 w-2 animate-pulse rounded-full bg-[#FF2A5F]" />
            <p className="font-mono text-xs text-[#64748B]">
              Stream IP · escucha ambiental
              {warRoom ? " · DEFCON 1" : ""}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
