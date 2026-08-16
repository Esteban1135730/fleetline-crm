"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@fsg/ui";
import { EMPLOYEE_AREA_GROUPS, EMPLOYEE_AREAS, EMPLOYEE_TITLES, statusEs, systemStatusEs } from "@fsg/shared";
import { Users } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { EmptyState, KpiCard, SlideOver } from "@/components/audit";

type Semaphore = "GREEN" | "AMBER" | "RED" | "N_A";

type DriverLink = {
  id: string;
  name: string;
  document?: string;
  licenseNumber?: string | null;
  licenseCategory?: string | null;
  licenseExpiresAt?: string | null;
  fatigueScore: number;
  dispatchBlocked: boolean;
  blockReason?: string | null;
};

type Emp = {
  id: string;
  name: string;
  document: string;
  title: string;
  position: string;
  area: string;
  status: string;
  fatigueScore: number;
  phone?: string | null;
  email?: string | null;
  baseSalary?: number | string;
  hourlyRate?: number | string;
  driverId?: string | null;
  driver?: DriverLink | null;
  licenseSemaphore: Semaphore;
  fatigueSemaphore: Semaphore;
  dispatchBlocked: boolean;
  blockReason?: string | null;
};

type Overview = {
  personalActivo: number;
  fatigaAlta: number;
  licenciasPorVencer: number;
  novedadesNominaMes: number;
  systemStatus: "NOMINAL" | "ALERT";
};

type PayrollRun = {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  totalGross: number | string;
  totalNight: number | string;
  totalOvertime: number | string;
  createdAt: string;
  lines: Array<{
    id: string;
    grossTotal: number | string;
    employee?: { name: string; document: string };
  }>;
};

type Training = {
  id: string;
  topic: string;
  completedAt: string;
  expiresAt?: string | null;
  provider?: string | null;
  driver?: { id: string; name: string; document: string };
};

type DriverOpt = {
  id: string;
  name: string;
  document: string;
  fatigueScore: number;
  dispatchBlocked: boolean;
  licenseExpiresAt?: string | null;
  licenseCategory?: string | null;
};

type TabId = "personal" | "fatiga" | "nomina" | "capacitaciones";

const STATUSES = ["ACTIVE", "VACATION", "MEDICAL", "INACTIVE"] as const;

const TABS: Array<{ id: TabId; label: string; testId: string }> = [
  { id: "personal", label: "Personal & Expedientes", testId: "rrhh-tab-personal" },
  { id: "fatiga", label: "Monitor de Fatiga", testId: "rrhh-tab-fatiga" },
  { id: "nomina", label: "Nómina & Novedades", testId: "rrhh-tab-nomina" },
  {
    id: "capacitaciones",
    label: "Capacitaciones",
    testId: "rrhh-tab-capacitaciones",
  },
];

const EMPTY_FORM = {
  name: "",
  document: "",
  title: "Conductor",
  area: "Conductores / Flota",
  driverId: "",
};

function semClass(s: Semaphore) {
  if (s === "GREEN") return "text-[var(--brand-primary)]";
  if (s === "AMBER") return "text-[var(--brand-amber)]";
  if (s === "RED") return "text-[var(--brand-signal)]";
  return "text-[var(--brand-muted)]";
}

function semLabel(s: Semaphore) {
  if (s === "GREEN") return "VIGENTE";
  if (s === "AMBER") return "POR VENCER";
  if (s === "RED") return "BLOQUEO";
  return "N/A";
}

function fatLabel(s: Semaphore) {
  if (s === "GREEN") return "APTO";
  if (s === "AMBER") return "PAUSA";
  return "BLOQUEADO";
}

