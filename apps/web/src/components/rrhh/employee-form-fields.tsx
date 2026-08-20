"use client";

import {
  EMPLOYEE_AREA_CATALOG,
  ROLE_LABELS,
  cargosForEmployeeArea,
  roleForEmployeeCargo,
  type Role,
} from "@fsg/shared";

export type EmployeeFormValues = {
  name: string;
  document: string;
  email: string;
  phone: string;
  area: string;
  title: string;
  role: Role;
  contractType: string;
  hireDate: string;
  baseSalary: string;
  hourlyRate: string;
  address: string;
  city: string;
  eps: string;
  arl: string;
  pensionFund: string;
  compensationFund: string;
  bankName: string;
  bankAccountType: string;
  bankAccountNumber: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelation: string;
  driverId: string;
};

export const CONTRACT_TYPES = [
  { value: "INDEFINIDO", label: "Término indefinido" },
  { value: "TERMINO_FIJO", label: "Término fijo" },
  { value: "OBRA_LABOR", label: "Obra o labor" },
  { value: "APRENDIZAJE", label: "Aprendizaje" },
  { value: "PRESTACION_SERVICIOS", label: "Prestación de servicios" },
] as const;

export const BANK_ACCOUNT_TYPES = [
  { value: "AHORROS", label: "Ahorros" },
  { value: "CORRIENTE", label: "Corriente" },
] as const;

const DEFAULT_AREA = "Operaciones";

export const EMPTY_EMPLOYEE_FORM: EmployeeFormValues = {
  name: "",
  document: "",
  email: "",
  phone: "",
  area: DEFAULT_AREA,
  title: cargosForEmployeeArea(DEFAULT_AREA)[0] ?? "Conductor",
  role: roleForEmployeeCargo(
    cargosForEmployeeArea(DEFAULT_AREA)[0] ?? "Conductor",
  ) as Role,
  contractType: "INDEFINIDO",
  hireDate: new Date().toISOString().slice(0, 10),
  baseSalary: "",
  hourlyRate: "",
  address: "",
  city: "",
  eps: "",
  arl: "",
  pensionFund: "",
  compensationFund: "",
  bankName: "",
  bankAccountType: "AHORROS",
  bankAccountNumber: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  emergencyContactRelation: "",
  driverId: "",
};

function SectionTitle({ children }: { children: string }) {
  return (
    <div className="col-span-full border-b border-[var(--brand-line)] pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--brand-primary)]">
      {children}
    </div>
  );
}

function FieldLabel({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label
      className={`flex min-w-0 flex-col gap-1 text-[11px] uppercase tracking-wide text-[var(--text-secondary)] ${className}`}
    >
      {label}
      {children}
    </label>
  );
}

type DriverOpt = { id: string; name: string; document: string };

type Props = {
  form: EmployeeFormValues;
  onChange: (next: EmployeeFormValues) => void;
  mode: "create" | "edit";
  canManageIdentity?: boolean;
  drivers?: DriverOpt[];
  legacyArea?: boolean;
  legacyTitle?: boolean;
};

