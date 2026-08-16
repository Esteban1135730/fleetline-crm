"use client";

import { FormEvent, useEffect, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { api } from "@/lib/api";

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

export default function RecepcionPanel() {
  const [rows, setRows] = useState<Visitor[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    purpose: "",
    hostName: "",
    company: "",
  });
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
    await api("/recepcion/visitors", { method: "POST", body: JSON.stringify(form) });
    setForm({ name: "", document: "", purpose: "", hostName: "", company: "" });
    await load();
  }

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <div>
        <h2 className="page-title text-3xl md:text-4xl">Recepción</h2>
        <p className="page-sub">Control de visitantes y triage</p>
      </div>
      <form onSubmit={onCreate} className="fsg-panel grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
        <input className="field" placeholder="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <input className="field" placeholder="Documento" value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} required />
        <input className="field" placeholder="Empresa" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
        <input className="field" placeholder="Motivo" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} required />
        <input className="field" placeholder="Anfitrión" value={form.hostName} onChange={(e) => setForm({ ...form, hostName: e.target.value })} required />
        <Button type="submit" variant="primary">Registrar ingreso</Button>
      </form>
      <div className="fsg-panel data-shell overflow-hidden">
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
              <tr key={r.id} className="border-t border-[var(--brand-line)]">
                <td className="px-4 py-2.5">
                  {r.name}
                  <div className="text-[11px] text-[var(--brand-muted)]">
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
                  <Badge tone={r.checkedOutAt ? "slate" : "emerald"}>
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
                <tr key={`edit-${r.id}`} className="border-t border-[var(--brand-line)] bg-[var(--brand-surface)]">
                  <td colSpan={5} className="px-4 py-3">
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
                        placeholder="Anfitrión"
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
