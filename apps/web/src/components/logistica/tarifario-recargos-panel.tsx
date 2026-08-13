"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@fsg/ui";
import { api } from "@/lib/api";

type Concepto = {
  sigla: string;
  concepto: string;
  factor: number;
  valor: number;
};

type EmpleadoTarifa = {
  driverId: string;
  employeeId: string | null;
  name: string;
  document: string;
  baseSalary: number;
  hourlyRate: number;
  usesOrgDefault: boolean;
  conceptos: Concepto[];
};

type Tarifario = {
  config: {
    baseSalary: number;
    monthlyHoursDivisor: number;
    weeklyOrdinaryHours: number;
    hourlyRate: number;
    rnFactor: number;
    hedFactor: number;
    henFactor: number;
    rodFestFactor: number;
    hedfFactor: number;
    henfFactor: number;
    rnfFactor: number;
  };
  conceptos: Concepto[];
  empleados: EmpleadoTarifa[];
};

function money(n: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

function factorLabel(f: number) {
  return f.toLocaleString("es-CO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function TarifarioRecargosPanel() {
  const [data, setData] = useState<Tarifario | null>(null);
  const [baseSalary, setBaseSalary] = useState("");
  const [divisor, setDivisor] = useState("230");
  const [selectedDriver, setSelectedDriver] = useState("");
  const [empBase, setEmpBase] = useState("");
  const [hoursBySigla, setHoursBySigla] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setError("");
    const t = await api<Tarifario>("/nomina/tarifario");
    setData(t);
    setBaseSalary(String(Math.round(t.config.baseSalary)));
    setDivisor(String(t.config.monthlyHoursDivisor));
    setSelectedDriver((prev) => {
      const id = prev || t.empleados[0]?.driverId || "";
      const emp = t.empleados.find((e) => e.driverId === id) ?? t.empleados[0];
      if (emp) setEmpBase(String(Math.round(emp.baseSalary)));
      return id;
    });
  }, []);

  useEffect(() => {
    void load().catch((e) =>
      setError(e instanceof Error ? e.message : "No se cargó el tarifario"),
    );
  }, [load]);

  const previewHourly = useMemo(() => {
    const b = Number(baseSalary) || 0;
    const d = Number(divisor) || 230;
    return d > 0 ? Math.round(b / d) : 0;
  }, [baseSalary, divisor]);

  const activeEmp = useMemo(
    () => data?.empleados.find((e) => e.driverId === selectedDriver) ?? null,
    [data, selectedDriver],
  );

  const tableRows = activeEmp?.conceptos ?? data?.conceptos ?? [];

  const calcTotal = useMemo(() => {
    return tableRows.reduce((sum, row) => {
      const h = Number(hoursBySigla[row.sigla] || 0);
      return sum + h * row.valor;
    }, 0);
  }, [tableRows, hoursBySigla]);

  async function saveOrg() {
    setSaving(true);
    setError("");
    setMsg("");
    try {
      const t = await api<Tarifario>("/nomina/tarifario", {
        method: "PATCH",
        body: JSON.stringify({
          baseSalary: Number(baseSalary),
          monthlyHoursDivisor: Number(divisor),
        }),
      });
      setData(t);
      setMsg("Base organizacional actualizada — tarifario recalculado");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  async function saveEmp() {
    if (!selectedDriver) return;
    setSaving(true);
    setError("");
    setMsg("");
    try {
      const t = await api<Tarifario>(
        `/nomina/tarifario/empleado/${selectedDriver}`,
        {
          method: "PATCH",
          body: JSON.stringify({ baseSalary: Number(empBase) }),
        },
      );
      setData(t);
      const emp = t.empleados.find((e) => e.driverId === selectedDriver);
      if (emp) setEmpBase(String(Math.round(emp.baseSalary)));
      setMsg("Base del empleado aplicada — valores de recargo actualizados");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4 rounded-lg border border-[var(--brand-line)] bg-[var(--brand-surface,#121722)] p-4 shadow-[0_10px_30px_rgba(0,0,0,0.04)]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-[var(--brand-fg,#F8FAFC)]">
            Tarifario de recargos · nómina
          </h2>
          <p className="mt-1 text-sm text-[var(--brand-muted,#94A3B8)]">
            Define la base salarial. Hora ordinaria = base ÷ divisor (230). Los
            factores RN / HED / HEN / ROD FEST / HEDF / HENF / RNF se aplican
            automáticamente.
          </p>
        </div>
        {data ? (
          <p className="font-data text-sm text-[var(--brand-amber,#FFB800)]">
            Hora org: {money(data.config.hourlyRate)}
          </p>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-[var(--brand-signal,#FF2A5F)]">
          {error}
        </p>
      ) : null}
      {msg ? (
        <p className="text-sm text-[var(--brand-primary,#10B981)]">{msg}</p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-md border border-[var(--brand-line)] p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--brand-muted)]">
            Base organizacional (default)
          </p>
          <label className="block text-sm">
            <span className="text-[var(--brand-muted)]">Salario base (COP)</span>
            <input
              className="mt-1 w-full rounded border border-[var(--brand-line)] bg-transparent px-3 py-2 font-data"
              value={baseSalary}
              onChange={(e) => setBaseSalary(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
            />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--brand-muted)]">
              Divisor mensual (horas)
            </span>
            <input
              className="mt-1 w-full rounded border border-[var(--brand-line)] bg-transparent px-3 py-2 font-data"
              value={divisor}
              onChange={(e) => setDivisor(e.target.value)}
              inputMode="decimal"
            />
          </label>
          <p className="font-data text-xs text-[var(--brand-muted)]">
            Preview hora: {money(previewHourly)} · fórmula base ÷ {divisor || "230"}
          </p>
          <Button type="button" disabled={saving} onClick={() => void saveOrg()}>
            Guardar base org
          </Button>
        </div>

        <div className="space-y-3 rounded-md border border-[var(--brand-line)] p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--brand-muted)]">
            Base por empleado / conductor
          </p>
          <label className="block text-sm">
            <span className="text-[var(--brand-muted)]">Conductor</span>
            <select
              className="mt-1 w-full rounded border border-[var(--brand-line)] bg-transparent px-3 py-2"
              value={selectedDriver}
              onChange={(e) => {
                const id = e.target.value;
                setSelectedDriver(id);
                const emp = data?.empleados.find((x) => x.driverId === id);
                setEmpBase(emp ? String(Math.round(emp.baseSalary)) : "");
                setHoursBySigla({});
              }}
            >
              {(data?.empleados ?? []).map((e) => (
                <option key={e.driverId} value={e.driverId}>
                  {e.name} · {e.document}
                  {e.usesOrgDefault ? " (default org)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-[var(--brand-muted)]">
              Salario base empleado (COP)
            </span>
            <input
              className="mt-1 w-full rounded border border-[var(--brand-line)] bg-transparent px-3 py-2 font-data"
              value={empBase}
              onChange={(e) => setEmpBase(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
            />
          </label>
          {activeEmp ? (
            <p className="font-data text-xs text-[var(--brand-muted)]">
              Hora empleado: {money(activeEmp.hourlyRate)}
            </p>
          ) : null}
          <Button type="button" disabled={saving || !selectedDriver} onClick={() => void saveEmp()}>
            Aplicar base al empleado
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border border-[var(--brand-line)]">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[var(--brand-line)] bg-black/20 text-xs uppercase tracking-[0.08em] text-[var(--brand-muted)]">
            <tr>
              <th className="px-3 py-2">Sigla</th>
              <th className="px-3 py-2">Concepto</th>
              <th className="px-3 py-2">Factor</th>
              <th className="px-3 py-2">Cálculo</th>
              <th className="px-3 py-2">Valor ($)</th>
              <th className="px-3 py-2">Horas</th>
              <th className="px-3 py-2">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row) => {
              const hourly =
                activeEmp?.hourlyRate ?? data?.config.hourlyRate ?? previewHourly;
              const hrs = Number(hoursBySigla[row.sigla] || 0);
              return (
                <tr
                  key={row.sigla}
                  className="border-b border-[var(--brand-line)] last:border-0"
                >
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex rounded border px-1.5 py-0.5 font-data text-[10px] font-bold uppercase tracking-wide ${
                        row.sigla === "HEN" || row.sigla === "HENF"
                          ? "border-rose-500/40 bg-rose-500/15 text-rose-300"
                          : row.sigla === "HED" || row.sigla === "HEDF"
                            ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                            : row.sigla === "RN" || row.sigla === "RNF"
                              ? "border-amber-500/40 bg-amber-500/15 text-amber-300"
                              : "border-slate-600 bg-slate-800/80 text-slate-300"
                      }`}
                    >
                      {row.sigla}
                    </span>
                  </td>
                  <td className="px-3 py-2">{row.concepto}</td>
                  <td className="px-3 py-2 font-data">{factorLabel(row.factor)}</td>
                  <td className="px-3 py-2 font-data text-[var(--brand-muted)]">
                    {money(hourly)} × {factorLabel(row.factor)}
                  </td>
                  <td className="px-3 py-2 font-data font-semibold">
                    {money(row.valor)}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className="w-20 rounded border border-[var(--brand-line)] bg-transparent px-2 py-1 font-data"
                      value={hoursBySigla[row.sigla] ?? ""}
                      placeholder="0"
                      onChange={(e) =>
                        setHoursBySigla((prev) => ({
                          ...prev,
                          [row.sigla]: e.target.value.replace(/[^\d.]/g, ""),
                        }))
                      }
                      inputMode="decimal"
                    />
                  </td>
                  <td className="px-3 py-2 font-data">
                    {money(hrs * row.valor)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-black/10">
              <td colSpan={6} className="px-3 py-2 text-right font-semibold">
                Total recargos / extras (simulación)
              </td>
              <td className="px-3 py-2 font-data font-bold text-[var(--brand-amber,#FFB800)]">
                {money(calcTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
