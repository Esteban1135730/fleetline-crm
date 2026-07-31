"use client";

import { FormEvent, useEffect, useState } from "react";
import { Badge, Button, StatCard } from "@fsg/ui";
import { api } from "@/lib/api";

type Summary = {
  total: number;
  open: number;
  nps: number | null;
  incidents: number;
};
type Event = { id: string; type: string; title: string; score?: number | null; status: string; description?: string | null };

export default function CalidadPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [rows, setRows] = useState<Event[]>([]);
  const [form, setForm] = useState({ type: "NPS", title: "", score: "5" });

  async function load() {
    const [s, e] = await Promise.all([
      api<Summary>("/calidad/summary"),
      api<Event[]>("/calidad/events"),
    ]);
    setSummary(s);
    setRows(e);
  }
  useEffect(() => {
    void load().catch(console.error);
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    await api("/calidad/events", {
      method: "POST",
      body: JSON.stringify({
        type: form.type,
        title: form.title,
        score: form.type === "NPS" ? Number(form.score) : undefined,
      }),
    });
    setForm({ type: "NPS", title: "", score: "5" });
    await load();
  }

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <div>
        <h2 className="page-title text-3xl md:text-4xl">QHSE & NPS</h2>
        <p className="page-sub">Calidad, seguridad y satisfacción</p>
      </div>
      {summary ? (
        <div className="stagger grid grid-cols-1 gap-4 md:grid-cols-4">
          <StatCard
            label="NPS"
            value={summary.nps != null ? String(summary.nps) : "—"}
            accent="emerald"
          />
          <StatCard label="Eventos" value={String(summary.total)} accent="cyan" />
          <StatCard label="Abiertos" value={String(summary.open)} accent="amber" />
          <StatCard label="Incidentes" value={String(summary.incidents)} accent="rose" />
        </div>
      ) : null}
      <form onSubmit={onCreate} className="fsg-panel grid grid-cols-1 gap-3 p-4 md:grid-cols-4">
        <select className="field" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
          <option value="NPS">NPS</option>
          <option value="INCIDENT">Incidente</option>
          <option value="AUDIT">Auditoría</option>
        </select>
        <input className="field md:col-span-2" placeholder="Título" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
        <Button type="submit" variant="primary">Registrar</Button>
      </form>
      <div className="fsg-panel data-shell overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="px-4 py-2">Tipo</th>
              <th className="px-4 py-2">Título</th>
              <th className="px-4 py-2">Score</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-[var(--brand-line)]">
                <td className="px-4 py-2.5"><Badge>{r.type}</Badge></td>
                <td className="px-4 py-2.5">{r.title}</td>
                <td className="px-4 py-2.5 font-data">{r.score ?? "—"}</td>
                <td className="px-4 py-2.5"><Badge tone={r.status === "OPEN" ? "rose" : "emerald"}>{r.status}</Badge></td>
                <td className="px-4 py-2.5">
                  {r.status === "OPEN" ? (
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        await api(`/calidad/events/${r.id}`, {
                          method: "PATCH",
                          body: JSON.stringify({ status: "CLOSED" }),
                        });
                        await load();
                      }}
                    >
                      Cerrar
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
