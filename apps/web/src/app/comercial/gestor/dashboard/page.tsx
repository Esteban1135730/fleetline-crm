"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { HARD_RULES } from "@fsg/shared";
import { api } from "@/lib/api";
import { HowToBox, PageIntro } from "@/components/page-intro";

type Task = {
  id: string;
  kind: string;
  title: string;
  dueAt: string;
  priority: number;
  completedAt?: string | null;
};

type Deal = {
  id: string;
  code: string;
  accountName: string;
  stage: string;
  estimatedMonthlyValue: number | string;
};

type Timeline = {
  id: string;
  kind: string;
  title: string;
  body?: string | null;
  createdAt: string;
};

type Dash = {
  tasks: Task[];
  miniPipeline: Record<string, Deal[]>;
  timeline: Timeline[];
  pendingPayments: Array<{ id: string; code: string; amount: number | string }>;
  callQueue: Array<{ id: string; phone: string; priorityScore: number }>;
  limits: { maxDiscountPct: number };
};

const PIPE_COLS = [
  { key: "NUEVO_LEAD", label: "Leads" },
  { key: "COTIZACION_ENVIADA", label: "Cotizados" },
  { key: "EN_NEGOCIACION", label: "Negociación" },
  { key: "CERRADO_GANADO", label: "Ganados" },
];

