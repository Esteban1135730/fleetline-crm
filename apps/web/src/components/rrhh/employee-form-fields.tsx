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
  return <div className="form-section-title col-span-full">{children}</div>;
}

function FieldLabel({
  label,
  children,
  className = "",
  hint,
  error,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  hint?: string;
  error?: string;
}) {
  return (
    <label className={`form-field ${className}`.trim()}>
      <span className="form-field-label">{label}</span>
      {children}
      {error ? (
        <span role="alert" className="mt-1 block text-xs text-[var(--brand-danger)]">
          {error}
        </span>
      ) : hint ? (
        <span className="form-hint">{hint}</span>
      ) : null}
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
  formError?: string;
  fieldErrors?: Record<string, string>;
  onFieldEdit?: (key: keyof EmployeeFormValues) => void;
};

export function EmployeeFormFields({
  form,
  onChange,
  mode,
  canManageIdentity = false,
  drivers = [],
  legacyArea = false,
  legacyTitle = false,
  formError = "",
  fieldErrors = {},
  onFieldEdit,
}: Props) {
  function patch(partial: Partial<EmployeeFormValues>) {
    const key = Object.keys(partial)[0] as keyof EmployeeFormValues | undefined;
    if (key) onFieldEdit?.(key);
    onChange({ ...form, ...partial });
  }

  function onAreaChange(area: string) {
    const cargos = cargosForEmployeeArea(area);
    const title = cargos.includes(form.title)
      ? form.title
      : (cargos[0] ?? form.title);
    onFieldEdit?.("area");
    onFieldEdit?.("title");
    onChange({
      ...form,
      area,
      title,
      role: roleForEmployeeCargo(title) as Role,
    });
  }

  function onCargoChange(title: string) {
    onFieldEdit?.("title");
    onChange({
      ...form,
      title,
      role: roleForEmployeeCargo(title) as Role,
    });
  }

  return (
    <div className="grid max-w-full grid-cols-1 gap-x-3 gap-y-3.5 sm:grid-cols-2">
      {formError ? (
        <p
          role="alert"
          className="col-span-full rounded border border-[var(--brand-danger)]/40 bg-[var(--brand-danger)]/10 px-3 py-2 text-sm text-[var(--brand-danger)]"
        >
          {formError}
        </p>
      ) : null}
      <SectionTitle>Identidad</SectionTitle>
      <FieldLabel
        label="Nombre completo"
        className="sm:col-span-2"
        error={fieldErrors.name}
      >
        <input
          className={`field w-full min-w-0 ${fieldErrors.name ? "border-[var(--brand-danger)]" : ""}`}
          value={form.name}
          onChange={(e) => patch({ name: e.target.value })}
          required
          autoComplete="name"
          data-field="personName"
          aria-invalid={Boolean(fieldErrors.name) || undefined}
        />
      </FieldLabel>
      <FieldLabel label="Documento" error={fieldErrors.document}>
        <input
          className={`field font-data ${fieldErrors.document ? "border-[var(--brand-danger)]" : ""}`}
          value={form.document}
          onChange={(e) => patch({ document: e.target.value })}
          required={mode === "create"}
          readOnly={mode === "edit" && !canManageIdentity}
          inputMode="numeric"
          data-field="document"
          aria-invalid={Boolean(fieldErrors.document) || undefined}
        />
      </FieldLabel>
      <FieldLabel label="Correo (login)" error={fieldErrors.email}>
        <input
          className={`field ${fieldErrors.email ? "border-[var(--brand-danger)]" : ""}`}
          type="email"
          value={form.email}
          onChange={(e) => patch({ email: e.target.value })}
          required={mode === "create"}
          autoComplete="email"
          aria-invalid={Boolean(fieldErrors.email) || undefined}
        />
      </FieldLabel>
      <FieldLabel label="Teléfono" error={fieldErrors.phone}>
        <input
          className={`field ${fieldErrors.phone ? "border-[var(--brand-danger)]" : ""}`}
          value={form.phone}
          onChange={(e) => patch({ phone: e.target.value })}
          autoComplete="tel"
          aria-invalid={Boolean(fieldErrors.phone) || undefined}
        />
      </FieldLabel>
      <FieldLabel label="Dirección" error={fieldErrors.address}>
        <input
          className={`field ${fieldErrors.address ? "border-[var(--brand-danger)]" : ""}`}
          value={form.address}
          onChange={(e) => patch({ address: e.target.value })}
          aria-invalid={Boolean(fieldErrors.address) || undefined}
        />
      </FieldLabel>
      <FieldLabel label="Ciudad" error={fieldErrors.city}>
        <input
          className={`field ${fieldErrors.city ? "border-[var(--brand-danger)]" : ""}`}
          value={form.city}
          onChange={(e) => patch({ city: e.target.value })}
          aria-invalid={Boolean(fieldErrors.city) || undefined}
        />
      </FieldLabel>

      <SectionTitle>Vinculación laboral</SectionTitle>
      <FieldLabel label="Área" error={fieldErrors.area}>
        <select
          className={`field ${fieldErrors.area ? "border-[var(--brand-danger)]" : ""}`}
          value={form.area}
          onChange={(e) => onAreaChange(e.target.value)}
          aria-invalid={Boolean(fieldErrors.area) || undefined}
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
      <FieldLabel label="Cargo" error={fieldErrors.title || fieldErrors.position}>
        <select
          className={`field ${fieldErrors.title || fieldErrors.position ? "border-[var(--brand-danger)]" : ""}`}
          value={form.title}
          onChange={(e) => onCargoChange(e.target.value)}
          aria-invalid={
            Boolean(fieldErrors.title || fieldErrors.position) || undefined
          }
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
      <FieldLabel
        label="Acceso al sistema"
        hint="Se asigna automáticamente según el cargo"
      >
        <div className="form-readonly">
          {ROLE_LABELS[form.role] ?? form.role}
        </div>
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
