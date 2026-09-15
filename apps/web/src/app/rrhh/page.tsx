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
import {
  Users,
  ShieldAlert,
  FileSpreadsheet,
  Wallet,
  GraduationCap,
  Activity,
  UserCheck,
  UserX,
  Route,
  Coffee,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  clearFieldError,
  splitFormApiError,
} from "@/lib/form-api-error";
import { useAuth } from "@/lib/auth-context";
import { EmptyState, KpiCard, Modal, SlideOver, StatusPulseBadge } from "@/components/audit";
import { BentoPanel } from "@/components/nexa/bento-panel";
import { BlockStatusBadge } from "@/components/nexa/block-status-badge";
import { NexaTable, NexaRow, NexaCell } from "@/components/nexa/nexa-table";
import {
  WorkbenchSearch,
  WorkbenchTabs,
  WorkbenchToolbar,
} from "@/components/workbench-toolbar";
import {
  ComplianceBadge,
  affiliateLabel,
  affiliateLevel,
  type ComplianceLevel,
} from "@/components/rrhh/compliance-badge";
import { collectDriverBlockReasons } from "@/lib/block-reasons";
import {
  EMPTY_EMPLOYEE_FORM,
  EmployeeFormFields,
  employeeFormToPayload,
  type EmployeeFormValues,
} from "@/components/rrhh/employee-form-fields";
import { EmployeeDocumentsPanel } from "@/components/rrhh/employee-documents-panel";
import { EmployeeExcelPanel } from "@/components/rrhh/employee-excel-panel";

type Semaphore = ComplianceLevel;

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
    nightHours?: number | string;
    overtimeHours?: number | string;
    deductions?: number | string;
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

function semLabel(s: Semaphore) {
  if (s === "GREEN") return "VIGENTE";
  if (s === "AMBER") return "POR VENCER";
  if (s === "RED") return "EXPIRADO";
  return "N/A";
}

function fatLabel(s: Semaphore) {
  if (s === "GREEN") return "APTO";
  if (s === "AMBER") return "PAUSA";
  return "BLOQUEADO";
}

function fatiguePulseTone(
  s: Semaphore,
): "active" | "fatiga" | "danger" | "neutral" {
  if (s === "GREEN") return "active";
  if (s === "AMBER") return "fatiga";
  if (s === "RED") return "danger";
  return "neutral";
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

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("es-CO");
}

