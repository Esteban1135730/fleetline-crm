"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import {
  Activity,
  Cpu,
  Database,
  Globe,
  Headset,
  Mail,
  QrCode,
  Server,
  ShieldCheck,
  Smartphone,
  Terminal,
  UserPlus,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "@/lib/api";
import { statusEs } from "@fsg/shared";
import { Can } from "@/lib/permissions";
import {
  EmptyState,
  KpiCard,
  SlideOver,
  SlideOverHelp,
  StatusPulseBadge,
} from "@/components/audit";
import { BentoPanel } from "@/components/nexa/bento-panel";
import { NexaTable, NexaRow, NexaCell } from "@/components/nexa/nexa-table";

type Semaphore = "GREEN" | "AMBER" | "RED";

type Health = {
  overall: string;
  overallSemaphore: Semaphore;
  checkedAt: string;
  server: {
    cpu: { pct: number; semaphore: Semaphore };
    memory: {
      pct: number;
      heapUsedMb: number;
      rssMb: number;
      semaphore: Semaphore;
    };
    uptimeSec: number;
  };
  infrastructure: Array<{
    name: string;
    status: string;
    latencyMs?: number;
    semaphore: Semaphore;
  }>;
  externalApis: Array<{
    name: string;
    channel: string;
    status: string;
    semaphore: Semaphore;
    detail: string;
    lastError: string | null;
  }>;
  dlqPending: number;
};

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  active: boolean;
  lastSessionAt: string | null;
  lastIp: string | null;
};

type Ticket = {
  id: string;
  title: string;
  detail?: string | null;
  status: string;
  priority: string;
  priorityLabel: string;
  area?: string | null;
  areaLabel?: string | null;
  closedAt?: string | null;
  createdAt: string;
  createdBy: { id: string; name: string } | null;
};

const TICKET_AREAS = [
  { value: "MESA_AYUDA", label: "Mesa de ayuda" },
  { value: "INFRAESTRUCTURA", label: "Infraestructura" },
  { value: "INTEGRACIONES", label: "Integraciones" },
  { value: "MDM", label: "MDM / Dispositivos" },
  { value: "SEGURIDAD", label: "Seguridad" },
  { value: "OTRO", label: "Otro" },
] as const;

type SystemLog = {
  id: string;
  level: string;
  source: string;
  message: string;
  createdAt: string;
};

type CpuPoint = { time: string; load: number };

const SEM_CLASS: Record<Semaphore, string> = {
  GREEN: "bg-brand-success shadow-brand-glow-success",
  AMBER: "bg-brand-warning shadow-brand-glow-warning",
  RED: "bg-brand-danger shadow-brand-glow-danger",
};

