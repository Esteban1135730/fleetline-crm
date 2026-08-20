"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@fsg/ui";
import {
  cargosForEmployeeArea,
  employeeAreaForCargo,
  isKnownEmployeeArea,
  roleForEmployeeCargo,
  statusEs,
  systemStatusEs,
  type Role,
} from "@fsg/shared";
import { Users, ShieldAlert, FileSpreadsheet } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { EmptyState, KpiCard, Modal, SlideOver, StatusPulseBadge } from "@/components/audit";
import {
  EMPTY_EMPLOYEE_FORM,
  EmployeeFormFields,
  employeeFormToPayload,
  type EmployeeFormValues,
} from "@/components/rrhh/employee-form-fields";
import { EmployeeDocumentsPanel } from "@/components/rrhh/employee-documents-panel";
import { EmployeeExcelPanel } from "@/components/rrhh/employee-excel-panel";

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

type EmpUser = {
  id: string;
  email: string;
  role: Role;
  active: boolean;
  status?: string;
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
  user?: EmpUser | null;
  address?: string | null;
  city?: string | null;
  contractType?: string | null;
  hireDate?: string | null;
  eps?: string | null;
  arl?: string | null;
  pensionFund?: string | null;
  compensationFund?: string | null;
  bankName?: string | null;
  bankAccountType?: string | null;
  bankAccountNumber?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelation?: string | null;
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

const DEFAULT_AREA = "Operaciones";

function resolveAreaForForm(area: string, title: string): string {
  if (isKnownEmployeeArea(area)) return area;
  return employeeAreaForCargo(title) ?? DEFAULT_AREA;
}

function resolveCargoForArea(area: string, title: string): string {
  const cargos = cargosForEmployeeArea(area);
  if (cargos.includes(title)) return title;
  return cargos[0] ?? title;
}

function empToForm(r: Emp): EmployeeFormValues {
  const title = r.title || r.position;
  const area = resolveAreaForForm(r.area, title);
  return {
    ...EMPTY_EMPLOYEE_FORM,
    name: r.name,
    document: r.document,
    email: r.email ?? r.user?.email ?? "",
    phone: r.phone ?? "",
    area,
    title: resolveCargoForArea(area, title),
    role: roleForEmployeeCargo(title) as Role,
    contractType: r.contractType ?? EMPTY_EMPLOYEE_FORM.contractType,
    hireDate: r.hireDate
      ? new Date(r.hireDate).toISOString().slice(0, 10)
      : EMPTY_EMPLOYEE_FORM.hireDate,
    baseSalary: r.baseSalary ? String(r.baseSalary) : "",
    hourlyRate: r.hourlyRate ? String(r.hourlyRate) : "",
    address: r.address ?? "",
    city: r.city ?? "",
    eps: r.eps ?? "",
    arl: r.arl ?? "",
    pensionFund: r.pensionFund ?? "",
    compensationFund: r.compensationFund ?? "",
    bankName: r.bankName ?? "",
    bankAccountType: r.bankAccountType ?? EMPTY_EMPLOYEE_FORM.bankAccountType,
    bankAccountNumber: r.bankAccountNumber ?? "",
    emergencyContactName: r.emergencyContactName ?? "",
    emergencyContactPhone: r.emergencyContactPhone ?? "",
    emergencyContactRelation: r.emergencyContactRelation ?? "",
    driverId: r.driverId ?? "",
  };
}

function semPulseTone(
  s: Semaphore,
): "active" | "fatiga" | "danger" | "neutral" {
  if (s === "GREEN") return "active";
  if (s === "AMBER") return "fatiga";
  if (s === "RED") return "danger";
  return "neutral";
}

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
    user?.role === "platform_master" ||
    user?.role === "org_admin" ||
    user?.role === "vinculaciones";
  const [tab, setTab] = useState<TabId>("personal");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [rows, setRows] = useState<Emp[]>([]);
  const [drivers, setDrivers] = useState<DriverOpt[]>([]);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [error, setError] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [auditStats, setAuditStats] = useState<{
    newlyBlocked: number;
    expiredFound: number;
    expiringSoon: number;
  } | null>(null);
  const [altaOpen, setAltaOpen] = useState(false);
  const [excelOpen, setExcelOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [docsEmployee, setDocsEmployee] = useState<Emp | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingUserActive, setEditingUserActive] = useState(true);
  const [form, setForm] = useState<EmployeeFormValues>(EMPTY_EMPLOYEE_FORM);
  const [editForm, setEditForm] = useState<EmployeeFormValues>(EMPTY_EMPLOYEE_FORM);
  const [provisionResult, setProvisionResult] = useState<{
    name: string;
    email: string;
    tempPassword?: string;
    pending?: boolean;
  } | null>(null);
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

  const pesvCompliance = useMemo(() => {
    if (!drivers.length) return 0;
    const trained = new Set(
      trainings.map((t) => t.driver?.id).filter(Boolean) as string[],
    );
    return Math.round((trained.size / drivers.length) * 100);
  }, [drivers, trainings]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const res = await api<{
        tempPassword?: string;
        pendingAuthorization?: boolean;
        message?: string;
      }>("/rrhh/employees/provision", {
        method: "POST",
        body: JSON.stringify(employeeFormToPayload(form)),
      });
      setProvisionResult({
        name: form.name,
        email: form.email,
        tempPassword: res.tempPassword,
        pending: res.pendingAuthorization,
      });
      setForm(EMPTY_EMPLOYEE_FORM);
      setAltaOpen(false);
      setStatusMsg(res.message ?? "Expediente y acceso provisionados");
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo provisionar expediente");
    }
  }

  function startEdit(r: Emp) {
    setEditingId(r.id);
    setEditingUserActive(r.user?.active ?? true);
    setEditForm(empToForm(r));
    setEditOpen(true);
  }

  function closeEdit() {
    setEditOpen(false);
    setEditingId(null);
  }

  async function saveEdit(id: string) {
    setError("");
    const prev = rows.find((r) => r.id === id);
    try {
      await api(`/rrhh/employees/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...employeeFormToPayload(editForm),
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
      setEditOpen(false);
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
      await api(`/rrhh/employees/${id}/terminate`, {
        method: "POST",
        body: JSON.stringify({ reason: "Salida de empresa" }),
        confirm: {
          title: `Dar de baja · ${name}`,
          record: prev
            ? {
                name: prev.name,
                document: prev.document,
                title: prev.title || prev.position,
                area: prev.area,
                status: prev.status,
                email: prev.email ?? prev.user?.email,
              }
            : { name },
        },
      });
      setEditingId(null);
      setEditOpen(false);
      setStatusMsg("Expediente dado de baja — acceso inactivo");
      await loadAll();
    } catch (err) {
      if ((err as { name?: string })?.name === "MutationCancelled") return;
      setError(
        err instanceof Error ? err.message : "No se pudo dar de baja el expediente",
      );
    }
  }

  async function toggleAccess(id: string, suspend: boolean) {
    setError("");
    try {
      await api(`/rrhh/employees/${id}/access/${suspend ? "suspend" : "restore"}`, {
        method: "POST",
        body: "{}",
      });
      setStatusMsg(suspend ? "Acceso suspendido" : "Acceso restaurado");
      await loadAll();
      const row = rows.find((r) => r.id === id);
      if (row) {
        setEditingUserActive(!suspend);
        setEditForm(empToForm({ ...row, user: row.user ? { ...row.user, active: !suspend } : null }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar acceso");
    }
  }

  async function resetPassword(id: string) {
    setError("");
    try {
      const res = await api<{ tempPassword: string }>(
        `/rrhh/employees/${id}/reset-password`,
        { method: "POST", body: "{}" },
      );
      const row = rows.find((r) => r.id === id);
      setProvisionResult({
        name: row?.name ?? "Empleado",
        email: row?.email ?? row?.user?.email ?? "",
        tempPassword: res.tempPassword,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo resetear clave");
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
      setAuditStats({
        newlyBlocked: res.newlyBlocked,
        expiredFound: res.expiredFound,
        expiringSoon: res.expiringSoon,
      });
      setStatusMsg("Auditoría de licencias completada");
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
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              className="w-auto px-4 py-2"
              data-testid="rrhh-excel-open"
              onClick={() => setExcelOpen(true)}
            >
              <FileSpreadsheet className="mr-1.5 h-4 w-4" aria-hidden />
              Excel
            </Button>
            <Button
              type="button"
              variant="primary"
              className="w-auto px-4 py-2"
              data-testid="rrhh-alta-open"
              onClick={() => setAltaOpen(true)}
            >
              + Nuevo empleado
            </Button>
          </div>
        ) : null}
      </header>

      <EmployeeExcelPanel
        open={excelOpen}
        onClose={() => setExcelOpen(false)}
        onImported={() => {
          setStatusMsg("Importación Excel procesada");
          void loadAll();
        }}
      />

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

      <div
        className="fsg-panel flex flex-wrap items-center gap-3 border border-[color-mix(in_srgb,var(--accent-primary)_25%,transparent)] bg-[color-mix(in_srgb,var(--accent-primary)_6%,transparent)] p-3"
        data-testid="rrhh-audit-banner"
      >
        <ShieldAlert className="h-5 w-5 shrink-0 text-[var(--accent-primary)]" />
        <span className="text-sm font-semibold text-[var(--text-primary)]">
          Auditoría de licencias y documentos
        </span>
        <div className="flex flex-wrap gap-2 text-xs font-medium">
          <span className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] px-2 py-0.5 font-data tabular-nums">
            Bloqueados: {auditStats?.newlyBlocked ?? overview?.fatigaAlta ?? 0}
          </span>
          <span className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] px-2 py-0.5 font-data tabular-nums">
            Vencidas: {auditStats?.expiredFound ?? 0}
          </span>
          <span className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] px-2 py-0.5 font-data tabular-nums">
            Por vencer:{" "}
            {auditStats?.expiringSoon ?? overview?.licenciasPorVencer ?? 0}
          </span>
        </div>
      </div>

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
        <p
          role="status"
          className="rounded-lg border border-[color-mix(in_srgb,var(--accent-primary)_30%,transparent)] bg-[color-mix(in_srgb,var(--accent-primary)_8%,transparent)] px-3 py-2 text-sm text-[var(--accent-primary)]"
        >
          {statusMsg}
        </p>
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
              actionLabel="+ Nuevo empleado"
              onAction={() => setAltaOpen(true)}
            />
          ) : (
            <div className="fsg-panel data-shell max-w-full overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr>
                    <th className="px-4 py-2">Nombre</th>
                    <th className="px-4 py-2">Cargo</th>
                    <th className="px-4 py-2">Acceso</th>
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
                          <div className="font-bold text-[var(--text-primary)]">{r.name}</div>
                          <div className="text-sm text-[var(--text-secondary)]">
                            {r.document}
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          {`${r.title || r.position} · ${r.area}`}
                        </td>
                        <td className="px-4 py-2.5">
                          {r.user ? (
                            <>
                              <div className="font-data text-xs text-[var(--text-primary)]">
                                {r.user.email}
                              </div>
                              <StatusPulseBadge
                                tone={r.user.active ? "active" : "neutral"}
                                pulse={false}
                              >
                                {r.user.active ? "ACTIVO" : "SUSPENDIDO"}
                              </StatusPulseBadge>
                            </>
                          ) : (
                            <span className="text-xs text-[var(--brand-muted)]">
                              Sin usuario
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <StatusPulseBadge
                            tone={semPulseTone(r.licenseSemaphore)}
                            pulse={r.licenseSemaphore === "RED"}
                          >
                            {semLabel(r.licenseSemaphore)}
                          </StatusPulseBadge>
                          {r.driver ? (
                            <div className="mt-1 font-data text-[10px] text-[var(--brand-muted)]">
                              {r.driver.licenseCategory || "—"} ·{" "}
                              {licExp
                                ? new Date(licExp).toLocaleDateString("es-CO")
                                : "sin fecha"}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-2.5">
                          <StatusPulseBadge
                            tone={semPulseTone(r.fatigueSemaphore)}
                            pulse={r.fatigueSemaphore === "RED"}
                          >
                            {fatLabel(r.fatigueSemaphore)} {r.fatigueScore}
                          </StatusPulseBadge>
                          {r.dispatchBlocked ? (
                            <div className="mt-1 text-[10px] text-[var(--brand-signal)]">
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
                          <div className="flex flex-wrap gap-1">
                            <Button
                              variant="ghost"
                              className="w-auto"
                              onClick={() => startEdit(r)}
                            >
                              Editar
                            </Button>
                            <Button
                              variant="ghost"
                              className="w-auto"
                              onClick={() => {
                                setDocsEmployee(r);
                                setDocsOpen(true);
                              }}
                            >
                              Documentos
                            </Button>
                          </div>
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
            <div className="fsg-panel data-shell max-w-full overflow-x-auto">
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
                      <td className="px-4 py-2.5">
                        <StatusPulseBadge tone={semPulseTone(r.fatigueSemaphore)}>
                          {fatLabel(r.fatigueSemaphore)}
                        </StatusPulseBadge>
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusPulseBadge
                          tone={semPulseTone(r.licenseSemaphore)}
                          pulse={r.licenseSemaphore === "RED"}
                        >
                          {semLabel(r.licenseSemaphore)}
                        </StatusPulseBadge>
                      </td>
                      <td className="px-4 py-2.5">
                        {r.dispatchBlocked ? (
                          <StatusPulseBadge tone="danger" pulse>
                            Bloqueo operativo
                          </StatusPulseBadge>
                        ) : (
                          <StatusPulseBadge tone="active" pulse={false}>
                            Liberado
                          </StatusPulseBadge>
                        )}
                        {r.dispatchBlocked && r.blockReason ? (
                          <div className="mt-1 text-[10px] text-[var(--text-secondary)]">
                            {statusEs(r.blockReason)}
                          </div>
                        ) : null}
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
            <div className="fsg-panel data-shell max-w-full overflow-x-auto">
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
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard
              label="Cumplimiento PESV"
              value={`${pesvCompliance}%`}
              delta={`${trainings.length} registro${trainings.length === 1 ? "" : "s"} indexados`}
              tone={pesvCompliance >= 80 ? "ok" : pesvCompliance >= 50 ? "warn" : "danger"}
            />
            <KpiCard
              label="Conductores capacitados"
              value={
                new Set(
                  trainings.map((t) => t.driver?.id).filter(Boolean),
                ).size
              }
              delta={`de ${drivers.length} en flota`}
            />
            <KpiCard
              label="Licencias ≤30d"
              value={overview?.licenciasPorVencer ?? 0}
              tone={(overview?.licenciasPorVencer ?? 0) > 0 ? "warn" : "ok"}
            />
            <KpiCard
              label="Fatiga alta"
              value={overview?.fatigaAlta ?? 0}
              tone={(overview?.fatigaAlta ?? 0) > 0 ? "danger" : "ok"}
            />
          </div>

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
            <div className="fsg-panel data-shell max-w-full overflow-x-auto">
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
        title="Nuevo empleado"
        description="Registra la persona, su contrato y el acceso al sistema"
        widthClass="max-w-3xl"
        footer={
          <Button
            type="submit"
            form="rrhh-alta-form"
            variant="primary"
            className="w-auto px-4 py-2"
          >
            Crear empleado y acceso
          </Button>
        }
      >
        <form id="rrhh-alta-form" onSubmit={onCreate} className="pb-2">
          <EmployeeFormFields
            form={form}
            onChange={setForm}
            mode="create"
            drivers={drivers}
          />
        </form>
      </SlideOver>

      <SlideOver
        open={editOpen}
        onClose={closeEdit}
        title="Editar expediente"
        description="Ficha de capital humano · cambios auditados"
        widthClass="max-w-3xl"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            {canManageIdentity && editingId ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-auto px-4 py-2"
                  onClick={() => {
                    const row = rows.find((r) => r.id === editingId);
                    if (row) {
                      setDocsEmployee(row);
                      setDocsOpen(true);
                    }
                  }}
                >
                  Documentos
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-auto px-4 py-2"
                  onClick={() => void resetPassword(editingId)}
                >
                  Resetear clave
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-auto px-4 py-2"
                  onClick={() =>
                    void toggleAccess(editingId, editingUserActive)
                  }
                >
                  {editingUserActive ? "Suspender acceso" : "Restaurar acceso"}
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  className="w-auto px-4 py-2"
                  onClick={() => {
                    const row = rows.find((r) => r.id === editingId);
                    if (row) void deleteEmployee(row.id, row.name);
                  }}
                >
                  Dar de baja
                </Button>
              </>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              className="w-auto px-4 py-2"
              onClick={closeEdit}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="rrhh-edit-form"
              variant="primary"
              className="w-auto px-4 py-2"
              disabled={!editingId}
            >
              Guardar ficha
            </Button>
          </div>
        }
      >
        <form
          id="rrhh-edit-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (editingId) void saveEdit(editingId);
          }}
        >
          <EmployeeFormFields
            form={editForm}
            onChange={setEditForm}
            mode="edit"
            canManageIdentity={canManageIdentity}
            drivers={drivers}
            legacyArea={!isKnownEmployeeArea(editForm.area)}
            legacyTitle={
              !cargosForEmployeeArea(editForm.area).includes(editForm.title)
            }
          />
        </form>
      </SlideOver>

      <SlideOver
        open={docsOpen}
        onClose={() => {
          setDocsOpen(false);
          setDocsEmployee(null);
        }}
        title={
          docsEmployee
            ? `Documentos · ${docsEmployee.name}`
            : "Documentos del empleado"
        }
        description="Checklist según el cargo · sube PDF o imagen aquí mismo"
        widthClass="max-w-xl"
        footer={
          <Button
            type="button"
            variant="ghost"
            className="w-auto px-4 py-2"
            onClick={() => {
              setDocsOpen(false);
              setDocsEmployee(null);
            }}
          >
            Cerrar
          </Button>
        }
      >
        {docsEmployee ? (
          <EmployeeDocumentsPanel
            employeeId={docsEmployee.id}
            onError={(msg) => setError(msg)}
            onStatus={(msg) => setStatusMsg(msg)}
            onLicenseUpdated={() => {
              void loadAll();
            }}
          />
        ) : null}
      </SlideOver>

      <Modal
        open={!!provisionResult}
        onClose={() => setProvisionResult(null)}
        title="Acceso provisionado"
        description="Entregue estas credenciales al colaborador"
        footer={
          <Button
            type="button"
            variant="primary"
            className="w-auto px-4 py-2"
            onClick={() => setProvisionResult(null)}
          >
            Cerrar
          </Button>
        }
      >
        {provisionResult ? (
          <div className="space-y-3 text-sm">
            <p>
              <span className="text-[var(--text-secondary)]">Colaborador:</span>{" "}
              {provisionResult.name}
            </p>
            <p>
              <span className="text-[var(--text-secondary)]">Correo:</span>{" "}
              <span className="font-data">{provisionResult.email}</span>
            </p>
            {provisionResult.pending ? (
              <p className="text-[var(--brand-amber)]">
                Usuario en PENDING — requiere autorización de mando antes del
                ingreso.
              </p>
            ) : provisionResult.tempPassword ? (
              <div className="rounded-lg border border-[var(--brand-line)] bg-[var(--bg-surface-2)] p-3">
                <div className="text-[10px] uppercase tracking-wide text-[var(--text-secondary)]">
                  Contraseña temporal
                </div>
                <div className="mt-1 font-data text-lg text-[var(--brand-primary)]">
                  {provisionResult.tempPassword}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