function money(v: number | string | undefined) {
  const n = Number(v ?? 0);
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function RrhhPage() {
  const { user } = useAuth();
  const canManageIdentity =
    user?.role === "platform_master" || user?.role === "org_admin";
  const [tab, setTab] = useState<TabId>("personal");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [rows, setRows] = useState<Emp[]>([]);
  const [drivers, setDrivers] = useState<DriverOpt[]>([]);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [error, setError] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [altaOpen, setAltaOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    document: "",
    title: "",
    area: "",
    phone: "",
    email: "",
  });
  const [form, setForm] = useState(EMPTY_FORM);
  const [shiftDriverId, setShiftDriverId] = useState("");
  const [payrollForm, setPayrollForm] = useState(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(1);
    return { periodStart: isoDate(start), periodEnd: isoDate(end) };
  });
  const [trainingForm, setTrainingForm] = useState({
    driverId: "",
    topic: "PESV — Fatiga operativa",
    provider: "FSG Academia",
  });

  const loadAll = useCallback(async () => {
    const [ov, emps, drvs, pay, caps] = await Promise.all([
      api<Overview>("/rrhh/overview"),
      api<Emp[]>("/rrhh/employees"),
      api<DriverOpt[]>("/rrhh/drivers"),
      api<PayrollRun[]>("/rrhh/payroll/runs"),
      api<Training[]>("/rrhh/trainings"),
    ]);
    setOverview(ov);
    setRows(emps);
    setDrivers(drvs);
    setRuns(pay);
    setTrainings(caps);
  }, []);

  useEffect(() => {
    void loadAll().catch((err) =>
      setError(err instanceof Error ? err.message : "Fallo de conexión — RRHH"),
    );
  }, [loadAll]);

  const linkedDrivers = useMemo(
    () => rows.filter((r) => r.driverId || r.driver),
    [rows],
  );

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api("/rrhh/employees", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          document: form.document,
          title: form.title,
          area: form.area,
          driverId: form.driverId || undefined,
        }),
      });
      setForm(EMPTY_FORM);
      setAltaOpen(false);
      setStatusMsg("Expediente indexado");
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear expediente");
    }
  }

  function startEdit(r: Emp) {
    setEditingId(r.id);
    setEditForm({
      name: r.name,
      document: r.document,
      title: r.title || r.position,
      area: r.area,
      phone: r.phone ?? "",
      email: r.email ?? "",
    });
  }

  async function saveEdit(id: string) {
    setError("");
    const prev = rows.find((r) => r.id === id);
    try {
      await api(`/rrhh/employees/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editForm.name,
          title: editForm.title,
          area: editForm.area,
          phone: editForm.phone || null,
          email: editForm.email || null,
          ...(canManageIdentity ? { document: editForm.document.trim() } : {}),
        }),
        confirm: {
          title: `Confirmar edición · ${editForm.name}`,
          previous: prev
            ? {
                name: prev.name,
                document: prev.document,
                title: prev.title || prev.position,
                area: prev.area,
                phone: prev.phone,
                email: prev.email,
              }
            : undefined,
        },
      });
      setEditingId(null);
      await loadAll();
    } catch (err) {
      if ((err as { name?: string })?.name === "MutationCancelled") return;
      setError(err instanceof Error ? err.message : "No se pudo guardar ficha");
    }
  }

  async function deleteEmployee(id: string, name: string) {
    if (!canManageIdentity) return;
    const prev = rows.find((r) => r.id === id);
    setError("");
    try {
      await api(`/rrhh/employees/${id}`, {
        method: "DELETE",
        confirm: {
          title: `Eliminar expediente · ${name}`,
          record: prev
            ? {
                name: prev.name,
                document: prev.document,
                title: prev.title || prev.position,
                area: prev.area,
                status: prev.status,
                phone: prev.phone,
                email: prev.email,
              }
            : { name },
        },
      });
      setEditingId(null);
      setStatusMsg("Expediente eliminado");
      await loadAll();
    } catch (err) {
      if ((err as { name?: string })?.name === "MutationCancelled") return;
      setError(
        err instanceof Error ? err.message : "No se pudo eliminar el expediente",
      );
    }
  }

  async function patchStatus(id: string, status: string) {
    await api(`/rrhh/employees/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    await loadAll();
  }

  async function auditLicenses() {
    setError("");
    try {
      const res = await api<{
        newlyBlocked: number;
        expiredFound: number;
        expiringSoon: number;
      }>("/rrhh/licenses/audit", { method: "POST", body: "{}" });
      setStatusMsg(
        `Auditoría licencias · bloqueados=${res.newlyBlocked} vencidas=${res.expiredFound} por vencer=${res.expiringSoon}`,
      );
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Auditoría fallida");
    }
  }

  async function shiftAction(kind: "check-in" | "check-out") {
    if (!shiftDriverId) {
      setError("Selecciona conductor para el turno");
      return;
    }
    setError("");
    try {
      await api(`/rrhh/shifts/${kind}`, {
        method: "POST",
        body: JSON.stringify({ driverId: shiftDriverId }),
      });
      setStatusMsg(
        kind === "check-in"
          ? "Turno abierto — fatiga en seguimiento"
          : "Turno CLOSED — score de fatiga recalculado",
      );
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fallo de turno");
    }
  }

  async function runPayroll(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api("/rrhh/payroll/calculate", {
        method: "POST",
        body: JSON.stringify({
          periodStart: new Date(payrollForm.periodStart).toISOString(),
          periodEnd: new Date(
            `${payrollForm.periodEnd}T23:59:59.999`,
          ).toISOString(),
        }),
      });
      setStatusMsg("Liquidación calculada — corrida indexada");
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fallo de liquidación");
    }
  }

  async function createTraining(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api("/rrhh/trainings", {
        method: "POST",
        body: JSON.stringify({
          driverId: trainingForm.driverId,
          topic: trainingForm.topic,
          provider: trainingForm.provider || undefined,
        }),
      });
      setTrainingForm({
        driverId: "",
        topic: "PESV — Fatiga operativa",
        provider: "FSG Academia",
      });
      setStatusMsg("Capacitación registrada");
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fallo de capacitación");
    }
  }

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title text-3xl font-bold text-[var(--text-primary)] md:text-4xl">
            Recursos Humanos
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Expedientes · fatiga · nómina · capacitaciones PESV
          </p>
        </div>
        {tab === "personal" ? (
          <Button
            type="button"
            variant="primary"
            className="w-auto px-4 py-2"
            data-testid="rrhh-alta-open"
            onClick={() => setAltaOpen(true)}
          >
            + Alta expediente
          </Button>
        ) : null}
      </header>

      {overview ? (
        <div
          className="grid grid-cols-2 gap-3 md:grid-cols-5"
          data-testid="rrhh-kpis"
        >
          <KpiCard
            label="Personal activo"
            value={overview.personalActivo}
            delta="Expedientes activos"
            tone="ok"
          />
          <KpiCard
            label="Fatiga alta"
            value={overview.fatigaAlta}
            delta="Bloqueo operativo / puntaje ≥80"
            tone={overview.fatigaAlta > 0 ? "danger" : "ok"}
          />
          <KpiCard
            label="Licencias ≤30d"
            value={overview.licenciasPorVencer}
            delta="Alerta de trámites"
            tone={overview.licenciasPorVencer > 0 ? "warn" : "ok"}
          />
          <KpiCard
            label="Nómina (mes)"
            value={overview.novedadesNominaMes}
            delta="Corridas indexadas"
          />
          <KpiCard
            label="Estado del sistema"
            value={systemStatusEs(overview.systemStatus)}
            delta="Nominal | Alerta"
            tone={overview.systemStatus === "ALERT" ? "danger" : "ok"}
          />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 border-b border-[var(--brand-line)] pb-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            data-testid={t.testId}
            onClick={() => setTab(t.id)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              tab === t.id
                ? "bg-[var(--brand-primary)] text-[#04110c]"
                : "text-[var(--brand-muted)] hover:text-[var(--brand-fg)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {statusMsg ? (
        <p className="font-data text-xs text-[var(--brand-primary)]">{statusMsg}</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-[var(--brand-signal)]">
          {error}
        </p>
      ) : null}

      {tab === "personal" ? (
        <section className="space-y-4" data-testid="rrhh-panel-personal">
          {!rows.length ? (
            <EmptyState
              icon={<Users className="h-7 w-7" />}
              title="Sin expedientes"
              description="Indexa el primer expediente de capital humano."
              actionLabel="+ Alta expediente"
              onAction={() => setAltaOpen(true)}
            />
          ) : (
            <div className="fsg-panel data-shell overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th className="px-4 py-2">Nombre</th>
                    <th className="px-4 py-2">Cargo</th>
                    <th className="px-4 py-2">Licencia</th>
                    <th className="px-4 py-2">Fatiga</th>
                    <th className="px-4 py-2">Estado</th>
                    <th className="px-4 py-2">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const licExp = r.driver?.licenseExpiresAt;
                    return (
                      <tr
                        key={r.id}
                        className="border-t border-[var(--brand-line)]"
                      >
                        <td className="px-4 py-2.5">
                          {editingId === r.id ? (
                            <div className="space-y-1">
                              <input
                                className="field py-1 text-xs"
                                value={editForm.name}
                                onChange={(e) =>
                                  setEditForm({
                                    ...editForm,
                                    name: e.target.value,
                                  })
                                }
                                aria-label="Nombre"
                              />
                              {canManageIdentity ? (
                                <input
                                  className="field py-1 font-data text-xs"
                                  value={editForm.document}
                                  onChange={(e) =>
                                    setEditForm({
                                      ...editForm,
                                      document: e.target.value,
                                    })
                                  }
                                  placeholder="Documento / cédula"
                                  aria-label="Número de documento"
                                />
                              ) : (
                                <div className="text-sm text-[var(--text-secondary)]">
                                  {r.document}
                                </div>
                              )}
                            </div>
                          ) : (
                            <>
                              <div className="font-bold text-[var(--text-primary)]">{r.name}</div>
                              <div className="text-sm text-[var(--text-secondary)]">
                                {r.document}
                              </div>
                            </>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {editingId === r.id ? (
                            <div className="space-y-1">
                              <select
                                className="field py-1 text-xs"
                                value={editForm.title}
                                onChange={(e) =>
                                  setEditForm({
                                    ...editForm,
                                    title: e.target.value,
                                  })
                                }
                              >
                                {!EMPLOYEE_TITLES.includes(
                                  editForm.title as (typeof EMPLOYEE_TITLES)[number],
                                ) && editForm.title ? (
                                  <option value={editForm.title}>
                                    {editForm.title}
                                  </option>
                                ) : null}
                                {EMPLOYEE_TITLES.map((t) => (
                                  <option key={t} value={t}>
                                    {t}
                                  </option>
                                ))}
                              </select>
                              <select
                                className="field py-1 text-xs"
                                value={editForm.area}
                                onChange={(e) =>
                                  setEditForm({
                                    ...editForm,
                                    area: e.target.value,
                                  })
                                }
                              >
                                {!EMPLOYEE_AREAS.includes(
                                  editForm.area as (typeof EMPLOYEE_AREAS)[number],
                                ) && editForm.area ? (
                                  <option value={editForm.area}>
                                    {editForm.area}
                                  </option>
                                ) : null}
                                {EMPLOYEE_AREA_GROUPS.map((g) => (
                                  <optgroup key={g.label} label={g.label}>
                                    {g.areas.map((a) => (
                                      <option key={a} value={a}>
                                        {a}
                                      </option>
                                    ))}
                                  </optgroup>
                                ))}
                              </select>
                            </div>
                          ) : (
                            `${r.title || r.position} · ${r.area}`
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            data-testid="rrhh-license-badge"
                            className={`font-data text-xs font-semibold ${semClass(r.licenseSemaphore)}`}
                          >
                            {semLabel(r.licenseSemaphore)}
                          </span>
                          {r.driver ? (
                            <div className="font-data text-[10px] text-[var(--brand-muted)]">
                              {r.driver.licenseCategory || "—"} ·{" "}
                              {licExp
                                ? new Date(licExp).toLocaleDateString("es-CO")
                                : "sin fecha"}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            data-testid="rrhh-fatigue-badge"
                            className={`font-data text-xs font-semibold ${semClass(r.fatigueSemaphore)}`}
                          >
                            {fatLabel(r.fatigueSemaphore)} {r.fatigueScore}
                          </span>
                          {r.dispatchBlocked ? (
                            <div className="text-[10px] text-[var(--brand-signal)]">
                              {r.blockReason ? statusEs(r.blockReason) : "Despacho bloqueado"}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-2.5">
                          <select
                            className="field py-1 text-xs"
                            value={r.status}
                            onChange={(e) =>
                              void patchStatus(r.id, e.target.value)
                            }
                          >
                            {STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {statusEs(s)}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-2.5">
                          {editingId === r.id ? (
                            <div className="flex flex-wrap gap-1">
                              <Button
                                variant="primary"
                                className="w-auto"
                                onClick={() => void saveEdit(r.id)}
                              >
                                Guardar
                              </Button>
                              <Button
                                variant="ghost"
                                className="w-auto"
                                onClick={() => setEditingId(null)}
                              >
                                Cancelar
                              </Button>
                              {canManageIdentity ? (
                                <Button
                                  variant="danger"
                                  className="w-auto"
                                  onClick={() =>
                                    void deleteEmployee(r.id, r.name)
                                  }
                                >
                                  Eliminar
                                </Button>
                              ) : null}
                            </div>
                          ) : (
                            <Button
                              variant="ghost"
                              className="w-auto"
                              onClick={() => startEdit(r)}
                            >
                              Editar ficha
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {tab === "fatiga" ? (
        <section className="space-y-4" data-testid="rrhh-panel-fatiga">
          <div className="fsg-panel flex flex-wrap items-end justify-end gap-3 p-4">
            <div className="min-w-[220px] flex-1">
              <label className="mb-1 block text-xs text-[var(--brand-muted)]">
                Conductor
              </label>
              <select
                className="field"
                value={shiftDriverId}
                onChange={(e) => setShiftDriverId(e.target.value)}
              >
                <option value="">Seleccionar…</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} · fatiga {d.fatigueScore}
                    {d.dispatchBlocked ? " · bloqueado" : ""}
                  </option>
                ))}
              </select>
            </div>
            <Button
              variant="primary"
              className="w-auto px-4 py-2"
              onClick={() => void shiftAction("check-in")}
            >
              Entrada de turno
            </Button>
            <Button
              variant="ghost"
              className="w-auto px-4 py-2"
              onClick={() => void shiftAction("check-out")}
            >
              Salida de turno
            </Button>
            <Button
              variant="ghost"
              className="w-auto px-4 py-2"
              onClick={() => void auditLicenses()}
            >
              Auditar licencias
            </Button>
          </div>

          {!linkedDrivers.length ? (
            <EmptyState
              title="Sin conductores vinculados"
              description="Vincula expedientes a flota para monitorear fatiga."
            />
          ) : (
            <div className="fsg-panel data-shell overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th className="px-4 py-2">Conductor</th>
                    <th className="px-4 py-2">Score</th>
                    <th className="px-4 py-2">Aptitud</th>
                    <th className="px-4 py-2">Licencia</th>
                    <th className="px-4 py-2">Despacho</th>
                  </tr>
                </thead>
                <tbody>
                  {linkedDrivers.map((r) => (
                    <tr
                      key={r.id}
                      className="border-t border-[var(--brand-line)]"
                    >
                      <td className="px-4 py-2.5">
                        <div className="font-bold text-[var(--text-primary)]">{r.name}</div>
                        <div className="text-sm text-[var(--text-secondary)]">
                          {r.driver?.document || r.document}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 font-data">{r.fatigueScore}</td>
                      <td
                        className={`px-4 py-2.5 font-data text-xs ${semClass(r.fatigueSemaphore)}`}
                      >
                        {fatLabel(r.fatigueSemaphore)}
                      </td>
                      <td
                        className={`px-4 py-2.5 font-data text-xs ${semClass(r.licenseSemaphore)}`}
                      >
                        {semLabel(r.licenseSemaphore)}
                      </td>
                      <td className="px-4 py-2.5 font-data text-xs">
                        {r.dispatchBlocked ? (
                          <span className="text-[var(--brand-signal)]">
                            Bloqueo operativo · {r.blockReason ? statusEs(r.blockReason) : "Bloqueado"}
                          </span>
                        ) : (
                          <span className="text-[var(--brand-primary)]">
                            Liberado
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {tab === "nomina" ? (
        <section className="space-y-4" data-testid="rrhh-panel-nomina">
          <form
            onSubmit={runPayroll}
            className="fsg-panel flex flex-wrap items-end justify-end gap-3 p-4"
          >
            <div className="min-w-[160px]">
              <label className="mb-1 block text-xs text-[var(--brand-muted)]">
                Periodo desde
              </label>
              <input
                type="date"
                className="field font-data"
                value={payrollForm.periodStart}
                onChange={(e) =>
                  setPayrollForm({
                    ...payrollForm,
                    periodStart: e.target.value,
                  })
                }
                required
              />
            </div>
            <div className="min-w-[160px]">
              <label className="mb-1 block text-xs text-[var(--brand-muted)]">
                Periodo hasta
              </label>
              <input
                type="date"
                className="field font-data"
                value={payrollForm.periodEnd}
                onChange={(e) =>
                  setPayrollForm({ ...payrollForm, periodEnd: e.target.value })
                }
                required
              />
            </div>
            <Button type="submit" variant="primary" className="w-auto px-4 py-2">
              Calcular liquidación
            </Button>
          </form>

          {!runs.length ? (
            <EmptyState
              title="Sin corridas de nómina"
              description="Calcula un periodo para indexar liquidación."
            />
          ) : (
            <div className="fsg-panel data-shell overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th className="px-4 py-2">Periodo</th>
                    <th className="px-4 py-2">Estado</th>
                    <th className="px-4 py-2">Bruto</th>
                    <th className="px-4 py-2">Nocturno</th>
                    <th className="px-4 py-2">Extras</th>
                    <th className="px-4 py-2">Líneas</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr
                      key={run.id}
                      className="border-t border-[var(--brand-line)]"
                    >
                      <td className="px-4 py-2.5 font-data text-xs">
                        {new Date(run.periodStart).toLocaleDateString("es-CO")} →{" "}
                        {new Date(run.periodEnd).toLocaleDateString("es-CO")}
                      </td>
                      <td className="px-4 py-2.5 font-data text-xs">
                        {statusEs(run.status)}
                      </td>
                      <td className="px-4 py-2.5 font-data">
                        {money(run.totalGross)}
                      </td>
                      <td className="px-4 py-2.5 font-data">
                        {money(run.totalNight)}
                      </td>
                      <td className="px-4 py-2.5 font-data">
                        {money(run.totalOvertime)}
                      </td>
                      <td className="px-4 py-2.5 font-data text-xs">
                        {run.lines?.length ?? 0}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {tab === "capacitaciones" ? (
        <section className="space-y-4" data-testid="rrhh-panel-capacitaciones">
          <form
            onSubmit={createTraining}
            className="fsg-panel flex flex-wrap items-end justify-end gap-3 p-4"
          >
            <select
              className="field min-w-[180px]"
              value={trainingForm.driverId}
              onChange={(e) =>
                setTrainingForm({ ...trainingForm, driverId: e.target.value })
              }
              required
            >
              <option value="">Conductor…</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <input
              className="field min-w-[180px]"
              placeholder="Tema (PESV, defensivo…)"
              value={trainingForm.topic}
              onChange={(e) =>
                setTrainingForm({ ...trainingForm, topic: e.target.value })
              }
              required
            />
            <input
              className="field min-w-[140px]"
              placeholder="Proveedor"
              value={trainingForm.provider}
              onChange={(e) =>
                setTrainingForm({ ...trainingForm, provider: e.target.value })
              }
            />
            <Button type="submit" variant="primary" className="w-auto px-4 py-2">
              Registrar capacitación
            </Button>
          </form>

          {!trainings.length ? (
            <EmptyState
              title="Sin registros PESV"
              description="Registra la primera capacitación."
            />
          ) : (
            <div className="fsg-panel data-shell overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th className="px-4 py-2">Conductor</th>
                    <th className="px-4 py-2">Tema</th>
                    <th className="px-4 py-2">Completada</th>
                    <th className="px-4 py-2">Vence</th>
                    <th className="px-4 py-2">Proveedor</th>
                  </tr>
                </thead>
                <tbody>
                  {trainings.map((t) => (
                    <tr
                      key={t.id}
                      className="border-t border-[var(--brand-line)]"
                    >
                      <td className="px-4 py-2.5">
                        <div className="font-bold text-[var(--text-primary)]">
                          {t.driver?.name ?? "—"}
                        </div>
                        {t.driver?.document ? (
                          <div className="text-sm text-[var(--text-secondary)]">
                            {t.driver.document}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5">{t.topic}</td>
                      <td className="px-4 py-2.5 font-data text-xs">
                        {new Date(t.completedAt).toLocaleDateString("es-CO")}
                      </td>
                      <td className="px-4 py-2.5 font-data text-xs">
                        {t.expiresAt
                          ? new Date(t.expiresAt).toLocaleDateString("es-CO")
                          : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-[var(--brand-muted)]">
                        {t.provider || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      <SlideOver
        open={altaOpen}
        onClose={() => setAltaOpen(false)}
        title="Alta expediente"
        description="Capital humano · vínculo flota opcional"
        widthClass="max-w-lg"
        footer={
          <Button
            type="submit"
            form="rrhh-alta-form"
            variant="primary"
            className="w-auto px-4 py-2"
          >
            Indexar expediente
          </Button>
        }
      >
        <form
          id="rrhh-alta-form"
          onSubmit={onCreate}
          className="grid grid-cols-1 gap-3"
        >
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-[var(--text-secondary)]">
            Nombre
            <input
              className="field"
              placeholder="Nombre completo"
              data-field="personName"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              autoComplete="name"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-[var(--text-secondary)]">
            Documento
            <input
              className="field font-data"
              placeholder="Cédula / documento"
              data-field="document"
              inputMode="numeric"
              value={form.document}
              onChange={(e) => setForm({ ...form, document: e.target.value })}
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-[var(--text-secondary)]">
            Cargo
            <select
              className="field"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            >
              {EMPLOYEE_TITLES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-[var(--text-secondary)]">
            Área / departamento
            <select
              className="field"
              value={form.area}
              onChange={(e) => setForm({ ...form, area: e.target.value })}
            >
              {EMPLOYEE_AREA_GROUPS.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.areas.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-[var(--text-secondary)]">
            Vínculo flota
            <select
              className="field"
              value={form.driverId}
              onChange={(e) => setForm({ ...form, driverId: e.target.value })}
            >
              <option value="">Sin vínculo conductor</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} · {d.document}
                </option>
              ))}
            </select>
          </label>
        </form>
      </SlideOver>
    </div>
  );
}
