"use client";

import { FormEvent, useEffect, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { api } from "@/lib/api";

type Check = {
  id: string;
  subjectName: string;
  subjectDoc: string;
  risk: string;
  notes?: string | null;
  checkedAt: string;
};

export default function SarlaftPage() {
  const [rows, setRows] = useState<Check[]>([]);
  const [form, setForm] = useState({
    subjectName: "",
    subjectDoc: "",
    risk: "LOW",
    notes: "",
  });

  async function load() {
    setRows(await api<Check[]>("/sarlaft/checks"));
  }
  useEffect(() => {
    void load().catch(console.error);
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    await api("/sarlaft/checks", { method: "POST", body: JSON.stringify(form) });
    setForm({ subjectName: "", subjectDoc: "", risk: "LOW", notes: "" });
    await load();
  }

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <div>
        <h2 className="page-title text-3xl md:text-4xl">SARLAFT</h2>
        <p className="page-sub">Debida diligencia y clasificación de riesgo</p>
      </div>
      <form onSubmit={onCreate} className="fsg-panel grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
        <input className="field" placeholder="Nombre / razón social" value={form.subjectName} onChange={(e) => setForm({ ...form, subjectName: e.target.value })} required />
        <input className="field" placeholder="Documento / NIT" value={form.subjectDoc} onChange={(e) => setForm({ ...form, subjectDoc: e.target.value })} required />
        <select className="field" value={form.risk} onChange={(e) => setForm({ ...form, risk: e.target.value })}>
          <option value="LOW">Bajo</option>
          <option value="MEDIUM">Medio</option>
          <option value="HIGH">Alto</option>
          <option value="BLOCKED">Bloqueado</option>
        </select>
        <input className="field" placeholder="Notas" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        <Button type="submit" variant="primary" className="md:col-span-2">Registrar chequeo</Button>
      </form>
      <div className="fsg-panel data-shell overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="px-4 py-2">Sujeto</th>
              <th className="px-4 py-2">Documento</th>
              <th className="px-4 py-2">Riesgo</th>
              <th className="px-4 py-2">Fecha</th>
              <th className="px-4 py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-[var(--brand-line)]">
                <td className="px-4 py-2.5">
                  {r.subjectName}
                  {r.notes ? <div className="text-[11px] text-[var(--brand-muted)]">{r.notes}</div> : null}
                </td>
                <td className="px-4 py-2.5 font-data text-xs">{r.subjectDoc}</td>
                <td className="px-4 py-2.5">
                  <Badge tone={r.risk === "LOW" ? "emerald" : r.risk === "MEDIUM" ? "amber" : "rose"}>
                    {r.risk}
                  </Badge>
                </td>
                <td className="px-4 py-2.5 font-data text-xs">
                  {new Date(r.checkedAt).toLocaleString("es-CO")}
                </td>
                <td className="px-4 py-2.5">
                  <select
                    className="field py-1 text-xs"
                    value={r.risk}
                    onChange={async (e) => {
                      await api(`/sarlaft/checks/${r.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({ risk: e.target.value }),
                      });
                      await load();
                    }}
                  >
                    <option value="LOW">Bajo</option>
                    <option value="MEDIUM">Medio</option>
                    <option value="HIGH">Alto</option>
                    <option value="BLOCKED">Bloqueado</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
