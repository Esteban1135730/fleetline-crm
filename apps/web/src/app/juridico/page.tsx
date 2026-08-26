"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@fsg/ui";
import { FileDown, Plus } from "lucide-react";
import { api, apiDownload } from "@/lib/api";
import { EmptyState, Modal } from "@/components/audit";

type FuecRow = {
  id: string;
  number: string;
  contractor: string;
  route: string;
  status: string;
  validTo: string;
  contractNumber?: string | null;
  vehicle?: { plate: string } | null;
  pdfUrl?: string | null;
};

type DocCheck = {
  type: string;
  label: string;
  number: string | null;
  expiresAt: string | null;
  expired: boolean;
  missing: boolean;
};

type FormOptions = {
  organization: { name: string; nit: string };
  vehicles: Array<{
    id: string;
    plate: string;
    brand: string;
    model: string;
    year: number;
  }>;
  drivers: Array<{
    id: string;
    name: string;
    document: string;
    licenseNumber: string | null;
    licenseExpiresAt: string | null;
    dispatchBlocked: boolean;
  }>;
  customers: Array<{ id: string; name: string; nit: string; phone: string | null }>;
  nextNumber: string;
};

type VehicleCtx = {
  vehicle: {
    id: string;
    plate: string;
    brand: string;
    model: string;
    year: number;
    vehicleClass: string;
    internalNumber: string;
    operationCard: string;
  };
  importantDocs: DocCheck[];
  blocked: boolean;
  blockMessage: string | null;
};

