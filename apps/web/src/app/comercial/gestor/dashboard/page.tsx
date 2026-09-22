"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { HARD_RULES, statusEs } from "@fsg/shared";
import {
  ClipboardList,
  CreditCard,
  Phone,
  Target,
  Zap,
} from "lucide-react";
import { api } from "@/lib/api";
import { EmptyState, KpiCard, SlideOver } from "@/components/audit";
import { BentoPanel } from "@/components/nexa/bento-panel";

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
  { key: "NUEVO_LEAD", label: "Prospectos" },
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
  const [expressOpen, setExpressOpen] = useState(false);
  const [cobroOpen, setCobroOpen] = useState(false);

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
      setError(e instanceof Error ? e.message : "Conexión fallida");
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
          accountName: account || "Prospecto de recepción exprés",
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
          voiceNoteTranscript:
            voiceNote || "Nota de voz al colgar: retomar mañana",
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
        accountName: account || "Cliente exprés",
        origin: "Bogotá",
        destination: "Chía",
        createTrip: true,
      });
      setPayLinkId(res.link.id);
      setMsg(
        `${statusEs(res.status)}: ${res.message} · bloqueo=${res.dispatchGate.block ?? "ninguno"}`,
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enlace de cobro fallido");
    } finally {
      setBusy(false);
    }
  }

  async function confirmarPago() {
    if (!payLinkId) {
      setError("Genere un enlace de cobro primero");
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

  const pipelineTotal = PIPE_COLS.reduce(
    (sum, col) => sum + (dash?.miniPipeline?.[col.key]?.length ?? 0),
    0,
  );

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-border pb-4">
        <div>
          <p className="font-data text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-primary">
            Comercial · Gestor
          </p>
          <h1 className="font-sans text-2xl font-semibold tracking-tight text-brand-text-primary md:text-3xl">
            Acción rápida · Ejecución comercial
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            className="w-auto px-4 py-2"
            onClick={() => setExpressOpen(true)}
          >
            <Zap className="mr-1.5 h-4 w-4" aria-hidden />
            Cotización exprés
          </Button>
          <Button
            type="button"
            variant="primary"
            className="w-auto px-4 py-2"
            onClick={() => setCobroOpen(true)}
          >
            <CreditCard className="mr-1.5 h-4 w-4" aria-hidden />
            Cobro anticipado
          </Button>
        </div>
      </header>

      {error ? (
        <p className="rounded-lg border border-brand-danger/40 bg-brand-danger/10 px-4 py-3 font-data text-sm text-brand-danger">
          {error}
        </p>
      ) : null}
      {msg ? (
        <p className="rounded-lg border border-brand-primary/40 bg-brand-primary/10 px-4 py-3 font-data text-sm text-brand-primary">
          {msg}
        </p>
      ) : null}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Tareas hoy"
          value={dash?.tasks.length ?? 0}
          tone={(dash?.tasks.length ?? 0) > 0 ? "warn" : "ok"}
          icon={<ClipboardList />}
        />
        <KpiCard
          label="Pipeline personal"
          value={pipelineTotal}
          tone="neutral"
          icon={<Target />}
        />
        <KpiCard
          label="Pagos pendientes"
          value={dash?.pendingPayments.length ?? 0}
          tone={(dash?.pendingPayments.length ?? 0) > 0 ? "warn" : "ok"}
          icon={<CreditCard />}
        />
        <KpiCard
          label="Dcto máx."
          value={`${dash?.limits.maxDiscountPct ?? HARD_RULES.GESTOR_COMERCIAL_MAX_DISCOUNT_PCT}%`}
          delta="Superior escala a Dirección"
          tone="neutral"
          icon={<Zap />}
        />
      </section>

      <BentoPanel
        id="tareas"
        title="Bandeja de tareas del día"
        icon={<ClipboardList aria-hidden />}
      >
        {(dash?.tasks ?? []).length === 0 ? (
          <p className="text-xs text-brand-text-secondary">
            Sin tareas programadas hoy
          </p>
        ) : (
          <ul className="space-y-2">
            {(dash?.tasks ?? []).map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-brand-border bg-brand-canvas px-4 py-3"
              >
                <div>
                  <p className="text-sm text-brand-text-primary">{t.title}</p>
                  <p className="font-data text-[10px] tabular-nums text-brand-text-secondary">
                    {t.kind} · prioridad {t.priority}
                  </p>
                </div>
                <Badge tone="warning">{t.kind}</Badge>
              </li>
            ))}
          </ul>
        )}
      </BentoPanel>

      <BentoPanel
        id="pipeline"
        title="Mini-embudo personal"
        icon={<Target aria-hidden />}
      >
        <div className="grid gap-3 md:grid-cols-4">
          {PIPE_COLS.map((col) => {
            const deals = dash?.miniPipeline?.[col.key] ?? [];
            const colValue = deals.reduce(
              (sum, d) => sum + Number(d.estimatedMonthlyValue),
              0,
            );
            return (
              <BentoPanel
                key={col.key}
                title={col.label}
                subtitle={`${deals.length} · ${money(colValue)}`}
                className="!p-3"
              >
                <div className="space-y-2">
                  {deals.map((d) => (
                    <div
                      key={d.id}
                      className="rounded-lg border border-brand-border bg-brand-canvas p-2"
                    >
                      <p className="truncate text-sm text-brand-text-primary">
                        {d.accountName}
                      </p>
                      <p className="font-data text-[10px] text-brand-text-secondary">
                        {d.code}
                      </p>
                      <p className="mt-1 font-data text-xs tabular-nums text-brand-warning">
                        {money(Number(d.estimatedMonthlyValue))}
                      </p>
                    </div>
                  ))}
                  {!deals.length ? (
                    <p className="text-xs text-brand-text-secondary">Vacío</p>
                  ) : null}
                </div>
              </BentoPanel>
            );
          })}
        </div>
      </BentoPanel>

      <BentoPanel title="Timeline del cliente" icon={<Phone aria-hidden />}>
        {(dash?.timeline ?? []).length === 0 ? (
          <EmptyState
            icon={<Phone className="h-7 w-7" />}
            title="Sin interacciones"
            description="El timeline se poblará con llamadas y cotizaciones."
          />
        ) : (
          <ul className="space-y-3">
            {(dash?.timeline ?? []).map((ev) => (
              <li
                key={ev.id}
                className="border-l-2 border-brand-primary pl-3"
              >
                <p className="text-sm text-brand-text-primary">{ev.title}</p>
                {ev.body ? (
                  <p className="text-xs text-brand-text-secondary">{ev.body}</p>
                ) : null}
                <p className="font-data text-[10px] text-brand-text-secondary">
                  {ev.kind} · {new Date(ev.createdAt).toLocaleString("es-CO")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </BentoPanel>

      <SlideOver
        open={expressOpen}
        onClose={() => setExpressOpen(false)}
        title="Cotización exprés + Marcador"
        description={`Descuento máx. ${dash?.limits.maxDiscountPct ?? HARD_RULES.GESTOR_COMERCIAL_MAX_DISCOUNT_PCT}%`}
        widthClass="max-w-lg"
        footer={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="primary"
              className="w-auto px-4 py-2"
              disabled={busy}
              onClick={() => void runExpress()}
            >
              Cotización exprés
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="w-auto px-4 py-2"
              disabled={busy}
              onClick={() => void runLlamada()}
            >
              Registrar llamada
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <label className="block text-xs text-brand-text-secondary">
            Cuenta / Lead
            <input
              className="field mt-1 w-full"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              placeholder="Desde Recepción"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs text-brand-text-secondary">
              Dcto % (máx {dash?.limits.maxDiscountPct ?? 5})
              <input
                className="field mt-1 w-full font-data tabular-nums"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
              />
            </label>
            <label className="block text-xs text-brand-text-secondary">
              Teléfono
              <input
                className="field mt-1 w-full font-data"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>
          </div>
          <label className="block text-xs text-brand-text-secondary">
            Dictado al colgar
            <textarea
              className="field mt-1 w-full"
              rows={2}
              value={voiceNote}
              onChange={(e) => setVoiceNote(e.target.value)}
            />
          </label>
        </div>
      </SlideOver>

      <SlideOver
        open={cobroOpen}
        onClose={() => setCobroOpen(false)}
        title="Facturación anticipada"
        description="PSE/tarjeta bloquea despacho hasta confirmación Tesorería"
        widthClass="max-w-md"
        footer={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="primary"
              className="w-auto px-4 py-2"
              disabled={busy}
              onClick={() => void runCobro()}
            >
              Generar enlace PSE
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="w-auto px-4 py-2"
              disabled={busy || !payLinkId}
              onClick={() => void confirmarPago()}
            >
              Simular pago Tesorería
            </Button>
          </div>
        }
      >
        <label className="block text-xs text-brand-text-secondary">
          Monto COP
          <input
            className="field mt-1 w-full font-data tabular-nums"
            value={cobroAmount}
            onChange={(e) => setCobroAmount(e.target.value)}
          />
        </label>
        {(dash?.pendingPayments ?? []).length > 0 ? (
          <ul className="mt-4 space-y-1 text-xs text-brand-text-secondary">
            {dash!.pendingPayments.map((p) => (
              <li key={p.id} className="font-data tabular-nums">
                {p.code} · {money(Number(p.amount))} · Pendiente
              </li>
            ))}
          </ul>
        ) : null}
      </SlideOver>
    </div>
  );
}
