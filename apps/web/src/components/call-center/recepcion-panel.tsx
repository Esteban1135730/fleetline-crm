"use client";

import { FormEvent, useEffect, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { api } from "@/lib/api";
import {
  clearFieldError,
  splitFormApiError,
} from "@/lib/form-api-error";

type Visitor = {
  id: string;
  name: string;
  document: string;
  company?: string | null;
  purpose: string;
  hostName: string;
  checkedInAt: string;
  checkedOutAt?: string | null;
};

const CREATE_FIELDS = [
  "name",
  "document",
  "purpose",
  "hostName",
  "company",
] as const;

export default function RecepcionPanel() {
  const [rows, setRows] = useState<Visitor[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    purpose: "",
    hostName: "",
    company: "",
  });
  const [editError, setEditError] = useState("");
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    name: "",
    document: "",
    purpose: "",
    hostName: "",
    company: "",
  });

  async function load() {
    setRows(await api<Visitor[]>("/recepcion/visitors"));
  }
  useEffect(() => {
    void load().catch(console.error);
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setFormError("");
    setFieldErrors({});
    try {
      await api("/recepcion/visitors", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setForm({
        name: "",
        document: "",
        purpose: "",
        hostName: "",
        company: "",
      });
      await load();
    } catch (err) {
      const split = splitFormApiError(err, [...CREATE_FIELDS]);
      setFormError(split.formError);
      setFieldErrors(split.fieldErrors);
    }
  }

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <div>
        <h2 className="page-title text-3xl md:text-4xl">Recepción</h2>
        <p className="page-sub">Control de visitantes y triage</p>
      </div>
      <form
        onSubmit={onCreate}
        className="nexa-panel grid grid-cols-1 gap-3 p-4 md:grid-cols-3"
      >
        {formError ? (
          <p
            role="alert"
            className="rounded border border-[var(--brand-danger)]/40 bg-[var(--brand-danger)]/10 px-3 py-2 text-sm text-[var(--brand-danger)] md:col-span-3"
          >
            {formError}
          </p>
        ) : null}
        <div>
          <input
            className={`field ${fieldErrors.name ? "border-[var(--brand-danger)]" : ""}`}
            placeholder="Nombre"
            value={form.name}
            onChange={(e) => {
              setFieldErrors((prev) => clearFieldError(prev, "name"));
              setForm({ ...form, name: e.target.value });
            }}
            required
            aria-invalid={Boolean(fieldErrors.name) || undefined}
          />
          {fieldErrors.name ? (
            <p className="mt-1 text-xs text-[var(--brand-danger)]">
              {fieldErrors.name}
            </p>
          ) : null}
        </div>
        <div>
          <input
            className={`field ${fieldErrors.document ? "border-[var(--brand-danger)]" : ""}`}
            placeholder="Documento"
            value={form.document}
            onChange={(e) => {
              setFieldErrors((prev) => clearFieldError(prev, "document"));
              setForm({ ...form, document: e.target.value });
            }}
            required
            aria-invalid={Boolean(fieldErrors.document) || undefined}
          />
          {fieldErrors.document ? (
            <p className="mt-1 text-xs text-[var(--brand-danger)]">
              {fieldErrors.document}
            </p>
          ) : null}
        </div>
        <div>
          <input
            className={`field ${fieldErrors.company ? "border-[var(--brand-danger)]" : ""}`}
            placeholder="Empresa"
            value={form.company}
            onChange={(e) => {
              setFieldErrors((prev) => clearFieldError(prev, "company"));
              setForm({ ...form, company: e.target.value });
            }}
            aria-invalid={Boolean(fieldErrors.company) || undefined}
          />
          {fieldErrors.company ? (
            <p className="mt-1 text-xs text-[var(--brand-danger)]">
              {fieldErrors.company}
            </p>
          ) : null}
        </div>
        <div>
          <input
            className={`field ${fieldErrors.purpose ? "border-[var(--brand-danger)]" : ""}`}
            placeholder="Motivo"
            value={form.purpose}
            onChange={(e) => {
              setFieldErrors((prev) => clearFieldError(prev, "purpose"));
              setForm({ ...form, purpose: e.target.value });
            }}
            required
            aria-invalid={Boolean(fieldErrors.purpose) || undefined}
          />
          {fieldErrors.purpose ? (
            <p className="mt-1 text-xs text-[var(--brand-danger)]">
              {fieldErrors.purpose}
            </p>
          ) : null}
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--brand-text-secondary)]">
            Anfitrión <span className="text-[var(--brand-danger)]">*</span>
          </label>
          <input
            className={`field ${fieldErrors.hostName ? "border-[var(--brand-danger)]" : ""}`}
            placeholder="Nombre de quien recibe al visitante"
            value={form.hostName}
            onChange={(e) => {
              setFieldErrors((prev) => clearFieldError(prev, "hostName"));
              setForm({ ...form, hostName: e.target.value });
            }}
            required
            aria-invalid={Boolean(fieldErrors.hostName) || undefined}
            title="Persona de la empresa a la que viene a ver el visitante"
          />
          <p className="mt-1 text-xs leading-relaxed text-[var(--brand-text-secondary)]">
            Persona de la empresa que recibe al visitante. Obligatorio para
            avisar al contacto correcto y dejar registro de la visita.
          </p>
          {fieldErrors.hostName ? (
            <p className="mt-1 text-xs text-[var(--brand-danger)]">
              {fieldErrors.hostName}
            </p>
          ) : null}
        </div>
        <Button type="submit" variant="primary">
          Registrar ingreso
        </Button>
      </form>
      <div className="nexa-panel data-shell overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="px-4 py-2">Visitante</th>
              <th className="px-4 py-2">Motivo</th>
              <th className="px-4 py-2">Entrada</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-[var(--brand-border)]">
                <td className="px-4 py-2.5">
                  {r.name}
                  <div className="text-[11px] text-[var(--brand-text-secondary)]">
                    {r.document}
                    {r.company ? ` · ${r.company}` : ""}
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  {r.purpose} → {r.hostName}
                </td>
                <td className="px-4 py-2.5 font-data text-xs">
                  {new Date(r.checkedInAt).toLocaleString("es-CO")}
                </td>
                <td className="px-4 py-2.5">
                  <Badge tone={r.checkedOutAt ? "info" : "success"}>
                    {r.checkedOutAt ? "SALIDA" : "EN SEDE"}
                  </Badge>
                </td>
                <td className="px-4 py-2.5">
                  {!r.checkedOutAt ? (
                    <div className="flex flex-wrap gap-1">
                      <Button
                        variant="ghost"
                        onClick={async () => {
                          await api(`/recepcion/visitors/${r.id}/checkout`, {
                            method: "PATCH",
                          });
                          await load();
                        }}
                      >
                        Registrar salida
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setEditingId(editingId === r.id ? null : r.id);
                          setEditError("");
                          setEditForm({
                            purpose: r.purpose,
                            hostName: r.hostName,
                            company: r.company ?? "",
                          });
                        }}
                      >
                        Editar
                      </Button>
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
            {rows
              .filter((r) => editingId === r.id && !r.checkedOutAt)
              .map((r) => (
                <tr
                  key={`edit-${r.id}`}
                  className="border-t border-[var(--brand-border)] bg-[var(--brand-surface)]"
                >
                  <td colSpan={5} className="px-4 py-3">
                    {editError ? (
                      <p
                        role="alert"
                        className="mb-2 rounded border border-[var(--brand-danger)]/40 bg-[var(--brand-danger)]/10 px-3 py-2 text-sm text-[var(--brand-danger)]"
                      >
                        {editError}
                      </p>
                    ) : null}
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                      <input
                        className="field py-1 text-xs"
                        placeholder="Motivo"
                        value={editForm.purpose}
                        onChange={(e) =>
                          setEditForm({ ...editForm, purpose: e.target.value })
                        }
                      />
                      <input
                        className="field py-1 text-xs"
                        placeholder="Anfitrión (quién recibe)"
                        title="Persona de la empresa que recibe al visitante"
                        value={editForm.hostName}
                        onChange={(e) =>
                          setEditForm({ ...editForm, hostName: e.target.value })
                        }
                      />
                      <input
                        className="field py-1 text-xs"
                        placeholder="Empresa"
                        value={editForm.company}
                        onChange={(e) =>
                          setEditForm({ ...editForm, company: e.target.value })
                        }
                      />
                      <Button
                        variant="primary"
                        onClick={async () => {
                          setEditError("");
                          try {
                            await api(`/recepcion/visitors/${r.id}`, {
                              method: "PATCH",
                              body: JSON.stringify({
                                purpose: editForm.purpose,
                                hostName: editForm.hostName,
                                company: editForm.company || undefined,
                              }),
                            });
                            setEditingId(null);
                            await load();
                          } catch (err) {
                            setEditError(
                              err instanceof Error
                                ? err.message
                                : "No se pudo guardar",
                            );
                          }
                        }}
                      >
                        Guardar
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