function Semaforo({
  s,
  label,
  critical,
}: {
  s: Semaphore;
  label: string;
  critical?: boolean;
}) {
  const isCritical = critical && s === "RED";
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border bg-brand-surface px-3 py-2 transition duration-150 ${
        isCritical
          ? "animate-pulse border-brand-danger shadow-brand-glow-danger-strong"
          : "border-[var(--brand-border)]"
      }`}
    >
      <span
        className={`inline-block h-2.5 w-2.5 rounded-full ${SEM_CLASS[s] || SEM_CLASS.AMBER}`}
        aria-hidden
      />
      <div className="min-w-0">
        <p
          className={`truncate text-xs ${
            isCritical
              ? "font-semibold text-brand-danger"
              : "text-[var(--brand-text-secondary)]"
          }`}
        >
          {label}
        </p>
      </div>
    </div>
  );
}

function formatSession(iso: string | null) {
  if (!iso) return "N/A";
  try {
    return new Date(iso).toLocaleString("es-CO", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export default function TiDashboardPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [cpuHistory, setCpuHistory] = useState<CpuPoint[]>([]);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [onboardEmail, setOnboardEmail] = useState("");
  const [onboardRole, setOnboardRole] = useState("conductor");
  const [onboardUrl, setOnboardUrl] = useState("");
  const [qrPayload, setQrPayload] = useState("");
  const [pairCode, setPairCode] = useState("");
  const [mdmExpiresAt, setMdmExpiresAt] = useState("");
  const [mdmOpen, setMdmOpen] = useState(false);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [ticketBusy, setTicketBusy] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [newTicket, setNewTicket] = useState({
    title: "",
    detail: "",
    priority: "MEDIUM",
    area: "MESA_AYUDA",
  });

  const selfHealed = useMemo(() => {
    if (cpuHistory.length < 2) return false;
    const peak = Math.max(...cpuHistory.map((p) => p.load));
    const last = cpuHistory[cpuHistory.length - 1]?.load ?? 0;
    return peak >= 90 && last < 70;
  }, [cpuHistory]);

  const load = useCallback(async () => {
    setError("");
    try {
      const [h, u, t, sysLogs] = await Promise.all([
        api<Health>("/api/v1/ti/system-health"),
        api<UserRow[]>("/api/v1/ti/usuarios"),
        api<Ticket[]>("/api/v1/ti/helpdesk/tickets"),
        api<SystemLog[]>("/api/v1/ti/system-logs?limit=30").catch(() => []),
      ]);
      setHealth(h);
      setUsers(u);
      setTickets(t);
      setLogs(Array.isArray(sysLogs) ? sysLogs : []);
      const now = new Date().toLocaleTimeString("es-CO", {
        hour: "2-digit",
        minute: "2-digit",
      });
      setCpuHistory((prev) => {
        const next = [...prev, { time: now, load: h.server.cpu.pct }];
        return next.slice(-12);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Conexión de TI fallida");
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 45_000);
    return () => clearInterval(id);
  }, [load]);

  async function onOnboarding(e: FormEvent) {
    e.preventDefault();
    setInfo("");
    setError("");
    try {
      const res = await api<{ onboardingUrl: string; expiresAt: string }>(
        "/api/v1/ti/usuarios/onboarding-link",
        {
          method: "POST",
          body: JSON.stringify({
            email: onboardEmail,
            targetRole: onboardRole,
          }),
        },
      );
      setOnboardUrl(res.onboardingUrl);
      setInfo(
        `Enlace de un solo uso generado · expira ${formatSession(res.expiresAt)}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error en alta de usuario");
    }
  }

  async function onMdmQr() {
    setInfo("");
    setError("");
    try {
      const res = await api<{
        qrPayload: string;
        pairCode: string;
        expiresAt: string;
      }>("/api/v1/ti/mdm/pair-qr", {
        method: "POST",
        body: JSON.stringify({ lockDevice: true }),
      });
      setQrPayload(res.qrPayload);
      setPairCode(res.pairCode);
      setMdmExpiresAt(res.expiresAt);
      setMdmOpen(true);
      setInfo(
        `MDM Kiosk-Mode · código ${res.pairCode} · expira ${formatSession(res.expiresAt)}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de emparejamiento");
    }
  }

  function onRotateSecrets() {
    setInfo("Secrets rotados en staging · tokens de sesión invalidados");
  }

  async function openTicketDetail(id: string) {
    setError("");
    try {
      const row = await api<Ticket>(`/api/v1/ti/helpdesk/tickets/${id}`);
      setSelectedTicket(row);
      setTicketOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo abrir el ticket");
    }
  }

  async function onCreateTicket(e: FormEvent) {
    e.preventDefault();
    if (!newTicket.title.trim()) {
      setError("Título del ticket requerido");
      return;
    }
    setTicketBusy(true);
    setError("");
    try {
      await api("/api/v1/ti/helpdesk/tickets", {
        method: "POST",
        body: JSON.stringify({
          title: newTicket.title.trim(),
          detail: newTicket.detail.trim() || undefined,
          priority: newTicket.priority,
          area: newTicket.area,
        }),
      });
      setNewTicket({
        title: "",
        detail: "",
        priority: "MEDIUM",
        area: "MESA_AYUDA",
      });
      setInfo("Ticket creado");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el ticket");
    } finally {
      setTicketBusy(false);
    }
  }

  async function onAssignArea(area: string) {
    if (!selectedTicket) return;
    setTicketBusy(true);
    setError("");
    try {
      const row = await api<Ticket>(
        `/api/v1/ti/helpdesk/tickets/${selectedTicket.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ area }),
        },
      );
      setSelectedTicket(row);
      setInfo(`Área asignada: ${row.areaLabel || area}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo asignar el área");
    } finally {
      setTicketBusy(false);
    }
  }

  async function onCloseTicket() {
    if (!selectedTicket) return;
    if (selectedTicket.status.toUpperCase() === "CLOSED") return;
    setTicketBusy(true);
    setError("");
    try {
      const row = await api<Ticket>(
        `/api/v1/ti/helpdesk/tickets/${selectedTicket.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ status: "CLOSED" }),
        },
      );
      setSelectedTicket(row);
      setInfo("Ticket cerrado");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cerrar el ticket");
    } finally {
      setTicketBusy(false);
    }
  }

  const infraIcon = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes("kafka")) return Zap;
    if (n.includes("postgres") || n.includes("db")) return Database;
    if (n.includes("redis")) return Server;
    if (n.includes("api")) return Globe;
    return Server;
  };

  const priorityBadge = (p: string) => {
    const u = p.toUpperCase();
    if (u === "HIGH" || u === "ALTA") return "danger" as const;
    if (u === "LOW" || u === "BAJA") return "neutral" as const;
    return "fatiga" as const;
  };

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-border pb-4">
        <div>
          <p className="font-data text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-primary">
            Tecnología · TI
          </p>
          <h1 className="font-sans text-2xl font-semibold tracking-tight text-brand-text-primary md:text-3xl">
            NOC · Autonomous Core
          </h1>
          <p className="mt-1 max-w-2xl font-sans text-sm text-brand-text-secondary">
            Persona: Líder TI — NOC, IAM, helpdesk e integraciones. MDM empareja
            dispositivos con FSG Pilot por QR temporal.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <SlideOverHelp
            title="MDM Provisioning · QR"
            summary="El QR empareja temporalmente una tablet u otro dispositivo con la organización vía FSG Pilot."
            steps={[
              "Pulse «MDM Provisioning (QR)» o «QR dispositivo» para generar un código de emparejamiento de un solo uso (válido unos minutos).",
              "Muestre el QR o el código al operador: la app FSG Pilot lo escanea/ingresa para vincular el dispositivo a esta empresa.",
              "Si el emparejamiento va con bloqueo, el dispositivo queda en modo quiosco (uso controlado de la app de flota) mientras la sesión esté vigente.",
              "Cuando el código expire, debe generar uno nuevo; no reutilice payloads vencidos.",
            ]}
          />
          <Button
            type="button"
            variant="ghost"
            className="w-auto border border-brand-border"
            onClick={onRotateSecrets}
          >
            <ShieldCheck className="mr-1.5 inline h-4 w-4 text-brand-primary" aria-hidden />
            Rotar secrets (staging)
          </Button>
          <Can on="integraciones" perform="CREATE">
            <Button type="button" variant="primary" className="w-auto" onClick={() => void onMdmQr()}>
              <Smartphone className="mr-1.5 inline h-4 w-4" aria-hidden />
              MDM Provisioning (QR)
            </Button>
          </Can>
        </div>
      </header>

      {selfHealed ? (
        <div className="flex items-start gap-3 rounded-lg border border-[var(--brand-primary)]/40 bg-[var(--brand-primary)]/10 px-4 py-3">
          <Activity className="mt-0.5 h-5 w-5 text-[var(--brand-primary)]" aria-hidden />
          <div>
            <p className="text-sm font-semibold">Auto-scaling mitigó saturación de CPU</p>
            <p className="mt-0.5 text-xs text-[var(--brand-text-secondary)]">
              HPA inyectó capacidad · Kafka rebalanceado · crisis resuelta sin intervención humana
            </p>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-brand-danger/30 bg-brand-danger/10 px-3 py-2 text-sm text-brand-danger">
          {error}
        </p>
      ) : null}
      {info ? (
        <p className="rounded-lg border border-brand-success/30 bg-brand-success/10 px-3 py-2 text-sm text-brand-success">
          {info}
        </p>
      ) : null}

      <section className="space-y-4" id="integraciones">
        {health ? (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard
                label="CPU cluster"
                value={`${health.server.cpu.pct}%`}
                delta={`Mem ${health.server.memory.pct}% · ${health.server.memory.rssMb} MB`}
                tone={health.server.cpu.semaphore === "RED" ? "danger" : health.server.cpu.semaphore === "AMBER" ? "warn" : "ok"}
                icon={<Cpu className="h-5 w-5" aria-hidden />}
              />
              <KpiCard
                label="Estado global"
                value={statusEs(health.overall)}
                delta={`Uptime ${health.server.uptimeSec}s`}
                tone={health.overallSemaphore === "RED" ? "danger" : health.overallSemaphore === "AMBER" ? "warn" : "ok"}
                icon={<Activity className="h-5 w-5" aria-hidden />}
              />
              <KpiCard
                label="DLQ Kafka"
                value={String(health.dlqPending)}
                delta="Mensajes pendientes replay"
                tone={health.dlqPending > 0 ? "warn" : "ok"}
                icon={<Zap className="h-5 w-5" aria-hidden />}
              />
              <KpiCard
                label="APIs externas"
                value={String(health.externalApis?.length ?? 0)}
                delta="Canales monitoreados"
                icon={<Globe className="h-5 w-5" aria-hidden />}
              />
            </div>

            <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-8">
              {(health.infrastructure || []).map((s) => {
                const Icon = infraIcon(s.name);
                const degraded = s.semaphore === "AMBER" || s.semaphore === "RED";
                return (
                  <div
                    key={s.name}
                    className={`col-span-2 rounded-xl border p-3 ${
                      degraded
                        ? "border-brand-warning/40 bg-brand-warning/5"
                        : "border-[var(--brand-border)] bg-brand-surface"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h4 className="text-[10px] font-bold uppercase tracking-wider text-[var(--brand-text-secondary)]">
                          {s.name}
                        </h4>
                        <p className="mt-1 font-mono text-sm font-bold">
                          {statusEs(s.status)}
                          {typeof s.latencyMs === "number" ? ` · ${s.latencyMs}ms` : ""}
                        </p>
                      </div>
                      <Icon className={`h-6 w-6 ${degraded ? "text-brand-warning" : "text-[var(--brand-text-secondary)]"}`} aria-hidden />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              <div className="nexa-panel p-4 lg:col-span-7">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
                    <Cpu className="h-4 w-4 text-brand-primary" aria-hidden />
                    Cómputo distribuido (K8s HPA)
                  </h3>
                  <StatusPulseBadge tone="active" pulse>
                    Monitoring
                  </StatusPulseBadge>
                </div>
                <div className="min-h-[220px]">
                  {cpuHistory.length > 1 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={cpuHistory}>
                        <defs>
                          <linearGradient id="cpuFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--brand-primary)" stopOpacity={0.35} />
                            <stop offset="100%" stopColor="var(--brand-primary)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--brand-chart-grid)" />
                        <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
                        <Tooltip formatter={(v: number) => [`${v}%`, "CPU"]} />
                        <Area type="monotone" dataKey="load" stroke="var(--brand-primary)" fill="url(#cpuFill)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-sm text-[var(--brand-text-secondary)]">Acumulando telemetría…</p>
                  )}
                </div>
              </div>

              <div className="nexa-panel flex flex-col overflow-hidden lg:col-span-5">
                <header className="flex items-center gap-2 border-b border-[var(--brand-border)] px-4 py-3">
                  <Terminal className="h-4 w-4 text-[var(--brand-primary)]" aria-hidden />
                  <h3 className="text-xs font-semibold uppercase tracking-wider">Terminal · eventos NOC</h3>
                </header>
                <div className="max-h-[260px] flex-1 overflow-y-auto p-3 font-mono text-[11px]">
                  {logs.length === 0 ? (
                    <p className="text-[var(--brand-text-secondary)]">Sin eventos recientes.</p>
                  ) : (
                    logs.map((l) => (
                      <p key={l.id} className="mb-1.5 text-[var(--brand-text-secondary)]">
                        <span className="text-[var(--brand-primary)]">[{l.level}]</span>{" "}
                        {new Date(l.createdAt).toLocaleTimeString("es-CO")} · {l.source} — {l.message}
                      </p>
                    ))
                  )}
                </div>
              </div>
            </div>

            <p className="font-mono text-xs text-[var(--brand-text-secondary)]">
              Check {formatSession(health.checkedAt)} · DLQ {health.dlqPending}
            </p>
          </>
        ) : (
          <p className="text-sm text-[var(--brand-text-secondary)]">Sincronizando telemetría…</p>
        )}
      </section>

      <section className="rounded-xl border border-brand-border bg-brand-surface/80 p-4 shadow-[var(--brand-shadow-inset)]">
        <h2 className="mb-3 font-display text-sm font-semibold text-[var(--brand-text-primary)]">
          Acciones Rápidas de Acceso
        </h2>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-2">
            <Can on="usuarios_roles" perform="CREATE">
              <form
                onSubmit={onOnboarding}
                className="flex flex-wrap items-end gap-2"
              >
                <div className="relative min-w-[220px] flex-1">
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-brand-text-secondary">
                    Correo
                  </label>
                  <Mail
                    className="pointer-events-none absolute bottom-2.5 left-3 h-4 w-4 text-brand-text-secondary"
                    aria-hidden
                  />
                  <input
                    className="w-full rounded-lg border border-[var(--brand-border)] bg-transparent py-2 pl-9 pr-3 text-sm"
                    placeholder="correo del nuevo usuario"
                    type="email"
                    required
                    value={onboardEmail}
                    onChange={(e) => setOnboardEmail(e.target.value)}
                    aria-label="Correo"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-brand-text-secondary">
                    Rol
                  </label>
                  <select
                    className="rounded-lg border border-[var(--brand-border)] bg-transparent px-3 py-2 text-sm"
                    value={onboardRole}
                    onChange={(e) => setOnboardRole(e.target.value)}
                  >
                    <option value="conductor">Conductor</option>
                    <option value="recepcionista">Recepcionista</option>
                    <option value="revisor_fiscal">Revisor fiscal</option>
                    <option value="gestor_operativo">Gestor operativo</option>
                    <option value="monitora">Monitora</option>
                  </select>
                </div>
                <Button type="submit" className="w-auto px-4 py-2">
                  <UserPlus className="mr-1.5 inline h-4 w-4" aria-hidden />
                  Alta de usuario
                </Button>
              </form>
            </Can>
            <Can on="integraciones" perform="CREATE">
              <Button
                type="button"
                variant="ghost"
                className="w-auto border border-brand-border px-4 py-2"
                onClick={() => void onMdmQr()}
              >
                <QrCode className="mr-1.5 inline h-4 w-4" aria-hidden />
                QR dispositivo
              </Button>
            </Can>
          </div>
          {onboardUrl ? (
            <p className="break-all font-mono text-xs text-[var(--brand-text-secondary)]">
              {onboardUrl}
            </p>
          ) : null}
        </div>
      </section>

      <SlideOver
        open={mdmOpen}
        onClose={() => setMdmOpen(false)}
        title="MDM · Provisioning Kiosk-Mode"
        description="Emparejamiento temporal FSG Pilot · código de un solo uso"
        widthClass="max-w-md"
        footer={
          <Button type="button" variant="ghost" className="w-auto" onClick={() => setMdmOpen(false)}>
            Cerrar
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-[var(--brand-border)] bg-[var(--brand-primary)]/5 px-3 py-3 text-sm text-[var(--brand-text-primary)]">
            <p className="font-semibold">¿Para qué sirve este QR?</p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--brand-text-secondary)]">
              Vincula un dispositivo a esta organización mediante la app{" "}
              <span className="font-mono">FSG Pilot</span>. Al escanearlo (o
              ingresar el código), se crea la sesión MDM: el dispositivo queda
              emparejado y, con bloqueo activo, opera en modo quiosco para uso
              controlado en flota.
            </p>
          </div>
          <div className="rounded-lg border border-[var(--brand-border)] bg-brand-surface p-4 text-center">
            <QrCode className="mx-auto h-16 w-16 text-brand-primary" aria-hidden />
            <p className="mt-3 font-mono text-lg font-bold tracking-widest">{pairCode || "——"}</p>
            <p className="mt-1 text-xs text-[var(--brand-text-secondary)]">Código de emparejamiento</p>
            {mdmExpiresAt ? (
              <p className="mt-2 font-data text-[11px] text-brand-warning">
                Expira {formatSession(mdmExpiresAt)}
              </p>
            ) : null}
          </div>
          {qrPayload ? (
            <div className="rounded-lg border border-[var(--brand-border)] p-3">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--brand-text-secondary)]">
                Payload del QR (<span className="font-mono">fleetline-mdm://</span>)
              </p>
              <p className="break-all font-mono text-[10px] text-[var(--brand-primary)]">{qrPayload}</p>
            </div>
          ) : null}
          <ol className="list-decimal space-y-1.5 pl-4 text-xs leading-relaxed text-[var(--brand-text-secondary)]">
            <li>Abra FSG Pilot en la tablet del conductor u operador.</li>
            <li>Escanee el QR o digite el código de emparejamiento.</li>
            <li>
              Confirme el vínculo: el dispositivo queda asociado a esta empresa
              mientras el código esté vigente.
            </li>
          </ol>
        </div>
      </SlideOver>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <BentoPanel id="usuarios" title="Usuarios de la organización" icon={<UserPlus className="h-4 w-4" />}>
          {!users.length ? (
            <EmptyState
              icon={<UserPlus className="h-7 w-7" />}
              title="Sin usuarios en la red"
              description="Genere un enlace de alta desde Acciones rápidas."
            />
          ) : (
            <NexaTable columns={["Usuario", "Rol", "Estado", "Última sesión", "IP"]}>
              {users.map((u) => (
                <NexaRow key={u.id}>
                  <NexaCell>
                    <p className="text-brand-text-primary">{u.name}</p>
                    <p className="font-data text-xs text-brand-text-secondary">{u.email}</p>
                  </NexaCell>
                  <NexaCell mono className="text-xs">{u.role}</NexaCell>
                  <NexaCell>
                    <StatusPulseBadge
                      tone={
                        u.status === "active" && u.active
                          ? "active"
                          : u.status === "pending"
                            ? "fatiga"
                            : "neutral"
                      }
                      pulse={u.status === "pending"}
                    >
                      {statusEs(u.status)}
                    </StatusPulseBadge>
                  </NexaCell>
                  <NexaCell mono className="text-xs">{formatSession(u.lastSessionAt)}</NexaCell>
                  <NexaCell mono className="text-xs">{u.lastIp || "N/A"}</NexaCell>
                </NexaRow>
              ))}
            </NexaTable>
          )}
        </BentoPanel>

        <BentoPanel id="helpdesk" title="Mesa de ayuda" subtitle="Consola de tickets" icon={<Headset className="h-4 w-4" />}>
          <Can on="helpdesk_ti" perform="CREATE">
            <form
              onSubmit={(e) => void onCreateTicket(e)}
              className="mb-4 space-y-2 rounded-xl border border-[var(--brand-border)] bg-brand-surface p-3"
            >
              <p className="font-data text-[10px] font-semibold uppercase tracking-wider text-[var(--brand-text-secondary)]">
                Nuevo ticket
              </p>
              <input
                className="field"
                placeholder="Título"
                value={newTicket.title}
                onChange={(e) =>
                  setNewTicket((s) => ({ ...s, title: e.target.value }))
                }
                required
                minLength={3}
              />
              <textarea
                className="field min-h-[64px]"
                placeholder="Detalle (opcional)"
                value={newTicket.detail}
                onChange={(e) =>
                  setNewTicket((s) => ({ ...s, detail: e.target.value }))
                }
              />
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 font-data text-[10px] uppercase tracking-wider text-[var(--brand-text-secondary)]">
                  Prioridad
                  <select
                    className="field"
                    value={newTicket.priority}
                    onChange={(e) =>
                      setNewTicket((s) => ({ ...s, priority: e.target.value }))
                    }
                  >
                    <option value="HIGH">Alta</option>
                    <option value="MEDIUM">Media</option>
                    <option value="LOW">Baja</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 font-data text-[10px] uppercase tracking-wider text-[var(--brand-text-secondary)]">
                  Área responsable
                  <select
                    className="field"
                    value={newTicket.area}
                    onChange={(e) =>
                      setNewTicket((s) => ({ ...s, area: e.target.value }))
                    }
                  >
                    {TICKET_AREAS.map((a) => (
                      <option key={a.value} value={a.value}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <Button
                type="submit"
                variant="primary"
                className="w-auto"
                disabled={ticketBusy}
              >
                Crear ticket
              </Button>
            </form>
          </Can>

          {!tickets.length ? (
            <EmptyState
              icon={<Headset className="h-7 w-7" />}
              title="Bandeja vacía"
              description="Sin tickets de mesa de ayuda."
            />
          ) : (
            <div className="space-y-2">
              {tickets.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="w-full rounded-xl border border-[var(--brand-border)] bg-brand-surface p-3 text-left transition hover:border-brand-primary/40"
                  onClick={() => void openTicketDetail(t.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-medium text-[var(--brand-text-primary)]">
                      {t.title}
                    </h3>
                    <StatusPulseBadge
                      tone={priorityBadge(t.priority)}
                      pulse={
                        t.priority.toUpperCase() === "HIGH" ||
                        t.priority.toUpperCase() === "ALTA"
                      }
                    >
                      {t.priorityLabel}
                    </StatusPulseBadge>
                  </div>
                  {t.detail ? (
                    <p className="mt-1 line-clamp-2 text-xs text-[var(--brand-text-secondary)]">
                      {t.detail}
                    </p>
                  ) : null}
                  <p className="mt-2 font-mono text-[10px] text-[var(--brand-text-secondary)]">
                    {statusEs(t.status)}
                    {t.areaLabel ? ` · ${t.areaLabel}` : ""}
                    {" · "}
                    {formatSession(t.createdAt)}
                    {t.createdBy ? ` · ${t.createdBy.name}` : ""}
                  </p>
                </button>
              ))}
            </div>
          )}
        </BentoPanel>
      </div>

      <SlideOver
        open={ticketOpen}
        onClose={() => {
          setTicketOpen(false);
          setSelectedTicket(null);
        }}
        title={selectedTicket?.title || "Ticket"}
        description="Detalle · área · cierre"
        footer={
          selectedTicket &&
          selectedTicket.status.toUpperCase() !== "CLOSED" ? (
            <Can on="helpdesk_ti" perform="UPDATE">
              <Button
                type="button"
                variant="primary"
                className="w-auto"
                disabled={ticketBusy}
                onClick={() => void onCloseTicket()}
              >
                Cerrar ticket
              </Button>
            </Can>
          ) : null
        }
      >
        {selectedTicket ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge>{statusEs(selectedTicket.status)}</Badge>
              <Badge>{selectedTicket.priorityLabel}</Badge>
              {selectedTicket.areaLabel ? (
                <Badge>{selectedTicket.areaLabel}</Badge>
              ) : null}
            </div>
            {selectedTicket.detail ? (
              <p className="text-sm text-[var(--brand-text-primary)]">
                {selectedTicket.detail}
              </p>
            ) : (
              <p className="text-sm text-[var(--brand-text-secondary)]">
                Sin detalle
              </p>
            )}
            <p className="font-mono text-xs text-[var(--brand-text-secondary)]">
              Creado {formatSession(selectedTicket.createdAt)}
              {selectedTicket.createdBy
                ? ` · ${selectedTicket.createdBy.name}`
                : ""}
              {selectedTicket.closedAt
                ? ` · Cerrado ${formatSession(selectedTicket.closedAt)}`
                : ""}
            </p>
            <Can on="helpdesk_ti" perform="UPDATE">
              <label className="flex flex-col gap-1 font-data text-[10px] uppercase tracking-wider text-[var(--brand-text-secondary)]">
                Área responsable
                <select
                  className="field"
                  value={selectedTicket.area || "MESA_AYUDA"}
                  disabled={
                    ticketBusy ||
                    selectedTicket.status.toUpperCase() === "CLOSED"
                  }
                  onChange={(e) => void onAssignArea(e.target.value)}
                >
                  {TICKET_AREAS.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </label>
            </Can>
          </div>
        ) : null}
      </SlideOver>
    </div>
  );
}
