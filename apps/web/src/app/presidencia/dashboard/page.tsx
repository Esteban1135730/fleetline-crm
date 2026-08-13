"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { api } from "@/lib/api";
import { HowToBox, PageIntro } from "@/components/page-intro";

type Pillars = {
  liquidity: { label: string; valueCop: number; hint: string };
  sla: { label: string; valuePct: number; hint: string };
  legalPesv: { label: string; level: string; blockedUnits: number; hint: string };
  nps: { label: string; value: number; samples: number; hint: string };
};

type Dash = {
  canvas: string;
  pillars: Pillars;
  revenueHeat: Array<{
    corridor: string;
    revenue: number;
    trips: number;
    heat: number;
  }>;
  killSwitch?: { blockedPct: number; blockedUnits: number };
  cashFlow?: { atRiskAmount: number };
};

function cop(n: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function PresidenciaDashboardPage() {
  const [dash, setDash] = useState<Dash | null>(null);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [utterance, setUtterance] = useState(
    "Briefing: estatus operativo, saldo en bancos y flota bloqueada",
  );
  const [jarvisOut, setJarvisOut] = useState<string | null>(null);
  const [capexOut, setCapexOut] = useState<string | null>(null);
  const [defconOut, setDefconOut] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [units, setUnits] = useState(5);
  const [unitCost, setUnitCost] = useState(280_000_000);
  const [zones, setZones] = useState("Sur Bogotá, Soacha");
  const [defconActive, setDefconActive] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setDash(await api<Dash>("/api/v1/presidencia/dashboard"));
    } catch (e) {
      setError((e as Error).message || "Señal perdida — uplink Founder's Canvas");
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 25_000);
    return () => clearInterval(t);
  }, [load]);

  async function askJarvis() {
    setBusy(true);
    setListening(true);
    setJarvisOut(null);
    try {
      const res = await api<{ spokenSummary: string; message: string }>(
        "/api/v1/presidencia/jarvis/voice-query",
        {
          method: "POST",
          body: JSON.stringify({
            utterance,
            alertDirectors: true,
          }),
        },
      );
      setJarvisOut(res.spokenSummary || res.message);
    } catch (e) {
      setError((e as Error).message || "Jarvis sin uplink");
    } finally {
      setBusy(false);
      setTimeout(() => setListening(false), 1200);
    }
  }

  async function simularCapex() {
    setBusy(true);
    setCapexOut(null);
    try {
      const res = await api<{ message: string }>(
        "/api/v1/presidencia/capex/simular",
        {
          method: "POST",
          body: JSON.stringify({
            unitsToAcquire: units,
            unitCostCop: unitCost,
            horizonMonths: 36,
          }),
        },
      );
      setCapexOut(res.message);
    } catch (e) {
      setError((e as Error).message || "Simulación CapEx fallida");
    } finally {
      setBusy(false);
    }
  }

  async function activarDefcon() {
    setBusy(true);
    setDefconOut(null);
    try {
      const res = await api<{
        message: string;
        notified: { drivers: number; customers: number; parents: number };
      }>("/api/v1/presidencia/defcon/activar", {
        method: "POST",
        body: JSON.stringify({
          defconLevel: 2,
          conflictZones: zones
            .split(",")
            .map((z) => z.trim())
            .filter(Boolean),
          notifyDrivers: true,
          notifyCustomers: true,
          notifyParents: true,
          openWarRoom: true,
        }),
      });
      setDefconActive(true);
      setDefconOut(
        `${res.message} · conductores ${res.notified.drivers} · clientes ${res.notified.customers} · padres ${res.notified.parents}`,
      );
    } catch (e) {
      setError((e as Error).message || "DEFCON no activado");
    } finally {
      setBusy(false);
    }
  }

  const p = dash?.pillars;

  return (
    <div
      className={`fade-in relative mx-auto min-h-[100dvh] max-w-[1400px] space-y-5 p-4 md:p-6 ${
        defconActive
          ? "bg-[#1a0508] text-[#F8FAFC]"
          : "bg-[#F4F6F9] text-[#0F172A] dark:bg-[#0A0D14] dark:text-[#F8FAFC]"
      }`}
    >
      {defconActive ? (
        <div className="pointer-events-none fixed inset-0 z-0 animate-pulse bg-[#FF2A5F]/15" />
      ) : null}

      <div className="relative z-10 rounded-xl border border-[#E2E8F0] bg-white/95 p-4 shadow-[0_10px_30px_rgba(0,0,0,0.04)] dark:border-white/10 dark:bg-[#121722]/95">
        <PageIntro module="presidencia" title="The Founder's Canvas" />
        <p className="mt-1 text-sm text-[#64748B] dark:text-[#94A3B8]">
          iPad God Mode · Jarvis · CapEx · Crisis Master
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge tone={defconActive ? "rose" : "emerald"}>
            {defconActive ? "DEFCON 2 · War Room" : "Nominal"}
          </Badge>
          <Badge tone="amber">
            Kill-Switch {dash?.killSwitch?.blockedPct ?? 0}%
          </Badge>
        </div>
      </div>

      <div className="relative z-10">
        <HowToBox
          steps={[
            "4 pilares: liquidez, SLA, riesgo PESV y NPS.",
            "Jarvis: comando NL → briefing + alerta vocal a directores.",
            "DEFCON 2: sirena App conductores + WhatsApp/SMS clientes/padres.",
          ]}
        />
      </div>

      {error ? (
        <p className="relative z-10 rounded-xl border border-[#DC2626]/40 bg-[#DC2626]/10 px-4 py-3 text-sm text-[#DC2626]">
          {error}
        </p>
      ) : null}

      {/* 4 pilares */}
      <section className="relative z-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: p?.liquidity.label || "Caja Libre",
            value: p ? cop(p.liquidity.valueCop) : "—",
            hint: p?.liquidity.hint,
          },
          {
            label: p?.sla.label || "Cumplimiento SLA",
            value: p ? `${p.sla.valuePct}%` : "—",
            hint: p?.sla.hint,
          },
          {
            label: p?.legalPesv.label || "Riesgo Legal / PESV",
            value: p
              ? `${p.legalPesv.level} · ${p.legalPesv.blockedUnits}`
              : "—",
            hint: p?.legalPesv.hint,
          },
          {
            label: p?.nps.label || "NPS",
            value: p ? String(p.nps.value) : "—",
            hint: p?.nps.hint,
          },
        ].map((card) => (
          <article
            key={card.label}
            className="rounded-xl border border-[#E2E8F0] bg-white p-4 dark:border-white/10 dark:bg-[#121722]"
          >
            <p className="text-xs uppercase tracking-wide text-[#64748B]">
              {card.label}
            </p>
            <p className="mt-2 font-display text-2xl text-[#0D9488] dark:text-[#10B981]">
              {card.value}
            </p>
            <p className="mt-1 text-xs text-[#64748B]">{card.hint}</p>
          </article>
        ))}
      </section>

      {/* Jarvis center */}
      <section
        id="jarvis"
        className="relative z-10 flex flex-col items-center rounded-xl border border-[#E2E8F0] bg-white p-6 dark:border-white/10 dark:bg-[#121722]"
      >
        <div
          className={`relative mb-4 flex h-28 w-28 items-center justify-center rounded-full border-2 ${
            listening
              ? "animate-pulse border-[#0D9488] shadow-[0_0_40px_rgba(13,148,136,0.45)]"
              : "border-[#E2E8F0] dark:border-white/20"
          }`}
        >
          <div
            className={`h-16 w-16 rounded-full bg-gradient-to-br from-[#0D9488] to-[#10B981] ${
              listening ? "animate-ping opacity-40 absolute" : ""
            }`}
          />
          <span className="relative font-display text-sm text-white">Jarvis</span>
        </div>
        <p className="mb-3 text-center text-sm text-[#64748B]">
          Asistente de voz IA — briefing matutino
        </p>
        <textarea
          className="field min-h-[72px] w-full max-w-xl"
          value={utterance}
          onChange={(e) => setUtterance(e.target.value)}
        />
        <Button
          type="button"
          variant="primary"
          className="mt-3 !min-h-[48px] !px-8"
          disabled={busy}
          onClick={() => void askJarvis()}
        >
          Hablar con Jarvis
        </Button>
        {jarvisOut ? (
          <p className="mt-4 max-w-2xl text-center text-sm">{jarvisOut}</p>
        ) : null}
      </section>

      <div className="relative z-10 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* CapEx */}
        <section
          id="capex"
          className="rounded-xl border border-[#E2E8F0] bg-white p-4 dark:border-white/10 dark:bg-[#121722]"
        >
          <h3 className="font-display text-lg">Simulador CapEx</h3>
          <p className="text-sm text-[#64748B]">
            Compra de flota vs mapa de utilización
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="text-xs">
              Unidades
              <input
                type="number"
                className="field mt-1 w-full"
                value={units}
                onChange={(e) => setUnits(Number(e.target.value) || 1)}
              />
            </label>
            <label className="text-xs">
              Costo unitario COP
              <input
                type="number"
                className="field mt-1 w-full"
                value={unitCost}
                onChange={(e) => setUnitCost(Number(e.target.value) || 0)}
              />
            </label>
          </div>
          <Button
            type="button"
            variant="secondary"
            className="mt-3"
            disabled={busy}
            onClick={() => void simularCapex()}
          >
            Simular inversión
          </Button>
          {capexOut ? <p className="mt-3 text-sm">{capexOut}</p> : null}
        </section>

        {/* DEFCON */}
        <section
          id="defcon"
          className="rounded-xl border border-[#DC2626]/40 bg-[#12060a] p-4 text-[#F8FAFC]"
        >
          <h3 className="font-display text-lg text-[#FF2A5F]">
            DEFCON · Crisis Master
          </h3>
          <p className="text-sm text-[#94A3B8]">
            Protocolo DEFCON 2 — sirena + blast masivo + War Room
          </p>
          <input
            className="field mt-3 w-full !bg-black !text-white"
            placeholder="Zonas de conflicto (coma)"
            value={zones}
            onChange={(e) => setZones(e.target.value)}
          />
          <Button
            type="button"
            variant="primary"
            className="mt-3 !bg-[#FF2A5F] !text-white"
            disabled={busy}
            onClick={() => void activarDefcon()}
          >
            Activar DEFCON 2
          </Button>
          {defconOut ? <p className="mt-3 text-sm">{defconOut}</p> : null}
        </section>
      </div>

      {/* Mapa calor ingresos */}
      <section className="relative z-10 rounded-xl border border-[#E2E8F0] bg-white p-4 dark:border-white/10 dark:bg-[#121722]">
        <h3 className="font-display text-lg">Mapa cifrado · calor de ingresos</h3>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {(dash?.revenueHeat ?? []).map((h) => (
            <div
              key={h.corridor}
              className="rounded-lg border border-[#E2E8F0] p-3 dark:border-white/10"
              style={{
                background: `rgba(13, 148, 136, ${Math.max(0.08, h.heat / 120)})`,
              }}
            >
              <p className="truncate font-mono text-xs">{h.corridor}</p>
              <p className="mt-1 text-sm font-medium">{cop(h.revenue)}</p>
              <p className="text-xs text-[#64748B]">
                calor {h.heat}% · {h.trips} viajes
              </p>
            </div>
          ))}
          {(dash?.revenueHeat ?? []).length === 0 ? (
            <p className="col-span-full py-8 text-center text-sm text-[#64748B]">
              Sin corredores de ingreso en uplink
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