export function EmployeeFormFields({
  form,
  onChange,
  mode,
  canManageIdentity = false,
  drivers = [],
  legacyArea = false,
  legacyTitle = false,
}: Props) {
  function patch(partial: Partial<EmployeeFormValues>) {
    onChange({ ...form, ...partial });
  }

  function onAreaChange(area: string) {
    const cargos = cargosForEmployeeArea(area);
    const title = cargos.includes(form.title)
      ? form.title
      : (cargos[0] ?? form.title);
    patch({
      area,
      title,
      role: roleForEmployeeCargo(title) as Role,
    });
  }

  function onCargoChange(title: string) {
    patch({
      title,
      role: roleForEmployeeCargo(title) as Role,
    });
  }

  return (
    <div className="grid max-w-full grid-cols-1 gap-3 sm:grid-cols-2">
      <SectionTitle>Identidad</SectionTitle>
      <FieldLabel label="Nombre completo" className="sm:col-span-2">
        <input
          className="field w-full min-w-0"
          value={form.name}
          onChange={(e) => patch({ name: e.target.value })}
          required
          autoComplete="name"
          data-field="personName"
        />
      </FieldLabel>
      <FieldLabel label="Documento">
        <input
          className="field font-data"
          value={form.document}
          onChange={(e) => patch({ document: e.target.value })}
          required={mode === "create"}
          readOnly={mode === "edit" && !canManageIdentity}
          inputMode="numeric"
          data-field="document"
        />
      </FieldLabel>
      <FieldLabel label="Correo (login)">
        <input
          className="field"
          type="email"
          value={form.email}
          onChange={(e) => patch({ email: e.target.value })}
          required={mode === "create"}
          autoComplete="email"
        />
      </FieldLabel>
      <FieldLabel label="Teléfono">
        <input
          className="field"
          value={form.phone}
          onChange={(e) => patch({ phone: e.target.value })}
          autoComplete="tel"
        />
      </FieldLabel>
      <FieldLabel label="Dirección">
        <input
          className="field"
          value={form.address}
          onChange={(e) => patch({ address: e.target.value })}
        />
      </FieldLabel>
      <FieldLabel label="Ciudad">
        <input
          className="field"
          value={form.city}
          onChange={(e) => patch({ city: e.target.value })}
        />
      </FieldLabel>

      <SectionTitle>Vinculación laboral</SectionTitle>
      <FieldLabel label="Área">
        <select
          className="field"
          value={form.area}
          onChange={(e) => onAreaChange(e.target.value)}
        >
          {legacyArea && form.area ? (
            <option value={form.area}>{form.area} (legado)</option>
          ) : null}
          {EMPLOYEE_AREA_CATALOG.map((entry) => (
            <option key={entry.area} value={entry.area}>
              {entry.area}
            </option>
          ))}
        </select>
      </FieldLabel>
      <FieldLabel label="Cargo">
        <select
          className="field"
          value={form.title}
          onChange={(e) => onCargoChange(e.target.value)}
        >
          {legacyTitle && form.title ? (
            <option value={form.title}>{form.title} (legado)</option>
          ) : null}
          {cargosForEmployeeArea(form.area).map((cargo) => (
            <option key={cargo} value={cargo}>
              {cargo}
            </option>
          ))}
        </select>
      </FieldLabel>
      <FieldLabel label="Acceso al sistema">
        <div className="field flex items-center bg-[color-mix(in_srgb,var(--bg-surface-2)_80%,transparent)] text-[var(--text-primary)]">
          {ROLE_LABELS[form.role] ?? form.role}
        </div>
        <span className="normal-case tracking-normal text-[10px] text-[var(--text-secondary)]">
          Se asigna automáticamente según el cargo
        </span>
      </FieldLabel>
      <FieldLabel label="Tipo de contrato">
        <select
          className="field"
          value={form.contractType}
          onChange={(e) => patch({ contractType: e.target.value })}
        >
          {CONTRACT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </FieldLabel>
      <FieldLabel label="Fecha de ingreso">
        <input
          className="field font-data"
          type="date"
          value={form.hireDate}
          onChange={(e) => patch({ hireDate: e.target.value })}
        />
      </FieldLabel>
      <FieldLabel label="Salario base (COP)">
        <input
          className="field font-data"
          inputMode="numeric"
          value={form.baseSalary}
          onChange={(e) => patch({ baseSalary: e.target.value })}
        />
      </FieldLabel>
      <FieldLabel label="Tarifa hora (COP)">
        <input
          className="field font-data"
          inputMode="numeric"
          value={form.hourlyRate}
          onChange={(e) => patch({ hourlyRate: e.target.value })}
        />
      </FieldLabel>

      <SectionTitle>Seguridad social</SectionTitle>
      <FieldLabel label="EPS">
        <input
          className="field"
          value={form.eps}
          onChange={(e) => patch({ eps: e.target.value })}
        />
      </FieldLabel>
      <FieldLabel label="ARL">
        <input
          className="field"
          value={form.arl}
          onChange={(e) => patch({ arl: e.target.value })}
        />
      </FieldLabel>
      <FieldLabel label="Fondo de pensión">
        <input
          className="field"
          value={form.pensionFund}
          onChange={(e) => patch({ pensionFund: e.target.value })}
        />
      </FieldLabel>
      <FieldLabel label="Caja de compensación">
        <input
          className="field"
          value={form.compensationFund}
          onChange={(e) => patch({ compensationFund: e.target.value })}
        />
      </FieldLabel>

      <SectionTitle>Datos bancarios</SectionTitle>
      <FieldLabel label="Banco">
        <input
          className="field"
          value={form.bankName}
          onChange={(e) => patch({ bankName: e.target.value })}
        />
      </FieldLabel>
      <FieldLabel label="Tipo de cuenta">
        <select
          className="field"
          value={form.bankAccountType}
          onChange={(e) => patch({ bankAccountType: e.target.value })}
        >
          {BANK_ACCOUNT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </FieldLabel>
      <FieldLabel label="Número de cuenta">
        <input
          className="field font-data"
          value={form.bankAccountNumber}
          onChange={(e) => patch({ bankAccountNumber: e.target.value })}
        />
      </FieldLabel>

      <SectionTitle>Contacto de emergencia</SectionTitle>
      <FieldLabel label="Nombre">
        <input
          className="field"
          value={form.emergencyContactName}
          onChange={(e) => patch({ emergencyContactName: e.target.value })}
        />
      </FieldLabel>
      <FieldLabel label="Teléfono">
        <input
          className="field"
          value={form.emergencyContactPhone}
          onChange={(e) => patch({ emergencyContactPhone: e.target.value })}
        />
      </FieldLabel>
      <FieldLabel label="Parentesco">
        <input
          className="field"
          value={form.emergencyContactRelation}
          onChange={(e) => patch({ emergencyContactRelation: e.target.value })}
        />
      </FieldLabel>

      {drivers.length > 0 ? (
        <>
          <SectionTitle>Flota</SectionTitle>
          <FieldLabel label="Vínculo conductor existente" className="sm:col-span-2">
            <select
              className="field w-full min-w-0"
              value={form.driverId}
              onChange={(e) => patch({ driverId: e.target.value })}
            >
              <option value="">Sin vínculo — crear automático si aplica</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} · {d.document}
                </option>
              ))}
            </select>
          </FieldLabel>
        </>
      ) : null}
    </div>
  );
}