const emptyOwner = {
  firstName: "",
  lastNamePaternal: "",
  lastNameMaternal: "",
  document: "",
  phone: "",
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function plusDays(n: number) {
  return new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
}

export default function JuridicoPage() {
  const [rows, setRows] = useState<FuecRow[]>([]);
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<FormOptions | null>(null);
  const [ctx, setCtx] = useState<VehicleCtx | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    customerId: "",
    contractorName: "",
    contractorNit: "",
    contractorAddress: "",
    contractorPhone: "",
    contractNumber: "",
    contractObject: "Contrato para transporte de empleados",
    validFrom: todayIso(),
    validTo: plusDays(30),
    origin: "",
    destination: "",
    routeDescription: "",
    consortium: "",
    responsibleName: "",
    responsibleDocument: "",
    responsiblePhone: "",
    responsibleAddress: "",
    vehicleId: "",
    driverId1: "",
    driverId2: "",
    driverId3: "",
    owner: { ...emptyOwner },
  });

  const load = useCallback(async () => {
    setRows(await api.get<FuecRow[]>("/juridico/fuec"));
  }, []);

  useEffect(() => {
    void load().catch(console.error);
  }, [load]);

  async function openModal() {
    setError(null);
    setCtx(null);
    const opts = await api.get<FormOptions>("/juridico/fuec/options");
    setOptions(opts);
    setForm((f) => ({
      ...f,
      contractNumber: f.contractNumber || `CTR-${opts.nextNumber.slice(-6)}`,
    }));
    setOpen(true);
  }

  async function onVehicleChange(vehicleId: string) {
    setForm((f) => ({ ...f, vehicleId }));
    if (!vehicleId) {
      setCtx(null);
      return;
    }
    try {
      const c = await api.get<VehicleCtx>(
        `/juridico/fuec/vehicle-context/${vehicleId}`,
      );
      setCtx(c);
    } catch (e) {
      setCtx(null);
      setError(e instanceof Error ? e.message : "Sin contexto de vehículo");
    }
  }

  function onCustomerChange(customerId: string) {
    const c = options?.customers.find((x) => x.id === customerId);
    setForm((f) => ({
      ...f,
      customerId,
      contractorName: c?.name ?? f.contractorName,
      contractorNit: c?.nit ?? f.contractorNit,
      contractorPhone: c?.phone ?? f.contractorPhone,
    }));
  }

  const driverBlocked = useMemo(() => {
    if (!options) return false;
    const ids = [form.driverId1, form.driverId2, form.driverId3].filter(Boolean);
    return ids.some((id) => {
      const d = options.drivers.find((x) => x.id === id);
      if (!d) return true;
      if (d.dispatchBlocked) return true;
      if (!d.licenseExpiresAt) return true;
      const days =
        (new Date(d.licenseExpiresAt).getTime() -
          new Date(new Date().toDateString()).getTime()) /
        86400000;
      return days < 0;
    });
  }, [form.driverId1, form.driverId2, form.driverId3, options]);

  const canSave =
    Boolean(form.vehicleId && form.driverId1 && form.contractorName) &&
    !ctx?.blocked &&
    !driverBlocked &&
    !saving;

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const created = await api.post<FuecRow & { id: string }>("/juridico/fuec", {
        contractNumber: form.contractNumber,
        contractorName: form.contractorName,
        contractorNit: form.contractorNit,
        contractorAddress: form.contractorAddress,
        contractorPhone: form.contractorPhone,
        contractObject: form.contractObject,
        origin: form.origin,
        destination: form.destination,
        routeDescription: form.routeDescription,
        consortium: form.consortium,
        validFrom: form.validFrom,
        validTo: form.validTo,
        responsibleName: form.responsibleName,
        responsibleDocument: form.responsibleDocument,
        responsiblePhone: form.responsiblePhone,
        responsibleAddress: form.responsibleAddress,
        vehicleId: form.vehicleId,
        driverIds: [form.driverId1, form.driverId2, form.driverId3].filter(
          Boolean,
        ),
        owner: form.owner,
      });
      setOpen(false);
      await load();
      await apiDownload(
        `/juridico/fuec/${created.id}/pdf`,
        `FUEC-${created.number}.pdf`,
      );
    } catch (err) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : err instanceof Error
            ? err.message
            : "No se pudo crear el FUEC";
      setError(msg);
      if (err && typeof err === "object" && "docs" in err) {
        const docs = (err as { docs: DocCheck[] }).docs;
        if (Array.isArray(docs) && ctx) {
          setCtx({ ...ctx, importantDocs: docs, blocked: true, blockMessage: msg });
        }
      }
    } finally {
      setSaving(false);
    }
  }

  function driverPreview(id: string) {
    return options?.drivers.find((d) => d.id === id) ?? null;
  }

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="page-title text-3xl md:text-4xl">Contratos FUEC</h2>
          <p className="page-sub">
            Extracto único imprimible · hard-stop documental
          </p>
        </div>
        <Button
          type="button"
          variant="primary"
          className="w-auto px-4 py-2"
          onClick={() => void openModal()}
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Nuevo contrato
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Sin extractos FUEC"
          description="Crea un contrato cuando SOAT, RCC-RCE, tarjeta de operación y afiliación estén vigentes."
          actionLabel="Nuevo contrato"
          onAction={() => void openModal()}
        />
      ) : (
        <div className="fsg-panel data-shell overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="px-4 py-2">Extracto</th>
                <th className="px-4 py-2">Contratante</th>
                <th className="px-4 py-2">Ruta</th>
                <th className="px-4 py-2">Placa</th>
                <th className="px-4 py-2">Vence</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2 text-right">PDF</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-[var(--brand-line)]">
                  <td className="px-4 py-2.5 font-data text-xs">{r.number}</td>
                  <td className="px-4 py-2.5">{r.contractor}</td>
                  <td className="px-4 py-2.5 text-xs">{r.route}</td>
                  <td className="px-4 py-2.5 font-data text-xs">
                    {r.vehicle?.plate ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 font-data text-xs">
                    {r.validTo.slice(0, 10)}
                  </td>
                  <td className="px-4 py-2.5 text-xs">{r.status}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Button
                      type="button"
                      variant="secondary"
                      className="w-auto px-3 py-1.5 text-xs"
                      onClick={() =>
                        void apiDownload(
                          `/juridico/fuec/${r.id}/pdf`,
                          `FUEC-${r.number}.pdf`,
                        )
                      }
                    >
                      <FileDown className="mr-1 h-3.5 w-3.5" />
                      Descargar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nuevo Contrato"
        description={
          options
            ? `Extracto N° ${options.nextNumber} · ${options.organization.name}`
            : "Cargando opciones…"
        }
        size="xl"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              className="w-auto"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="fuec-create-form"
              variant="primary"
              className="w-auto"
              disabled={!canSave}
            >
              {saving ? "Generando…" : "Guardar y descargar PDF"}
            </Button>
          </div>
        }
      >
        <form
          id="fuec-create-form"
          onSubmit={(e) => void onCreate(e)}
          className="space-y-5 overflow-y-auto px-1"
        >
          <ul className="list-disc space-y-1 pl-5 text-xs text-[var(--text-secondary)]">
            <li>Campos con (*) son obligatorios.</li>
            <li>
              Si un conductor tiene licencia vencida o bloqueo, no se genera el
              FUEC.
            </li>
            <li>Algunos campos se completan al seleccionar placa o cliente.</li>
          </ul>

          {error ? (
            <div className="rounded-lg border border-[#FF2A5F]/40 bg-[#FF2A5F]/10 px-3 py-2 text-sm text-[#FF2A5F]">
              {error}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <Field label="Persona ó Empresa que contrata (*)">
                <select
                  className="field"
                  value={form.customerId}
                  onChange={(e) => onCustomerChange(e.target.value)}
                >
                  <option value="">— Seleccionar / manual —</option>
                  {options?.customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Nombre contratante (*)">
                <input
                  className="field"
                  required
                  value={form.contractorName}
                  onChange={(e) =>
                    setForm({ ...form, contractorName: e.target.value })
                  }
                />
              </Field>
              <Field label="NIT ó C.C">
                <input
                  className="field font-data"
                  value={form.contractorNit}
                  onChange={(e) =>
                    setForm({ ...form, contractorNit: e.target.value })
                  }
                />
              </Field>
              <Field label="Contratante dirección">
                <input
                  className="field"
                  value={form.contractorAddress}
                  onChange={(e) =>
                    setForm({ ...form, contractorAddress: e.target.value })
                  }
                />
              </Field>
              <Field label="Contratante Teléfono">
                <input
                  className="field font-data"
                  value={form.contractorPhone}
                  onChange={(e) =>
                    setForm({ ...form, contractorPhone: e.target.value })
                  }
                />
              </Field>
              <Field label="Contrato N° (*)">
                <input
                  className="field font-data"
                  required
                  value={form.contractNumber}
                  onChange={(e) =>
                    setForm({ ...form, contractNumber: e.target.value })
                  }
                />
              </Field>
              <Field label="Objeto contrato (*)">
                <input
                  className="field"
                  required
                  value={form.contractObject}
                  onChange={(e) =>
                    setForm({ ...form, contractObject: e.target.value })
                  }
                />
              </Field>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Fecha Inicial (*)">
                  <input
                    className="field font-data"
                    type="date"
                    required
                    value={form.validFrom}
                    onChange={(e) =>
                      setForm({ ...form, validFrom: e.target.value })
                    }
                  />
                </Field>
                <Field label="Fecha Vencimiento (*)">
                  <input
                    className="field font-data"
                    type="date"
                    required
                    value={form.validTo}
                    onChange={(e) =>
                      setForm({ ...form, validTo: e.target.value })
                    }
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Ciudad Origen (*)">
                  <input
                    className="field"
                    required
                    value={form.origin}
                    onChange={(e) =>
                      setForm({ ...form, origin: e.target.value })
                    }
                  />
                </Field>
                <Field label="Ciudad Destino (*)">
                  <input
                    className="field"
                    required
                    value={form.destination}
                    onChange={(e) =>
                      setForm({ ...form, destination: e.target.value })
                    }
                  />
                </Field>
              </div>
              <Field label="Descripción del recorrido (*)">
                <textarea
                  className="field min-h-[72px]"
                  required
                  value={form.routeDescription}
                  onChange={(e) =>
                    setForm({ ...form, routeDescription: e.target.value })
                  }
                />
              </Field>
              <Field label="Convenio/Consorcio/Union temporal con:">
                <input
                  className="field"
                  value={form.consortium}
                  onChange={(e) =>
                    setForm({ ...form, consortium: e.target.value })
                  }
                />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Responsable del contratante">
                  <input
                    className="field"
                    value={form.responsibleName}
                    onChange={(e) =>
                      setForm({ ...form, responsibleName: e.target.value })
                    }
                  />
                </Field>
                <Field label="N° Cédula">
                  <input
                    className="field font-data"
                    value={form.responsibleDocument}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        responsibleDocument: e.target.value,
                      })
                    }
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Dirección">
                  <input
                    className="field"
                    value={form.responsibleAddress}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        responsibleAddress: e.target.value,
                      })
                    }
                  />
                </Field>
                <Field label="Teléfono">
                  <input
                    className="field font-data"
                    value={form.responsiblePhone}
                    onChange={(e) =>
                      setForm({ ...form, responsiblePhone: e.target.value })
                    }
                  />
                </Field>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-3 rounded-lg border border-[var(--border-subtle)] p-3">
              <h3 className="text-sm font-semibold">Datos del vehículo</h3>
              <Field label="Placa (*)">
                <select
                  className="field font-data"
                  required
                  value={form.vehicleId}
                  onChange={(e) => void onVehicleChange(e.target.value)}
                >
                  <option value="">— Seleccionar —</option>
                  {options?.vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.plate} · {v.brand} {v.model}
                    </option>
                  ))}
                </select>
              </Field>
              {ctx ? (
                <div className="grid grid-cols-2 gap-2 text-xs text-[var(--text-secondary)]">
                  <div>
                    Modelo:{" "}
                    <span className="font-data text-[var(--text-primary)]">
                      {ctx.vehicle.model}
                    </span>
                  </div>
                  <div>
                    Marca:{" "}
                    <span className="text-[var(--text-primary)]">
                      {ctx.vehicle.brand}
                    </span>
                  </div>
                  <div>
                    Clase:{" "}
                    <span className="text-[var(--text-primary)]">
                      {ctx.vehicle.vehicleClass}
                    </span>
                  </div>
                  <div>
                    N° interno:{" "}
                    <span className="font-data text-[var(--text-primary)]">
                      {ctx.vehicle.internalNumber}
                    </span>
                  </div>
                  <div className="col-span-2">
                    Tarjeta operación:{" "}
                    <span className="font-data text-[var(--text-primary)]">
                      {ctx.vehicle.operationCard || "—"}
                    </span>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="space-y-3 rounded-lg border border-[var(--border-subtle)] p-3">
              <h3 className="text-sm font-semibold">Datos propietario</h3>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Nombre(s) (*)">
                  <input
                    className="field"
                    required
                    value={form.owner.firstName}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        owner: { ...form.owner, firstName: e.target.value },
                      })
                    }
                  />
                </Field>
                <Field label="Apellido Paterno (*)">
                  <input
                    className="field"
                    required
                    value={form.owner.lastNamePaternal}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        owner: {
                          ...form.owner,
                          lastNamePaternal: e.target.value,
                        },
                      })
                    }
                  />
                </Field>
                <Field label="Apellido Materno">
                  <input
                    className="field"
                    value={form.owner.lastNameMaternal}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        owner: {
                          ...form.owner,
                          lastNameMaternal: e.target.value,
                        },
                      })
                    }
                  />
                </Field>
                <Field label="N° de C.C (*)">
                  <input
                    className="field font-data"
                    required
                    value={form.owner.document}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        owner: { ...form.owner, document: e.target.value },
                      })
                    }
                  />
                </Field>
                <Field label="Teléfono/Celular (*)">
                  <input
                    className="field font-data"
                    required
                    value={form.owner.phone}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        owner: { ...form.owner, phone: e.target.value },
                      })
                    }
                  />
                </Field>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Datos de los conductores</h3>
              {[1, 2, 3].map((n) => {
                const key = `driverId${n}` as
                  | "driverId1"
                  | "driverId2"
                  | "driverId3";
                const d = driverPreview(form[key]);
                return (
                  <div
                    key={n}
                    className="rounded-lg border border-[var(--border-subtle)] p-3"
                  >
                    <Field label={`Conductor N° ${n}${n === 1 ? " (*)" : ""}`}>
                      <select
                        className="field"
                        required={n === 1}
                        value={form[key]}
                        onChange={(e) =>
                          setForm({ ...form, [key]: e.target.value })
                        }
                      >
                        <option value="">— Seleccionar —</option>
                        {options?.drivers.map((dr) => (
                          <option key={dr.id} value={dr.id}>
                            {dr.name} · {dr.document}
                          </option>
                        ))}
                      </select>
                    </Field>
                    {d ? (
                      <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-[var(--text-secondary)]">
                        <span>
                          Licencia:{" "}
                          <span className="font-data text-[var(--text-primary)]">
                            {d.licenseNumber || "—"}
                          </span>
                        </span>
                        <span>
                          Vigencia:{" "}
                          <span className="font-data text-[var(--text-primary)]">
                            {d.licenseExpiresAt?.slice(0, 10) || "—"}
                          </span>
                        </span>
                        {d.dispatchBlocked ? (
                          <span className="col-span-2 text-[#FF2A5F]">
                            Bloqueado para despacho
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {driverBlocked ? (
                <p className="text-xs text-[#FF2A5F]">
                  Conductor con licencia vencida o bloqueo — FUEC bloqueado.
                </p>
              ) : null}
            </div>

            <div className="rounded-lg border border-[var(--border-subtle)] p-3">
              <h3 className="mb-3 text-sm font-semibold">Datos Importantes</h3>
              {ctx ? (
                <>
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="text-[var(--text-secondary)]">
                        <th className="pb-2">Estados de cuenta</th>
                        <th className="pb-2">Numero</th>
                        <th className="pb-2">Vencimiento</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ctx.importantDocs.map((d) => (
                        <tr
                          key={d.type}
                          className="border-t border-[var(--border-subtle)]"
                        >
                          <td className="py-2">{d.label}</td>
                          <td className="py-2 font-data">
                            {d.number || "—"}
                          </td>
                          <td className="py-2">
                            <span
                              className={`inline-block rounded px-2 py-0.5 font-data ${
                                d.expired || d.missing
                                  ? "bg-[#FF2A5F]/20 text-[#FF2A5F]"
                                  : "bg-[#10B981]/20 text-[#10B981]"
                              }`}
                            >
                              {d.expiresAt?.slice(0, 10) ||
                                (d.missing ? "Sin registro" : "—")}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {ctx.blocked ? (
                    <div className="mt-3 rounded-md border border-[#FF2A5F]/40 bg-[#FF2A5F]/10 px-3 py-2 text-xs text-[#FF2A5F]">
                      {ctx.blockMessage ||
                        "Error! No se puede crear el FUEC ya que existen fechas de vencimiento caducas!."}
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="text-xs text-[var(--text-secondary)]">
                  Selecciona una placa para validar SOAT, RCC-RCE, tarjeta de
                  operación y afiliación.
                </p>
              )}
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-medium text-[var(--text-secondary)]">
        {label}
      </span>
      {children}
    </label>
  );
}