export default function RrhhPage() {
  const { user } = useAuth();
  const canManageIdentity =
    user?.role === "platform_master" ||
    user?.role === "org_admin" ||
    user?.role === "vinculaciones";

  const [tab, setTab] = useState<TabId>("personal");
  const [personalQuery, setPersonalQuery] = useState("");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [rows, setRows] = useState<Emp[]>([]);
  const [drivers, setDrivers] = useState<DriverOpt[]>([]);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [error, setError] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [auditStats, setAuditStats] = useState<{
    newlyBlocked: number;
    expiredFound: number;
    expiringSoon: number;
  } | null>(null);
  const [altaOpen, setAltaOpen] = useState(false);
  const [altaFormError, setAltaFormError] = useState("");
  const [altaFieldErrors, setAltaFieldErrors] = useState<
    Record<string, string>
  >({});
  const [excelOpen, setExcelOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [payrollOpen, setPayrollOpen] = useState(false);
  const [trainingOpen, setTrainingOpen] = useState(false);
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
    generic?: boolean;
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
    provider: "NEXA Academia",
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
    setSelectedRunId((prev) => prev ?? pay[0]?.id ?? null);
  }, []);

  useEffect(() => {
    void loadAll().catch((err) =>
      setError(err instanceof Error ? err.message : "Fallo de conexión — RRHH"),
    );
  }, [loadAll]);

  const headcount = useMemo(() => {
    const activos = rows.filter((r) => r.status === "ACTIVE").length;
    const descansando = rows.filter(
      (r) => r.status === "VACATION" || r.status === "MEDICAL",
    ).length;
    const enRuta = rows.filter(
      (r) =>
        r.driverId &&
        r.status === "ACTIVE" &&
        !r.dispatchBlocked &&
        r.fatigueSemaphore !== "RED",
    ).length;
    const suspendidos = rows.filter(
      (r) =>
        r.status === "INACTIVE" ||
        r.user?.active === false ||
        r.dispatchBlocked,
    ).length;
    return { activos, descansando, enRuta, suspendidos };
  }, [rows]);

  const payrollTotal = useMemo(
    () => runs.reduce((acc, r) => acc + Number(r.totalGross ?? 0), 0),
    [runs],
  );

  const filteredRows = useMemo(() => {
    const q = personalQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.document.includes(q) ||
        (r.title || r.position).toLowerCase().includes(q) ||
        r.area.toLowerCase().includes(q),
    );
  }, [rows, personalQuery]);

  const linkedDrivers = useMemo(
    () => rows.filter((r) => r.driverId || r.driver),
    [rows],
  );

  const selectedRun = useMemo(
    () => runs.find((r) => r.id === selectedRunId) ?? null,
    [runs, selectedRunId],
  );

  const pesvCompliance = useMemo(() => {
    if (!drivers.length) return 0;
    const trained = new Set(
      trainings.map((t) => t.driver?.id).filter(Boolean) as string[],
    );
    return Math.round((trained.size / drivers.length) * 100);
  }, [drivers, trainings]);

  const workbenchTabs = useMemo(
    () => [
      {
        id: "personal" as const,
        label: "Personal",
        count: rows.length,
        tip: "Expedientes digitales y afiliaciones",
      },
      {
        id: "fatiga" as const,
        label: "Fatiga",
        count: linkedDrivers.length,
        tip: "Turnos, licencias y bloqueo operativo",
      },
      {
        id: "nomina" as const,
        label: "Nómina",
        count: runs.length,
        tip: "Liquidación, bonificaciones y deducciones",
      },
      {
        id: "capacitaciones" as const,
        label: "PESV",
        count: trainings.length,
        tip: "Capacitaciones y cumplimiento normativo",
      },
    ],
    [rows.length, linkedDrivers.length, runs.length, trainings.length],
  );

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setAltaFormError("");
    setAltaFieldErrors({});
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
      const split = splitFormApiError(err, [
        "name",
        "document",
        "email",
        "phone",
        "area",
        "title",
        "position",
        "address",
        "city",
        "role",
        "contractType",
        "hireDate",
        "baseSalary",
        "hourlyRate",
        "driverId",
      ]);
      setAltaFormError(split.formError);
      setAltaFieldErrors(split.fieldErrors);
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
        setEditForm(
          empToForm({
            ...row,
            user: row.user ? { ...row.user, active: !suspend } : null,
          }),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar acceso");
    }
  }

  async function resetPassword(id: string) {
    setError("");
    try {
      const res = await api<{ tempPassword: string; generic?: boolean }>(
        `/rrhh/employees/${id}/reset-password`,
        { method: "POST", body: "{}" },
      );
      const row = rows.find((r) => r.id === id);
      setProvisionResult({
        name: row?.name ?? "Empleado",
        email: row?.email ?? row?.user?.email ?? "",
        tempPassword: res.tempPassword,
        generic: true,
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
          : "Turno cerrado — score recalculado",
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
      setPayrollOpen(false);
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
        provider: "NEXA Academia",
      });
      setTrainingOpen(false);
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
          <p className="font-data text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-primary">
            Capital humano
          </p>
          <h1 className="page-title mt-1 text-2xl font-bold text-brand-text-primary md:text-3xl">
            Recursos Humanos
          </h1>
          <p className="mt-1 text-sm text-brand-text-secondary">
            Nómina · compliance · expedientes · PESV
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
              onClick={() => {
                setAltaFormError("");
                setAltaFieldErrors({});
                setAltaOpen(true);
              }}
            >
              + Nuevo empleado
            </Button>
          </div>
        ) : tab === "nomina" ? (
          <Button
            type="button"
            variant="primary"
            className="w-auto px-4 py-2"
            onClick={() => setPayrollOpen(true)}
          >
            Calcular liquidación
          </Button>
        ) : tab === "capacitaciones" ? (
          <Button
            type="button"
            variant="primary"
            className="w-auto px-4 py-2"
            onClick={() => setTrainingOpen(true)}
          >
            Registrar capacitación
          </Button>
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

      <div
        className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6"
        data-testid="rrhh-kpis"
        data-tour="kpi"
      >
        <BentoPanel
          title="Activos"
          subtitle="Headcount"
          icon={<UserCheck aria-hidden />}
          tour="primary"
        >
          <p className="font-data text-3xl font-bold tabular-nums text-brand-success">
            {headcount.activos}
          </p>
        </BentoPanel>
        <BentoPanel
          title="En ruta"
          subtitle="Operación"
          icon={<Route aria-hidden />}
        >
          <p className="font-data text-3xl font-bold tabular-nums text-brand-primary">
            {headcount.enRuta}
          </p>
        </BentoPanel>
        <BentoPanel
          title="Descanso"
          subtitle="Vacaciones / médica"
          icon={<Coffee aria-hidden />}
        >
          <p className="font-data text-3xl font-bold tabular-nums text-brand-warning">
            {headcount.descansando}
          </p>
        </BentoPanel>
        <BentoPanel
          title="Suspendidos"
          subtitle="Bloqueo / inactivo"
          icon={<UserX aria-hidden />}
        >
          <p className="font-data text-3xl font-bold tabular-nums text-brand-danger">
            {headcount.suspendidos}
          </p>
        </BentoPanel>
        <BentoPanel
          title="Licencias ≤30d"
          subtitle="Compliance"
          icon={<ShieldAlert aria-hidden />}
        >
          <p className="font-data text-3xl font-bold tabular-nums text-brand-warning">
            {overview?.licenciasPorVencer ?? 0}
          </p>
        </BentoPanel>
        <BentoPanel
          title="Nómina acum."
          subtitle="Bruto indexado"
          icon={<Wallet aria-hidden />}
        >
          <p className="font-data text-xl font-bold tabular-nums text-brand-text-primary md:text-2xl">
            {money(payrollTotal)}
          </p>
        </BentoPanel>
      </div>

      <BentoPanel
        title="Auditoría documental"
        subtitle="Licencias · EPS · ARL · AFP"
        icon={<ShieldAlert aria-hidden />}
        action={
          <Button
            type="button"
            variant="ghost"
            className="w-auto px-3 py-1.5 text-xs"
            onClick={() => void auditLicenses()}
          >
            Ejecutar auditoría
          </Button>
        }
      >
        <div className="flex flex-wrap gap-2 text-xs font-medium">
          <span className="rounded-md border border-brand-border bg-brand-surface px-2 py-1 font-data tabular-nums text-brand-danger">
            Bloqueados: {auditStats?.newlyBlocked ?? overview?.fatigaAlta ?? 0}
          </span>
          <span className="rounded-md border border-brand-border bg-brand-surface px-2 py-1 font-data tabular-nums text-brand-danger">
            Vencidas: {auditStats?.expiredFound ?? 0}
          </span>
          <span className="rounded-md border border-brand-border bg-brand-surface px-2 py-1 font-data tabular-nums text-brand-warning">
            Por vencer ≤10d:{" "}
            {auditStats?.expiringSoon ?? overview?.licenciasPorVencer ?? 0}
          </span>
          <span className="rounded-md border border-brand-border bg-brand-surface px-2 py-1 font-data tabular-nums text-brand-text-secondary">
            Sistema:{" "}
            {overview ? systemStatusEs(overview.systemStatus) : "—"}
          </span>
        </div>
      </BentoPanel>

      <WorkbenchToolbar>
        <WorkbenchTabs
          tabs={workbenchTabs}
          value={tab}
          onChange={(id) => setTab(id as TabId)}
        />
        {tab === "personal" ? (
          <WorkbenchSearch
            value={personalQuery}
            onChange={setPersonalQuery}
            placeholder="Nombre, C.C., cargo o área…"
          />
        ) : null}
      </WorkbenchToolbar>

      {statusMsg ? (
        <p
          role="status"
          className="rounded-lg border border-brand-primary/30 bg-brand-primary/10 px-3 py-2 text-sm text-brand-primary"
        >
          {statusMsg}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-brand-danger">
          {error}
        </p>
      ) : null}

      {tab === "personal" ? (
        <section className="space-y-4" data-testid="rrhh-panel-personal">
          {!filteredRows.length ? (
            <EmptyState
              icon={<Users className="h-7 w-7" />}
              title="Sin expedientes"
              description="Indexa el primer expediente de capital humano."
              actionLabel="+ Nuevo empleado"
              onAction={() => {
                setAltaFormError("");
                setAltaFieldErrors({});
                setAltaOpen(true);
              }}
            />
          ) : (
            <BentoPanel title="Expedientes digitales" subtitle={`${filteredRows.length} registro(s)`} tour="panel">
              <NexaTable
                columns={[
                  "Colaborador",
                  "Cargo",
                  "C.C.",
                  "Afiliaciones",
                  "Licencia",
                  "Fatiga",
                  "Estado",
                  "Acciones",
                ]}
              >
                {filteredRows.map((r) => {
                  const aff = affiliateLevel(r);
                  const licExp = r.driver?.licenseExpiresAt;
                  return (
                    <NexaRow key={r.id}>
                      <NexaCell>
                        <div className="font-semibold text-brand-text-primary">{r.name}</div>
                        {r.user?.email ? (
                          <div className="font-data text-[10px] text-brand-text-secondary">
                            {r.user.email}
                          </div>
                        ) : null}
                      </NexaCell>
                      <NexaCell>
                        {r.title || r.position}
                        <span className="text-brand-text-secondary"> · {r.area}</span>
                      </NexaCell>
                      <NexaCell mono>{r.document}</NexaCell>
                      <NexaCell>
                        <ComplianceBadge level={aff}>
                          {affiliateLabel(aff)}
                        </ComplianceBadge>
                        <div className="mt-1 font-data text-[9px] text-brand-text-secondary">
                          {r.eps || "—"} / {r.arl || "—"}
                        </div>
                      </NexaCell>
                      <NexaCell>
                        <ComplianceBadge
                          level={r.licenseSemaphore}
                          pulse={r.licenseSemaphore === "RED"}
                        >
                          {semLabel(r.licenseSemaphore)}
                        </ComplianceBadge>
                        {r.driver ? (
                          <div className="mt-1 font-data text-[9px] tabular-nums text-brand-text-secondary">
                            {r.driver.licenseCategory || "—"} · {fmtDate(licExp)}
                          </div>
                        ) : null}
                      </NexaCell>
                      <NexaCell>
                        <StatusPulseBadge
                          tone={fatiguePulseTone(r.fatigueSemaphore)}
                          pulse={r.fatigueSemaphore === "RED"}
                        >
                          {fatLabel(r.fatigueSemaphore)}{" "}
                          <span className="font-data tabular-nums">{r.fatigueScore}</span>
                        </StatusPulseBadge>
                        {r.dispatchBlocked ? (
                          <div className="mt-1.5">
                            <BlockStatusBadge
                              blocked
                              reasons={collectDriverBlockReasons({
                                dispatchBlocked: r.dispatchBlocked,
                                blockReason: r.blockReason,
                              })}
                              blockedLabel="Bloqueo"
                              entityTitle={`Bloqueo · ${r.name}`}
                              entitySubtitle={r.document}
                            />
                          </div>
                        ) : null}
                      </NexaCell>
                      <NexaCell>
                        <select
                          className="field py-1 font-data text-xs"
                          value={r.status}
                          onChange={(e) => void patchStatus(r.id, e.target.value)}
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {statusEs(s)}
                            </option>
                          ))}
                        </select>
                      </NexaCell>
                      <NexaCell>
                        <div className="flex flex-wrap gap-1">
                          <Button
                            variant="ghost"
                            className="w-auto text-xs"
                            onClick={() => startEdit(r)}
                          >
                            Editar
                          </Button>
                          <Button
                            variant="ghost"
                            className="w-auto text-xs"
                            onClick={() => {
                              setDocsEmployee(r);
                              setDocsOpen(true);
                            }}
                          >
                            Docs
                          </Button>
                        </div>
                      </NexaCell>
                    </NexaRow>
                  );
                })}
              </NexaTable>
            </BentoPanel>
          )}
        </section>
      ) : null}

      {tab === "fatiga" ? (
        <section className="space-y-4" data-testid="rrhh-panel-fatiga">
          <BentoPanel title="Control de turnos" subtitle="Entrada / salida · auditoría">
            <div className="flex flex-wrap items-end justify-end gap-3">
              <div className="min-w-[220px] flex-1">
                <label className="mb-1 block font-data text-[10px] uppercase tracking-wider text-brand-text-secondary">
                  Conductor
                </label>
                <select
                  className="field font-data"
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
                Entrada turno
              </Button>
              <Button
                variant="ghost"
                className="w-auto px-4 py-2"
                onClick={() => void shiftAction("check-out")}
              >
                Salida turno
              </Button>
            </div>
          </BentoPanel>

          {!linkedDrivers.length ? (
            <EmptyState
              title="Sin conductores vinculados"
              description="Vincula expedientes a flota para monitorear fatiga."
            />
          ) : (
            <BentoPanel
              title="Monitor de fatiga"
              icon={<Activity aria-hidden />}
              subtitle="Score · licencia · despacho"
            >
              <NexaTable
                columns={["Conductor", "C.C.", "Score", "Aptitud", "Licencia", "Despacho"]}
              >
                {linkedDrivers.map((r) => (
                  <NexaRow key={r.id}>
                    <NexaCell>{r.name}</NexaCell>
                    <NexaCell mono>{r.driver?.document || r.document}</NexaCell>
                    <NexaCell mono>{r.fatigueScore}</NexaCell>
                    <NexaCell>
                      <ComplianceBadge level={r.fatigueSemaphore}>
                        {fatLabel(r.fatigueSemaphore)}
                      </ComplianceBadge>
                    </NexaCell>
                    <NexaCell>
                      <ComplianceBadge
                        level={r.licenseSemaphore}
                        pulse={r.licenseSemaphore === "RED"}
                      >
                        {semLabel(r.licenseSemaphore)}
                      </ComplianceBadge>
                    </NexaCell>
                    <NexaCell>
                      <BlockStatusBadge
                        blocked={r.dispatchBlocked}
                        reasons={collectDriverBlockReasons({
                          dispatchBlocked: r.dispatchBlocked,
                          blockReason: r.blockReason,
                        })}
                        blockedLabel="Bloqueo"
                        clearLabel="Liberado"
                        entityTitle={`Bloqueo · ${r.name}`}
                        entitySubtitle={r.document}
                      />
                    </NexaCell>
                  </NexaRow>
                ))}
              </NexaTable>
            </BentoPanel>
          )}
        </section>
      ) : null}

      {tab === "nomina" ? (
        <section className="space-y-4" data-testid="rrhh-panel-nomina">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard
              label="Corridas"
              value={runs.length}
              delta="Periodos liquidados"
            />
            <KpiCard
              label="Bruto acumulado"
              value={money(payrollTotal)}
              tone="ok"
            />
            <KpiCard
              label="Novedades mes"
              value={overview?.novedadesNominaMes ?? 0}
              delta="Indexadas"
            />
            <KpiCard
              label="Fatiga alta"
              value={overview?.fatigaAlta ?? 0}
              tone={(overview?.fatigaAlta ?? 0) > 0 ? "danger" : "ok"}
            />
          </div>

          {!runs.length ? (
            <EmptyState
              icon={<Wallet className="h-7 w-7" />}
              title="Sin corridas de nómina"
              description="Calcula un periodo para indexar liquidación."
              actionLabel="Calcular liquidación"
              onAction={() => setPayrollOpen(true)}
            />
          ) : (
            <div className="grid gap-4 xl:grid-cols-5">
              <BentoPanel
                className="xl:col-span-2"
                title="Corridas de liquidación"
                subtitle="Seleccione periodo"
              >
                <NexaTable
                  columns={["Periodo", "Estado", "Bruto", "Líneas"]}
                >
                  {runs.map((run) => (
                    <NexaRow
                      key={run.id}
                      active={run.id === selectedRunId}
                      onClick={() => setSelectedRunId(run.id)}
                    >
                      <NexaCell mono className="text-xs">
                        {fmtDate(run.periodStart)} → {fmtDate(run.periodEnd)}
                      </NexaCell>
                      <NexaCell mono className="text-xs">
                        {statusEs(run.status)}
                      </NexaCell>
                      <NexaCell mono>{money(run.totalGross)}</NexaCell>
                      <NexaCell mono>{run.lines?.length ?? 0}</NexaCell>
                    </NexaRow>
                  ))}
                </NexaTable>
              </BentoPanel>

              <BentoPanel
                className="xl:col-span-3"
                title="Detalle de liquidación"
                subtitle={
                  selectedRun
                    ? `${fmtDate(selectedRun.periodStart)} — ${fmtDate(selectedRun.periodEnd)}`
                    : "Sin selección"
                }
              >
                {selectedRun ? (
                  <>
                    <div className="mb-4 grid grid-cols-3 gap-2">
                      <div className="rounded-lg border border-brand-border bg-brand-surface-elevated/50 p-2">
                        <p className="font-data text-[9px] uppercase text-brand-text-secondary">
                          Bruto
                        </p>
                        <p className="font-data text-lg font-bold tabular-nums text-brand-text-primary">
                          {money(selectedRun.totalGross)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-brand-border bg-brand-surface-elevated/50 p-2">
                        <p className="font-data text-[9px] uppercase text-brand-text-secondary">
                          Nocturno
                        </p>
                        <p className="font-data text-lg font-bold tabular-nums text-brand-warning">
                          {money(selectedRun.totalNight)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-brand-border bg-brand-surface-elevated/50 p-2">
                        <p className="font-data text-[9px] uppercase text-brand-text-secondary">
                          Extras
                        </p>
                        <p className="font-data text-lg font-bold tabular-nums text-brand-primary">
                          {money(selectedRun.totalOvertime)}
                        </p>
                      </div>
                    </div>
                    {!selectedRun.lines?.length ? (
                      <p className="text-sm text-brand-text-secondary">
                        Sin líneas de liquidación en esta corrida.
                      </p>
                    ) : (
                      <NexaTable
                        columns={[
                          "Colaborador",
                          "C.C.",
                          "Bruto",
                          "H. extra",
                          "H. noche",
                          "Deducciones",
                        ]}
                      >
                        {selectedRun.lines.map((line) => (
                          <NexaRow key={line.id}>
                            <NexaCell>{line.employee?.name ?? "—"}</NexaCell>
                            <NexaCell mono>{line.employee?.document ?? "—"}</NexaCell>
                            <NexaCell mono>{money(line.grossTotal)}</NexaCell>
                            <NexaCell mono>
                              {line.overtimeHours ?? "—"}
                            </NexaCell>
                            <NexaCell mono>{line.nightHours ?? "—"}</NexaCell>
                            <NexaCell mono className="text-brand-danger">
                              {line.deductions != null
                                ? money(line.deductions)
                                : "—"}
                            </NexaCell>
                          </NexaRow>
                        ))}
                      </NexaTable>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-brand-text-secondary">
                    Seleccione una corrida para ver el detalle.
                  </p>
                )}
              </BentoPanel>
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
              delta={`${trainings.length} registro(s)`}
              tone={
                pesvCompliance >= 80
                  ? "ok"
                  : pesvCompliance >= 50
                    ? "warn"
                    : "danger"
              }
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

          {!trainings.length ? (
            <EmptyState
              icon={<GraduationCap className="h-7 w-7" />}
              title="Sin registros PESV"
              description="Registra la primera capacitación normativa."
              actionLabel="Registrar capacitación"
              onAction={() => setTrainingOpen(true)}
            />
          ) : (
            <BentoPanel title="Registro PESV" icon={<GraduationCap aria-hidden />}>
              <NexaTable
                columns={[
                  "Conductor",
                  "C.C.",
                  "Tema",
                  "Completada",
                  "Vence",
                  "Proveedor",
                ]}
              >
                {trainings.map((t) => (
                  <NexaRow key={t.id}>
                    <NexaCell>{t.driver?.name ?? "—"}</NexaCell>
                    <NexaCell mono>{t.driver?.document ?? "—"}</NexaCell>
                    <NexaCell>{t.topic}</NexaCell>
                    <NexaCell mono>{fmtDate(t.completedAt)}</NexaCell>
                    <NexaCell mono>{fmtDate(t.expiresAt)}</NexaCell>
                    <NexaCell className="text-brand-text-secondary">
                      {t.provider || "—"}
                    </NexaCell>
                  </NexaRow>
                ))}
              </NexaTable>
            </BentoPanel>
          )}
        </section>
      ) : null}

      <SlideOver
        open={altaOpen}
        onClose={() => setAltaOpen(false)}
        title="Nuevo empleado"
        description="Registra la persona, contrato y acceso al sistema"
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
            formError={altaFormError}
            fieldErrors={altaFieldErrors}
            onFieldEdit={(key) =>
              setAltaFieldErrors((prev) => clearFieldError(prev, key))
            }
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
                  onClick={() => void toggleAccess(editingId, editingUserActive)}
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
            <Button type="button" variant="ghost" className="w-auto px-4 py-2" onClick={closeEdit}>
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
          docsEmployee ? `Documentos · ${docsEmployee.name}` : "Documentos del empleado"
        }
        description="Checklist según cargo · PDF o imagen"
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

      <SlideOver
        open={payrollOpen}
        onClose={() => setPayrollOpen(false)}
        title="Pre-liquidación de nómina"
        description="Periodo · turnos · kilometraje indexado"
        widthClass="max-w-md"
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              className="w-auto px-4 py-2"
              onClick={() => setPayrollOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="rrhh-payroll-form"
              variant="primary"
              className="w-auto px-4 py-2"
            >
              Calcular liquidación
            </Button>
          </>
        }
      >
        <form id="rrhh-payroll-form" onSubmit={runPayroll} className="space-y-4">
          <div>
            <label className="mb-1 block font-data text-[10px] uppercase tracking-wider text-brand-text-secondary">
              Periodo desde
            </label>
            <input
              type="date"
              className="field w-full font-data"
              value={payrollForm.periodStart}
              onChange={(e) =>
                setPayrollForm({ ...payrollForm, periodStart: e.target.value })
              }
              required
            />
          </div>
          <div>
            <label className="mb-1 block font-data text-[10px] uppercase tracking-wider text-brand-text-secondary">
              Periodo hasta
            </label>
            <input
              type="date"
              className="field w-full font-data"
              value={payrollForm.periodEnd}
              onChange={(e) =>
                setPayrollForm({ ...payrollForm, periodEnd: e.target.value })
              }
              required
            />
          </div>
        </form>
      </SlideOver>

      <SlideOver
        open={trainingOpen}
        onClose={() => setTrainingOpen(false)}
        title="Registrar capacitación"
        description="PESV · seguridad vial · compliance"
        widthClass="max-w-md"
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              className="w-auto px-4 py-2"
              onClick={() => setTrainingOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="rrhh-training-form"
              variant="primary"
              className="w-auto px-4 py-2"
            >
              Registrar
            </Button>
          </>
        }
      >
        <form id="rrhh-training-form" onSubmit={createTraining} className="space-y-4">
          <div>
            <label className="mb-1 block font-data text-[10px] uppercase tracking-wider text-brand-text-secondary">
              Conductor
            </label>
            <select
              className="field w-full"
              value={trainingForm.driverId}
              onChange={(e) =>
                setTrainingForm({ ...trainingForm, driverId: e.target.value })
              }
              required
            >
              <option value="">Seleccionar…</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block font-data text-[10px] uppercase tracking-wider text-brand-text-secondary">
              Tema
            </label>
            <input
              className="field w-full"
              placeholder="PESV, conducción defensiva…"
              value={trainingForm.topic}
              onChange={(e) =>
                setTrainingForm({ ...trainingForm, topic: e.target.value })
              }
              required
            />
          </div>
          <div>
            <label className="mb-1 block font-data text-[10px] uppercase tracking-wider text-brand-text-secondary">
              Proveedor
            </label>
            <input
              className="field w-full"
              placeholder="Proveedor acreditado"
              value={trainingForm.provider}
              onChange={(e) =>
                setTrainingForm({ ...trainingForm, provider: e.target.value })
              }
            />
          </div>
        </form>
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
              <span className="text-brand-text-secondary">Colaborador:</span>{" "}
              {provisionResult.name}
            </p>
            <p>
              <span className="text-brand-text-secondary">Correo:</span>{" "}
              <span className="font-data">{provisionResult.email}</span>
            </p>
            {provisionResult.pending ? (
              <p className="text-brand-warning">
                Usuario en PENDING — requiere autorización de mando antes del ingreso.
              </p>
            ) : null}
            {provisionResult.tempPassword ? (
              <div className="rounded-lg border border-brand-border bg-brand-surface-elevated p-3">
                <div className="font-data text-[10px] uppercase tracking-wide text-brand-text-secondary">
                  {provisionResult.generic
                    ? "Contraseña genérica"
                    : "Contraseña temporal"}
                </div>
                <div className="mt-1 font-data text-lg text-brand-primary">
                  {provisionResult.tempPassword}
                </div>
                <p className="mt-2 font-data text-[11px] text-brand-text-secondary">
                  {provisionResult.generic
                    ? "Al iniciar con esta clave el sistema pedirá cambiarla obligatoriamente."
                    : "Cópiala ahora. El colaborador deberá cambiarla en el primer acceso."}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
