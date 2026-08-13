"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { Headset, Mail, QrCode, UserPlus } from "lucide-react";
import { api } from "@/lib/api";
import { PageIntro } from "@/components/page-intro";
import { Can } from "@/lib/permissions";
import { EmptyState, StatusPulseBadge } from "@/components/audit";

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
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [onboardEmail, setOnboardEmail] = useState("");
  const [onboardRole, setOnboardRole] = useState("conductor");
  const [onboardUrl, setOnboardUrl] = useState("");
  const [qrPayload, setQrPayload] = useState("");
  const [pairCode, setPairCode] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [h, u, t] = await Promise.all([
        api<Health>("/api/v1/ti/system-health"),
        api<UserRow[]>("/api/v1/ti/usuarios"),
        api<Ticket[]>("/api/v1/ti/helpdesk/tickets"),
      ]);
      setHealth(h);
      setUsers(u);
      setTickets(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Uplink TI fallido");
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
        `Link de un solo uso generado · expira ${formatSession(res.expiresAt)}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error onboarding");
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
      setInfo(
        `QR MDM listo · código ${res.pairCode} · expira ${formatSession(res.expiresAt)}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error MDM");
    }
  }

  const priorityBadge = (p: string) => {
    const u = p.toUpperCase();
    if (u === "HIGH" || u === "ALTA") return "danger" as const;
    if (u === "LOW" || u === "BAJA") return "neutral" as const;
    return "fatiga" as const;
  };

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-5">
      <PageIntro module="tecnologia_ti" title="Centro de Control TI" />

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

      <section className="space-y-3" id="integraciones">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-sm font-semibold tracking-tight text-[var(--text-primary)]">
            Salud de infraestructura
          </h2>
          <Button
            type="button"
            variant="ghost"
            className="w-auto px-3 py-1.5 text-xs"
            onClick={() => void load()}
          >
            Refrescar uplink
          </Button>
        </div>
        {health ? (
          <>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6">
              <Semaforo
                s={health.server.cpu.semaphore}
                label={`CPU ${health.server.cpu.pct}%`}
                critical
              />
              <Semaforo
                s={health.server.memory.semaphore}
                label={`Mem ${health.server.memory.pct}% · ${health.server.memory.rssMb} MB`}
                critical
              />
              <Semaforo
                s={health.overallSemaphore}
                label={`NOC ${health.overall}`}
              />
              {(health.externalApis || []).map((a) => (
                <Semaforo key={a.name} s={a.semaphore} label={a.name} />
              ))}
            </div>
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
              {(health.infrastructure || []).map((s) => (
                <div
                  key={s.name}
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs uppercase text-[var(--text-secondary)]">
                      {s.name}
                    </span>
                    <span
                      className={`h-2 w-2 rounded-full ${SEM_CLASS[s.semaphore]}`}
                    />
                  </div>
                  <p className="mt-1 font-mono text-sm text-[var(--text-primary)]">
                    {s.status}
                    {typeof s.latencyMs === "number"
                      ? ` · ${s.latencyMs} ms`
                      : ""}
                  </p>
                </div>
              ))}
            </div>
            <p className="font-mono text-xs text-[var(--text-secondary)]">
              DLQ Kafka pendiente: {health.dlqPending} · check{" "}
              {formatSession(health.checkedAt)} · uptime{" "}
              {health.server.uptimeSec}s
            </p>
          </>
        ) : (
          <p className="text-sm text-[var(--text-secondary)]">
            Sincronizando telemetría…
          </p>
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
                    Email
                  </label>
                  <Mail
                    className="pointer-events-none absolute bottom-2.5 left-3 h-4 w-4 text-slate-500"
                    aria-hidden
                  />
                  <input
                    className="w-full rounded-lg border border-[var(--border-subtle)] bg-transparent py-2 pl-9 pr-3 text-sm"
                    placeholder="email nuevo usuario"
                    type="email"
                    required
                    value={onboardEmail}
                    onChange={(e) => setOnboardEmail(e.target.value)}
                    aria-label="Email"
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
                  Onboarding
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
                QR MDM
              </Button>
            </Can>
          </div>
          {onboardUrl ? (
            <p className="break-all font-mono text-xs text-[var(--text-secondary)]">
              {onboardUrl}
            </p>
          ) : null}
          {pairCode ? (
            <p className="font-mono text-sm text-[var(--text-primary)]">
              Código MDM: {pairCode}
            </p>
          ) : null}
          {qrPayload ? (
            <p className="break-all font-mono text-[10px] text-[var(--text-secondary)]">
              {qrPayload}
            </p>
          ) : null}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <section id="usuarios" className="space-y-3">
          <h2 className="font-display text-sm font-semibold text-[var(--text-primary)]">
            Usuarios de la organización
          </h2>
          {!users.length ? (
            <EmptyState
              icon={<UserPlus className="h-7 w-7" />}
              title="Sin usuarios en uplink"
              description="Genere un link de onboarding desde Acciones Rápidas."
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
                            {u.status}
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
              description="Sin tickets de help desk en uplink."
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
                    {t.status} · {formatSession(t.createdAt)}
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
