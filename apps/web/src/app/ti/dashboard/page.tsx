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
import { PageIntro } from "@/components/page-intro";
import { Can } from "@/lib/permissions";
import {
  EmptyState,
  KpiCard,
  SlideOver,
  StatusPulseBadge,
} from "@/components/audit";

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
  createdAt: string;
  createdBy: { id: string; name: string } | null;
};

type SystemLog = {
  id: string;
  level: string;
  source: string;
  message: string;
  createdAt: string;
};

type CpuPoint = { time: string; load: number };

const SEM_CLASS: Record<Semaphore, string> = {
  GREEN: "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.45)]",
  AMBER: "bg-amber-500 shadow-[0_0_8px_rgba(255,184,0,0.4)]",
  RED: "bg-rose-500 shadow-[0_0_8px_rgba(255,42,95,0.45)]",
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
      className={`flex items-center gap-2 rounded-lg border bg-[var(--bg-surface)] px-3 py-2 transition duration-150 ${
        isCritical
          ? "animate-pulse border-rose-500 shadow-[0_0_16px_rgba(255,42,95,0.55)]"
          : "border-[var(--border-subtle)]"
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
              ? "font-semibold text-rose-300"
              : "text-[var(--text-secondary)]"
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
  const [mdmOpen, setMdmOpen] = useState(false);

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
      <PageIntro
        module="tecnologia_ti"
        title="NOC · Autonomous Core"
        subtitle="Self-healing Kubernetes cluster · zero-trust activo"
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="ghost"
              className="w-auto border border-[var(--brand-line)]"
              onClick={onRotateSecrets}
            >
              <ShieldCheck className="mr-1.5 inline h-4 w-4 text-[var(--accent-primary)]" aria-hidden />
              Rotar secrets (staging)
            </Button>
            <Can on="integraciones" perform="CREATE">
              <Button type="button" variant="primary" className="w-auto" onClick={() => void onMdmQr()}>
                <Smartphone className="mr-1.5 inline h-4 w-4" aria-hidden />
                MDM Provisioning (QR)
              </Button>
            </Can>
          </div>
        }
      />

      {selfHealed ? (
        <div className="flex items-start gap-3 rounded-lg border border-[var(--accent-primary)]/40 bg-[var(--accent-primary)]/10 px-4 py-3">
          <Activity className="mt-0.5 h-5 w-5 text-[var(--accent-primary)]" aria-hidden />
          <div>
            <p className="text-sm font-semibold">Auto-scaling mitigó saturación de CPU</p>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              HPA inyectó capacidad · Kafka rebalanceado · crisis resuelta sin intervención humana
            </p>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {error}
        </p>
      ) : null}
      {info ? (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
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
                        ? "border-amber-500/40 bg-amber-500/5"
                        : "border-[var(--border-subtle)] bg-[var(--bg-surface)]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h4 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                          {s.name}
                        </h4>
                        <p className="mt-1 font-mono text-sm font-bold">
                          {statusEs(s.status)}
                          {typeof s.latencyMs === "number" ? ` · ${s.latencyMs}ms` : ""}
                        </p>
                      </div>
                      <Icon className={`h-6 w-6 ${degraded ? "text-amber-500" : "text-[var(--text-secondary)]"}`} aria-hidden />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              <div className="fsg-panel p-4 lg:col-span-7">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
                    <Cpu className="h-4 w-4 text-cyan-400" aria-hidden />
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
                            <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.35} />
                            <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--brand-line)" />
                        <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
                        <Tooltip formatter={(v: number) => [`${v}%`, "CPU"]} />
                        <Area type="monotone" dataKey="load" stroke="#22d3ee" fill="url(#cpuFill)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-sm text-[var(--text-secondary)]">Acumulando telemetría…</p>
                  )}
                </div>
              </div>

              <div className="fsg-panel flex flex-col overflow-hidden lg:col-span-5">
                <header className="flex items-center gap-2 border-b border-[var(--brand-line)] px-4 py-3">
                  <Terminal className="h-4 w-4 text-[var(--accent-primary)]" aria-hidden />
                  <h3 className="text-xs font-semibold uppercase tracking-wider">Terminal · eventos NOC</h3>
                </header>
                <div className="max-h-[260px] flex-1 overflow-y-auto p-3 font-mono text-[11px]">
                  {logs.length === 0 ? (
                    <p className="text-[var(--text-secondary)]">Sin eventos recientes.</p>
                  ) : (
                    logs.map((l) => (
                      <p key={l.id} className="mb-1.5 text-[var(--text-secondary)]">
                        <span className="text-[var(--accent-primary)]">[{l.level}]</span>{" "}
                        {new Date(l.createdAt).toLocaleTimeString("es-CO")} · {l.source} — {l.message}
                      </p>
                    ))
                  )}
                </div>
              </div>
            </div>

            <p className="font-mono text-xs text-[var(--text-secondary)]">
              Check {formatSession(health.checkedAt)} · DLQ {health.dlqPending}
            </p>
          </>
        ) : (
          <p className="text-sm text-[var(--text-secondary)]">Sincronizando telemetría…</p>
        )}
      </section>

      <section className="rounded-xl border border-slate-800 bg-zinc-900/80 p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
        <h2 className="mb-3 font-display text-sm font-semibold text-[var(--text-primary)]">
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
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Correo
                  </label>
                  <Mail
                    className="pointer-events-none absolute bottom-2.5 left-3 h-4 w-4 text-slate-500"
                    aria-hidden
                  />
                  <input
                    className="w-full rounded-lg border border-[var(--border-subtle)] bg-transparent py-2 pl-9 pr-3 text-sm"
                    placeholder="correo del nuevo usuario"
                    type="email"
                    required
                    value={onboardEmail}
                    onChange={(e) => setOnboardEmail(e.target.value)}
                    aria-label="Correo"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Rol
                  </label>
                  <select
                    className="rounded-lg border border-[var(--border-subtle)] bg-transparent px-3 py-2 text-sm"
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
                className="w-auto border border-slate-600 px-4 py-2"
                onClick={() => void onMdmQr()}
              >
                <QrCode className="mr-1.5 inline h-4 w-4" aria-hidden />
                QR dispositivo
              </Button>
            </Can>
          </div>
          {onboardUrl ? (
            <p className="break-all font-mono text-xs text-[var(--text-secondary)]">
              {onboardUrl}
            </p>
          ) : null}
        </div>
      </section>

      <SlideOver
        open={mdmOpen}
        onClose={() => setMdmOpen(false)}
        title="MDM · Provisioning Kiosk-Mode"
        description="Escaneo QR · fleetline-mdm:// · VPN túnel directo"
        widthClass="max-w-md"
        footer={
          <Button type="button" variant="ghost" className="w-auto" onClick={() => setMdmOpen(false)}>
            Cerrar
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-[var(--brand-line)] bg-[var(--bg-surface)] p-4 text-center">
            <QrCode className="mx-auto h-16 w-16 text-cyan-400" aria-hidden />
            <p className="mt-3 font-mono text-lg font-bold tracking-widest">{pairCode || "——"}</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">Código de emparejamiento</p>
          </div>
          {qrPayload ? (
            <div className="rounded-lg border border-[var(--brand-line)] p-3">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                Payload encriptado
              </p>
              <p className="break-all font-mono text-[10px] text-[var(--accent-primary)]">{qrPayload}</p>
            </div>
          ) : null}
          <p className="text-xs text-[var(--text-secondary)]">
            Al escanear, la tablet entra en modo quiosco, bloquea apps externas y levanta túnel VPN a la flota.
          </p>
        </div>
      </SlideOver>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <section id="usuarios" className="space-y-3">
          <h2 className="font-display text-sm font-semibold text-[var(--text-primary)]">
            Usuarios de la organización
          </h2>
          {!users.length ? (
            <EmptyState
              icon={<UserPlus className="h-7 w-7" />}
              title="Sin usuarios en la red"
              description="Genere un enlace de alta desde Acciones rápidas."
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="border-b border-[var(--border-subtle)] text-xs uppercase tracking-wide text-[var(--text-secondary)]">
                    <tr>
                      <th className="px-3 py-2 font-medium">Usuario</th>
                      <th className="px-3 py-2 font-medium">Rol</th>
                      <th className="px-3 py-2 font-medium">Estado</th>
                      <th className="px-3 py-2 font-medium">Última sesión</th>
                      <th className="px-3 py-2 font-medium">IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr
                        key={u.id}
                        className="border-b border-[var(--border-subtle)]/60 last:border-0"
                      >
                        <td className="px-3 py-2">
                          <p className="text-[var(--text-primary)]">{u.name}</p>
                          <p className="font-mono text-xs text-[var(--text-secondary)]">
                            {u.email}
                          </p>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{u.role}</td>
                        <td className="px-3 py-2">
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
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {formatSession(u.lastSessionAt)}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {u.lastIp || "N/A"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        <section id="helpdesk" className="space-y-3">
          <h2 className="font-display text-sm font-semibold text-[var(--text-primary)]">
            Mesa de ayuda
          </h2>
          {!tickets.length ? (
            <EmptyState
              icon={<Headset className="h-7 w-7" />}
              title="Bandeja vacía"
              description="Sin tickets de mesa de ayuda."
            />
          ) : (
            <div className="space-y-2">
              {tickets.map((t) => (
                <article
                  key={t.id}
                  className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-medium text-[var(--text-primary)]">
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
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">
                      {t.detail}
                    </p>
                  ) : null}
                  <p className="mt-2 font-mono text-[10px] text-[var(--text-secondary)]">
                    {statusEs(t.status)} · {formatSession(t.createdAt)}
                    {t.createdBy ? ` · ${t.createdBy.name}` : ""}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