function money(n: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function GestorComercialDashboardPage() {
  const [dash, setDash] = useState<Dash | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [account, setAccount] = useState("");
  const [discount, setDiscount] = useState("0");
  const [phone, setPhone] = useState("+57 300 000 0000");
  const [voiceNote, setVoiceNote] = useState("");
  const [cobroAmount, setCobroAmount] = useState("850000");
  const [payLinkId, setPayLinkId] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await api.get<Dash>("/api/v1/comercial/gestor/dashboard");
      setDash(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Uplink fallido");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function runExpress() {
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const res = await api.post<{ status: string; message: string }>(
        "/api/v1/comercial/gestor/cotizacion-express",
        {
          accountName: account || "Lead Recepción Express",
          discountPct: Number(discount) || 0,
          distanceKm: 35,
          vehicleType: "VAN",
          omnichannelThread: [
            {
              channel: "WHATSAPP",
              body: "Cliente solicita van urgente Bogotá–Chía",
            },
          ],
        },
      );
      setMsg(`${res.status}: ${res.message}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cotización fallida");
    } finally {
      setBusy(false);
    }
  }

  async function runLlamada() {
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const res = await api.post<{ status: string; message: string }>(
        "/api/v1/comercial/gestor/registrar-llamada",
        {
          phone,
          accountName: account || undefined,
          durationSec: 180,
          outcome: "Seguimiento comercial",
          voiceNoteTranscript: voiceNote || "Nota de voz al colgar: retomar mañana",
          priorityScore: 85,
          scheduleFollowUpHours: 24,
        },
      );
      setMsg(`${res.status}: ${res.message}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Llamada fallida");
    } finally {
      setBusy(false);
    }
  }

  async function runCobro() {
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const res = await api.post<{
        status: string;
        message: string;
        link: { id: string };
        dispatchGate: { ok: boolean; block: string | null };
      }>("/api/v1/comercial/gestor/link-cobro-anticipado", {
        amount: Number(cobroAmount) || 850000,
        method: "PSE",
        accountName: account || "Cliente Express",
        origin: "Bogotá",
        destination: "Chía",
        createTrip: true,
      });
      setPayLinkId(res.link.id);
      setMsg(
        `${res.status}: ${res.message} · gate=${res.dispatchGate.block ?? "OK"}`,
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Link cobro fallido");
    } finally {
      setBusy(false);
    }
  }

  async function confirmarPago() {
    if (!payLinkId) {
      setError("Genera un link de cobro primero");
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<{ status: string; message: string }>(
        "/api/v1/comercial/gestor/confirmar-pago-tesoreria",
        { linkId: payLinkId, confirmed: true },
      );
      setMsg(`${res.status}: ${res.message}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Confirmación fallida");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <PageIntro module="comercial" title="Acción Rápida · Sales Execution" />

      <HowToBox
        steps={[
          `Descuento máximo ${HARD_RULES.GESTOR_COMERCIAL_MAX_DISCOUNT_PCT}% — superior escala a Dirección.`,
          "Link PSE/Tarjeta bloquea Despacho hasta confirmación de Tesorería.",
          "Marcador registra llamada + dictado de voz al colgar.",
        ]}
      />

      {error && (
        <p className="font-mono text-sm text-[var(--fl-critical)]">{error}</p>
      )}
      {msg && (
        <p className="font-mono text-sm text-[var(--fl-accent)]">{msg}</p>
      )}

      <section id="tareas" className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--fl-text)]">
          Bandeja de tareas del día
        </h2>
        <ul className="space-y-2">
          {(dash?.tasks ?? []).map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] px-4 py-3"
            >
              <div>
                <p className="text-sm text-[var(--fl-text)]">{t.title}</p>
                <p className="font-mono text-[10px] text-[var(--fl-subtext)]">
                  {t.kind} · prioridad {t.priority}
                </p>
              </div>
              <Badge tone="amber">{t.kind}</Badge>
            </li>
          ))}
          {(dash?.tasks ?? []).length === 0 && (
            <li className="text-xs text-[var(--fl-subtext)]">
              Sin tareas programadas hoy
            </li>
          )}
        </ul>
      </section>

      <section id="pipeline" className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--fl-text)]">
          Mini-Pipeline personal
        </h2>
        <div className="grid gap-3 md:grid-cols-4">
          {PIPE_COLS.map((col) => (
            <div
              key={col.key}
              className="rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-3"
            >
              <p className="mb-2 text-xs uppercase tracking-wider text-[var(--fl-subtext)]">
                {col.label}
              </p>
              <div className="space-y-2">
                {(dash?.miniPipeline?.[col.key] ?? []).map((d) => (
                  <div
                    key={d.id}
                    className="rounded-lg border border-[var(--fl-border)] bg-[var(--fl-canvas)] p-2"
                  >
                    <p className="truncate text-sm text-[var(--fl-text)]">
                      {d.accountName}
                    </p>
                    <p className="font-mono text-[10px] text-[var(--fl-subtext)]">
                      {d.code}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div
          id="marcador"
          className="space-y-3 rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-5"
        >
          <h2 className="text-sm font-semibold text-[var(--fl-text)]">
            Cotización express + Marcador
          </h2>
          <label className="block text-xs text-[var(--fl-subtext)]">
            Cuenta / Lead
            <input
              className="mt-1 w-full rounded-lg border border-[var(--fl-border)] bg-[var(--fl-canvas)] px-3 py-2 text-sm"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              placeholder="Desde Recepción"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs text-[var(--fl-subtext)]">
              Dcto % (máx {dash?.limits.maxDiscountPct ?? 5})
              <input
                className="mt-1 w-full rounded-lg border border-[var(--fl-border)] bg-[var(--fl-canvas)] px-2 py-2 font-mono text-sm"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
              />
            </label>
            <label className="block text-xs text-[var(--fl-subtext)]">
              Teléfono
              <input
                className="mt-1 w-full rounded-lg border border-[var(--fl-border)] bg-[var(--fl-canvas)] px-2 py-2 font-mono text-sm"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>
          </div>
          <label className="block text-xs text-[var(--fl-subtext)]">
            Dictado al colgar
            <textarea
              className="mt-1 w-full rounded-lg border border-[var(--fl-border)] bg-[var(--fl-canvas)] px-3 py-2 text-sm"
              rows={2}
              value={voiceNote}
              onChange={(e) => setVoiceNote(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => void runExpress()}>
              Cotización express
            </Button>
            <Button disabled={busy} onClick={() => void runLlamada()}>
              Registrar llamada
            </Button>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-5">
          <h2 className="text-sm font-semibold text-[var(--fl-text)]">
            Facturación anticipada
          </h2>
          <label className="block text-xs text-[var(--fl-subtext)]">
            Monto COP
            <input
              className="mt-1 w-full rounded-lg border border-[var(--fl-border)] bg-[var(--fl-canvas)] px-3 py-2 font-mono text-sm"
              value={cobroAmount}
              onChange={(e) => setCobroAmount(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => void runCobro()}>
              Generar link PSE
            </Button>
            <Button disabled={busy || !payLinkId} onClick={() => void confirmarPago()}>
              Simular pago Tesorería
            </Button>
          </div>
          {(dash?.pendingPayments ?? []).length > 0 && (
            <ul className="space-y-1 text-xs text-[var(--fl-subtext)]">
              {dash!.pendingPayments.map((p) => (
                <li key={p.id} className="font-mono">
                  {p.code} · {money(Number(p.amount))} · PENDING
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-5">
        <h2 className="text-sm font-semibold text-[var(--fl-text)]">
          Timeline del cliente
        </h2>
        <ul className="mt-3 space-y-3">
          {(dash?.timeline ?? []).map((ev) => (
            <li
              key={ev.id}
              className="border-l-2 border-[var(--fl-accent)] pl-3"
            >
              <p className="text-sm text-[var(--fl-text)]">{ev.title}</p>
              {ev.body && (
                <p className="text-xs text-[var(--fl-subtext)]">{ev.body}</p>
              )}
              <p className="font-mono text-[10px] text-[var(--fl-subtext)]">
                {ev.kind} · {new Date(ev.createdAt).toLocaleString("es-CO")}
              </p>
            </li>
          ))}
          {(dash?.timeline ?? []).length === 0 && (
            <li className="text-xs text-[var(--fl-subtext)]">
              Sin interacciones aún
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}
