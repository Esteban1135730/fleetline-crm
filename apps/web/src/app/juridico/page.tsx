"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button } from "@fsg/ui";
import { api } from "@/lib/api";

type Fuec = {
  id: string;
  number: string;
  contractor: string;
  route: string;
  status: string;
  validTo: string;
  vehicle?: { plate: string } | null;
};

export default function JuridicoPage() {
  const [rows, setRows] = useState<Fuec[]>([]);
  const [form, setForm] = useState({
    number: "",
    contractor: "",
    route: "",
    validFrom: new Date().toISOString().slice(0, 10),
    validTo: new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10),
  });

  async function load() {
    setRows(await api<Fuec[]>("/juridico/fuec"));
  }
  useEffect(() => {
    void load().catch(console.error);
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    await api("/juridico/fuec", { method: "POST", body: JSON.stringify(form) });
    setForm({ ...form, number: "", contractor: "", route: "" });
    await load();
  }

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <div>
        <h2 className="page-title text-3xl md:text-4xl">Jurídico (FUEC)</h2>
        <p className="page-sub">Extractos contractuales y vigencia documental</p>
      </div>
      <form onSubmit={onCreate} className="fsg-panel grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
        <input className="field" placeholder="Número FUEC" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} required />
        <input className="field" placeholder="Contratante" value={form.contractor} onChange={(e) => setForm({ ...form, contractor: e.target.value })} required />
        <input className="field" placeholder="Ruta" value={form.route} onChange={(e) => setForm({ ...form, route: e.target.value })} required />
        <input className="field" type="date" value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} />
        <input className="field" type="date" value={form.validTo} onChange={(e) => setForm({ ...form, validTo: e.target.value })} />
        <Button type="submit" variant="primary">Registrar FUEC</Button>
      </form>
      <div className="fsg-panel data-shell overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="px-4 py-2">Número</th>
              <th className="px-4 py-2">Contratante</th>
              <th className="px-4 py-2">Ruta</th>
              <th className="px-4 py-2">Vence</th>
              <th className="px-4 py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-[var(--brand-line)]">
                <td className="px-4 py-2.5 font-data text-xs">{r.number}</td>
                <td className="px-4 py-2.5">{r.contractor}</td>
                <td className="px-4 py-2.5">
                  <input
                    className="field py-1 text-xs"
                    defaultValue={r.route}
                    onBlur={async (e) => {
                      if (e.target.value === r.route) return;
                      await api(`/juridico/fuec/${r.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({ route: e.target.value }),
                      });
                      await load();
                    }}
                  />
                  {r.vehicle ? (
                    <div className="text-[10px] text-[var(--brand-muted)]">{r.vehicle.plate}</div>
                  ) : null}
                </td>
                <td className="px-4 py-2.5">
                  <input
                    className="field py-1 text-xs font-data"
                    type="date"
                    defaultValue={r.validTo.slice(0, 10)}
                    onBlur={async (e) => {
                      if (e.target.value === r.validTo.slice(0, 10)) return;
                      await api(`/juridico/fuec/${r.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({ validTo: e.target.value }),
                      });
                      await load();
                    }}
                  />
                </td>
                <td className="px-4 py-2.5">
                  <select
                    className="field py-1 text-xs"
                    value={r.status}
                    onChange={async (e) => {
                      await api(`/juridico/fuec/${r.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({ status: e.target.value }),
                      });
                      await load();
                    }}
                  >
                    <option value="VALID">Vigente</option>
                    <option value="EXPIRING">Por vencer</option>
                    <option value="EXPIRED">Vencido</option>
                    <option value="PENDING">Pendiente</option>
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
