"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@fsg/ui";
import { EMPLOYEE_AREA_GROUPS, EMPLOYEE_AREAS, EMPLOYEE_TITLES } from "@fsg/shared";
import { api } from "@/lib/api";
import { HowToBox, PageIntro } from "@/components/page-intro";

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

function semClass(s: Semaphore) {
  if (s === "GREEN") return "text-[var(--brand-primary)]";
  if (s === "AMBER") return "text-[var(--brand-amber)]";
  if (s === "RED") return "text-[var(--brand-signal)]";
  return "text-[var(--brand-muted)]";
}

function semLabel(s: Semaphore) {
  if (s === "GREEN") return "VIGENTE";
  if (s === "AMBER") return "POR VENCER";
  if (s === "RED") return "HARD-STOP";
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
  const [tab, setTab] = useState<TabId>("personal");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [rows, setRows] = useState<Emp[]>([]);
  const [drivers, setDrivers] = useState<DriverOpt[]>([]);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [error, setError] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    title: "",
    area: "",
    phone: "",
    email: "",
  });
  const [form, setForm] = useState({
    name: "",
    document: "",
    title: "Conductor",
    area: "Conductores / Flota",
    driverId: "",
  });
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
      setError(err instanceof Error ? err.message : "Fallo de uplink — RRHH"),
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
      setForm({
        name: "",
        document: "",
        title: "Conductor",
        area: "Conductores / Flota",
        driverId: "",
      });
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
      title: r.title || r.position,
      area: r.area,
      phone: r.phone ?? "",
      email: r.email ?? "",
    });
  }

  async function saveEdit(id: string) {
    setError("");
    try {
      await api(`/rrhh/employees/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editForm.name,
          title: editForm.title,
          area: editForm.area,
          phone: editForm.phone || null,
          email: editForm.email || null,
        }),
      });
      setEditingId(null);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar ficha");
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
          ? "Turno OPEN — uplink de fatiga activo"
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
      <PageIntro module="rrhh" title="Recursos Humanos / Expedientes" />
      <HowToBox
        steps={[
          "Expediente 360°: licencia C1/C2/C3 y semáforo de vencimiento.",
          "Monitor de fatiga: check-in/out; score ≥80 = Hard-Stop de despacho.",
          "Nómina: liquidar periodo desde turnos y viajes COMPLETED.",
          "Capacitaciones PESV quedan indexadas al conductor.",
        ]}
      />

      {overview ? (
        <div
          className="grid grid-cols-2 gap-3 md:grid-cols-5"
          data-testid="rrhh-kpis"
        >
          <Kpi
            label="Personal activo"
            value={String(overview.personalActivo)}
            hint="Expedientes ACTIVE"
          />
          <Kpi
            label="Fatiga alta"
            value={String(overview.fatigaAlta)}
            hint="Hard-Stop / score ≥80"
            alert={overview.fatigaAlta > 0}
          />
          <Kpi
            label="Licencias ≤30d"
            value={String(overview.licenciasPorVencer)}
            hint="Alerta de trámites"
            alert={overview.licenciasPorVencer > 0}
          />
          <Kpi
            label="Nómina (mes)"
            value={String(overview.novedadesNominaMes)}
            hint="Corridas indexadas"
          />
          <Kpi
            label="System Status"
            value={overview.systemStatus}
            hint="Nominal | Alert"
            alert={overview.systemStatus === "ALERT"}
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
          <form
            onSubmit={onCreate}
            className="fsg-panel grid grid-cols-1 gap-3 p-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
          >
            <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-[var(--brand-muted)]">
              Nombre
              <input
                className="field"
                placeholder="Nombre completo"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-[var(--brand-muted)]">
              Documento
              <input
                className="field font-data"
                placeholder="Cédula / ID"
                value={form.document}
                onChange={(e) => setForm({ ...form, document: e.target.value })}
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-[var(--brand-muted)]">
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
            <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-[var(--brand-muted)]">
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
            <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-[var(--brand-muted)]">
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
            <div className="flex items-end">
              <Button type="submit" variant="primary" className="w-full">
                Alta expediente
              </Button>
            </div>
          </form>

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
                    <tr key={r.id} className="border-t border-[var(--brand-line)]">
                      <td className="px-4 py-2.5">
                        {editingId === r.id ? (
                          <input
                            className="field py-1 text-xs"
                            value={editForm.name}
                            onChange={(e) =>
                              setEditForm({ ...editForm, name: e.target.value })
                            }
                          />
                        ) : (
                          <>
                            {r.name}
                            <div className="font-data text-[10px] text-[var(--brand-muted)]">
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
                            {r.blockReason || "DISPATCH_BLOCKED"}
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
                              {s}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2.5">
                        {editingId === r.id ? (
                          <div className="flex flex-wrap gap-1">
                            <Button
                              variant="primary"
                              onClick={() => void saveEdit(r.id)}
                            >
                              Guardar
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={() => setEditingId(null)}
                            >
                              Cancelar
                            </Button>
                          </div>
                        ) : (
                          <Button variant="ghost" onClick={() => startEdit(r)}>
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
        </section>
      ) : null}

      {tab === "fatiga" ? (
        <section className="space-y-4" data-testid="rrhh-panel-fatiga">
          <div className="fsg-panel flex flex-wrap items-end gap-3 p-4">
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
                    {d.dispatchBlocked ? " · BLOCKED" : ""}
                  </option>
                ))}
              </select>
            </div>
            <Button variant="primary" onClick={() => void shiftAction("check-in")}>
              Check-in turno
            </Button>
            <Button variant="ghost" onClick={() => void shiftAction("check-out")}>
              Check-out
            </Button>
            <Button variant="ghost" onClick={() => void auditLicenses()}>
              Auditar licencias
            </Button>
          </div>

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
                  <tr key={r.id} className="border-t border-[var(--brand-line)]">
                    <td className="px-4 py-2.5">
                      {r.name}
                      <div className="font-data text-[10px] text-[var(--brand-muted)]">
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
                          HARD-STOP · {r.blockReason || "BLOCKED"}
                        </span>
                      ) : (
                        <span className="text-[var(--brand-primary)]">
                          CLEARED
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "nomina" ? (
        <section className="space-y-4" data-testid="rrhh-panel-nomina">
          <form
            onSubmit={runPayroll}
            className="fsg-panel grid grid-cols-1 gap-3 p-4 md:grid-cols-4"
          >
            <div>
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
            <div>
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
            <div className="md:col-span-2 flex items-end">
              <Button type="submit" variant="primary">
                Calcular liquidación
              </Button>
            </div>
          </form>

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
                  <tr key={run.id} className="border-t border-[var(--brand-line)]">
                    <td className="px-4 py-2.5 font-data text-xs">
                      {new Date(run.periodStart).toLocaleDateString("es-CO")} →{" "}
                      {new Date(run.periodEnd).toLocaleDateString("es-CO")}
                    </td>
                    <td className="px-4 py-2.5 font-data text-xs">{run.status}</td>
                    <td className="px-4 py-2.5 font-data">{money(run.totalGross)}</td>
                    <td className="px-4 py-2.5 font-data">{money(run.totalNight)}</td>
                    <td className="px-4 py-2.5 font-data">
                      {money(run.totalOvertime)}
                    </td>
                    <td className="px-4 py-2.5 font-data text-xs">
                      {run.lines?.length ?? 0}
                    </td>
                  </tr>
                ))}
                {!runs.length ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-6 text-sm text-[var(--brand-muted)]"
                    >
                      Sin corridas. Calcula un periodo para indexar liquidación.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === "capacitaciones" ? (
        <section className="space-y-4" data-testid="rrhh-panel-capacitaciones">
          <form
            onSubmit={createTraining}
            className="fsg-panel grid grid-cols-1 gap-3 p-4 md:grid-cols-4"
          >
            <select
              className="field"
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
              className="field"
              placeholder="Tema (PESV, defensivo…)"
              value={trainingForm.topic}
              onChange={(e) =>
                setTrainingForm({ ...trainingForm, topic: e.target.value })
              }
              required
            />
            <input
              className="field"
              placeholder="Proveedor"
              value={trainingForm.provider}
              onChange={(e) =>
                setTrainingForm({ ...trainingForm, provider: e.target.value })
              }
            />
            <Button type="submit" variant="primary">
              Registrar capacitación
            </Button>
          </form>

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
                  <tr key={t.id} className="border-t border-[var(--brand-line)]">
                    <td className="px-4 py-2.5">{t.driver?.name ?? "—"}</td>
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
                {!trainings.length ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-6 text-sm text-[var(--brand-muted)]"
                    >
                      Sin registros PESV. Registra la primera capacitación.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  alert,
}: {
  label: string;
  value: string;
  hint: string;
  alert?: boolean;
}) {
  return (
    <div className="fsg-panel p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--brand-muted)]">
        {label}
      </p>
      <p
        className={`mt-1 font-data text-xl font-semibold ${
          alert ? "text-[var(--brand-signal)]" : "text-[var(--brand-fg)]"
        }`}
      >
        {value}
      </p>
      <p className="mt-0.5 text-[11px] text-[var(--brand-muted)]">{hint}</p>
    </div>
  );
}
