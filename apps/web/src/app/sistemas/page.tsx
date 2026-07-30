"use client";

import { FormEvent, useEffect, useState } from "react";
import { Badge, Button, StatCard } from "@fsg/ui";
import { api } from "@/lib/api";
import { HowToBox, PageIntro } from "@/components/page-intro";

type Health = {
  api: string;
  db: string;
  dbLatencyMs: number;
  openAlerts: number;
  activeUsers: number;
  tripsIndexed: number;
  vehicles: number;
  uptime: string;
  checkedAt: string;
};

type Alert = {
  id: string;
  severity: string;
  source: string;
  message: string;
  resolved: boolean;
  createdAt: string;
};

export default function SistemasPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertForm, setAlertForm] = useState({
    severity: "INFO",
    source: "",
    message: "",
  });

  async function load() {
    const [h, a] = await Promise.all([
      api<Health>("/sistemas/health"),
      api<Alert[]>("/sistemas/alerts"),
    ]);
    setHealth(h);
    setAlerts(a);
  }

  useEffect(() => {
    void load().catch(console.error);
  }, []);

  async function onCreateAlert(e: FormEvent) {
    e.preventDefault();
    await api("/sistemas/alerts", {
      method: "POST",
      body: JSON.stringify(alertForm),
    });
    setAlertForm({ severity: "INFO", source: "", message: "" });
    await load();
  }

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <PageIntro module="sistemas" title="Estado del sistema" />
      <HowToBox
        steps={[
          "API y base de datos se verifican con un ping real a Postgres.",
          "El uptime es el del proceso API desde el último arranque.",
          "Las alertas son registros operativos en la base (crear/resolver desde aquí).",
        ]}
      />

      {health ? (
        <div className="stagger grid grid-cols-1 gap-4 md:grid-cols-4">
          <StatCard
            label="API"
            value={health.api.toUpperCase()}
            accent="emerald"
          />
          <StatCard
            label="Base de datos"
            value={health.db.toUpperCase()}
            hint={`${health.dbLatencyMs} ms`}
            accent={health.db === "ok" ? "emerald" : "rose"}
          />
          <StatCard
            label="Usuarios activos"
            value={String(health.activeUsers)}
            accent="cyan"
          />
          <StatCard
            label="Uptime proceso"
            value={health.uptime}
            hint={`${health.vehicles} vehículos · ${health.tripsIndexed} viajes`}
            accent="amber"
          />
        </div>
      ) : null}

      <form
        onSubmit={onCreateAlert}
        className="fsg-panel grid grid-cols-1 gap-3 p-4 md:grid-cols-4"
      >
        <select
          className="field"
          value={alertForm.severity}
          onChange={(e) =>
            setAlertForm({ ...alertForm, severity: e.target.value })
          }
        >
          <option value="INFO">Info</option>
          <option value="WARN">Advertencia</option>
          <option value="CRITICAL">Crítica</option>
        </select>
        <input
          className="field"
          placeholder="Fuente (ej. API, DB)"
          value={alertForm.source}
          onChange={(e) =>
            setAlertForm({ ...alertForm, source: e.target.value })
          }
          required
        />
        <input
          className="field md:col-span-2"
          placeholder="Mensaje"
          value={alertForm.message}
          onChange={(e) =>
            setAlertForm({ ...alertForm, message: e.target.value })
          }
          required
        />
        <Button type="submit" variant="primary" className="md:col-span-4">
          Crear alerta
        </Button>
      </form>

      <div className="fsg-panel data-shell overflow-hidden">
        <div className="border-b border-[var(--brand-line)] px-4 py-3 font-display text-sm font-semibold">
          Alertas ({alerts.filter((a) => !a.resolved).length} abiertas)
        </div>
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="px-4 py-2">Severidad</th>
              <th className="px-4 py-2">Fuente</th>
              <th className="px-4 py-2">Mensaje</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {alerts.map((a) => (
              <tr key={a.id} className="border-t border-[var(--brand-line)]">
                <td className="px-4 py-2.5">
                  <Badge tone={a.severity === "WARN" ? "amber" : "cyan"}>
                    {a.severity}
                  </Badge>
                </td>
                <td className="px-4 py-2.5">{a.source}</td>
                <td className="px-4 py-2.5">{a.message}</td>
                <td className="px-4 py-2.5">
                  <Badge tone={a.resolved ? "emerald" : "rose"}>
                    {a.resolved ? "OK" : "ABIERTA"}
                  </Badge>
                </td>
                <td className="px-4 py-2.5">
                  {!a.resolved ? (
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        await api(`/sistemas/alerts/${a.id}/resolve`, {
                          method: "PATCH",
                        });
                        await load();
                      }}
                    >
                      Resolver
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