export function employeeFormToPayload(form: EmployeeFormValues) {
  const money = (v: string) => {
    const n = Number(v.replace(/\D/g, ""));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };

  return {
    name: form.name.trim(),
    document: form.document.trim(),
    email: form.email.trim(),
    phone: form.phone.trim() || undefined,
    area: form.area,
    title: form.title,
    role: form.role,
    contractType: form.contractType || undefined,
    hireDate: form.hireDate ? new Date(form.hireDate).toISOString() : undefined,
    baseSalary: money(form.baseSalary),
    hourlyRate: money(form.hourlyRate),
    address: form.address.trim() || undefined,
    city: form.city.trim() || undefined,
    eps: form.eps.trim() || undefined,
    arl: form.arl.trim() || undefined,
    pensionFund: form.pensionFund.trim() || undefined,
    compensationFund: form.compensationFund.trim() || undefined,
    bankName: form.bankName.trim() || undefined,
    bankAccountType: form.bankAccountType || undefined,
    bankAccountNumber: form.bankAccountNumber.trim() || undefined,
    emergencyContactName: form.emergencyContactName.trim() || undefined,
    emergencyContactPhone: form.emergencyContactPhone.trim() || undefined,
    emergencyContactRelation: form.emergencyContactRelation.trim() || undefined,
    driverId: form.driverId || undefined,
  };
}
