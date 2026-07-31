"use client";

import { FormEvent, useEffect, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { api } from "@/lib/api";

type Finding = {
  id: string;
  code: string;
  title: string;
  severity: string;
  status: string;
  detail: string;
  amount?: string | number | null;
};

export default function RevisoriaPage() {
  const [rows, setRows] = useState<Finding[]>([]);
  const [form, setForm] = useState({
    title: "",
    detail: "",
    severity: "MEDIUM",
    amount: "",
  });

  async function load() {
    setRows(await api<Finding[]>("/revisoria/findings"));
  }
  useEffect(() => {
    void load().catch(console.error);
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    await api("/revisoria/findings", {
      method: "POST",
      body: JSON.stringify({
        title: form.title,
        detail: form.detail,
        severity: form.severity,
        amount: form.amount ? Number(form.amount) : undefined,
      }),
    });
    setForm({ title: "", detail: "", severity: "MEDIUM", amount: "" });
    await load();
  }

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <div>
        <h2 className="page-title text-3xl md:text-4xl">Revisoría forense</h2>
        <p className="page-sub">Hallazgos de auditoría y control interno</p>
      </div>
      <form
        onSubmit={onCreate}
        className="fsg-panel grid grid-cols-1 gap-3 p-4 md:grid-cols-2"
      >
        <input
          className="field"
          placeholder="Título"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          required
        />
        <select
          className="field"
          value={form.severity}
          onChange={(e) => setForm({ ...form, severity: e.target.value })}
        >
          <option value="LOW">Baja</option>
          <option value="MEDIUM">Media</option>
          <option value="HIGH">Alta</option>
        </select>
        <input
          className="field md:col-span-2"
          placeholder="Detalle"
          value={form.detail}
          onChange={(e) => setForm({ ...form, detail: e.target.value })}
          required
        />
        <input
          className="field"
          placeholder="Monto (opcional)"
          value={form.amount}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
        />
        <Button type="submit" variant="primary">
          Registrar hallazgo
        </Button>
      </form>
      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.id} className="fsg-panel p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-data text-xs text-[var(--brand-primary)]">
                {r.code}
              </span>
              <Badge
                tone={
                  r.severity === "HIGH"
                    ? "rose"
                    : r.severity === "MEDIUM"
                      ? "amber"
                      : "cyan"
                }
              >
                {r.severity}
              </Badge>
              <Badge tone={r.status === "OPEN" ? "rose" : "emerald"}>
                {r.status}
              </Badge>
            </div>
            <h3 className="mt-2 font-semibold">{r.title}</h3>
            <p className="mt-1 text-sm text-[var(--brand-muted)]">{r.detail}</p>
            {r.amount ? (
              <p className="font-data mt-2 text-xs">
                ${Number(r.amount).toLocaleString("es-CO")}
              </p>
            ) : null}
            {r.status === "OPEN" ? (
              <Button
                variant="ghost"
                className="mt-3"
                onClick={async () => {
                  await api(`/revisoria/findings/${r.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({ status: "CLOSED" }),
                  });
                  await load();
                }}
              >
                Cerrar
              </Button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
