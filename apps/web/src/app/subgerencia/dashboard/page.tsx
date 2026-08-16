"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { api } from "@/lib/api";
import { statusEs } from "@fsg/shared";
import { HowToBox, PageIntro } from "@/components/page-intro";

type Conflict = {
  id: string;
  code: string;
  title: string;
  parties: string[];
  status: string;
};

type Project = {
  id: string;
  code: string;
  title: string;
  status: string;
  kind: string;
  deadheadKmSaved?: number | null;
};

type Dash = {
  heatmap: Array<{ area: string; severity: number; label: string }>;
  deadheadKm: number;
  satelliteYards: Array<{ code: string; name: string; capacity: number }>;
  conflictsOpen: Conflict[];
  kanban: {
    BACKLOG: Project[];
    IN_PROGRESS: Project[];
    DONE: Project[];
  };
};

export default function SubgerenciaDashboard() {
  const [dash, setDash] = useState<Dash | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api.get<Dash>("/api/v1/subgerencia/dashboard");
      setDash(d);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Conexión fallida");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function resolver(c: Conflict) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.post<{ message: string }>(
        "/api/v1/subgerencia/resolver-conflicto",
        {
          conflictId: c.id,
          resolution:
            "Arbitraje N2 Subgerencia — prioridad operativa acordada entre partes",
          approveLevel2: true,
        },
      );
      setMsg(res.message);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Resolución fallida");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 p-6">
      <PageIntro module="gerencia" title="Ejecución Táctica" />
      <HowToBox
        steps={[
          "Deadhead Miles y parqueaderos satélite en el heatmap.",
          "Resolver conflictos Taller ↔ Logística con aprobación nivel 2.",
          "Tablero de proyectos de mejora continua.",
        ]}
      />

      {error && (
        <p className="rounded-lg border border-[var(--fl-critical)]/40 bg-[var(--fl-critical)]/10 px-4 py-3 font-mono text-sm text-[var(--fl-critical)]">
          {error}
        </p>
      )}
      {msg && (
        <p className="rounded-lg border border-[var(--fl-accent)]/30 bg-[var(--fl-accent)]/10 px-4 py-3 text-sm">
          {msg}
        </p>
      )}

      <section className="rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg">Mapa de calor operativo</h2>
          <Badge tone="warning">
            Deadhead {dash?.deadheadKm ?? 0} km
          </Badge>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {(dash?.heatmap || []).map((h) => (
            <div
              key={h.area}
              className="rounded-lg border border-[var(--fl-border)] bg-[var(--fl-canvas)] p-4"
              style={{
                opacity: 0.55 + Math.min(h.severity, 10) * 0.045,
              }}
            >
              <p className="text-sm text-[var(--fl-subtext)]">{h.area}</p>
              <p className="mt-1 font-mono text-2xl text-[var(--fl-amber)]">
                {h.severity}
              </p>
              <p className="mt-1 text-xs text-[var(--fl-text)]">{h.label}</p>
            </div>
          ))}
        </div>
        <ul className="mt-4 flex flex-wrap gap-2">
          {(dash?.satelliteYards || []).map((s) => (
            <li key={s.code}>
              <Badge tone="neutral">
                {s.code} · cap {s.capacity}
              </Badge>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-5">
        <h2 className="mb-4 font-display text-lg">
          Conflictos interdepartamentales
        </h2>
        <ul className="space-y-3">
          {(dash?.conflictsOpen || []).map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--fl-border)] px-4 py-3"
            >
              <div>
                <p className="font-mono text-xs text-[var(--fl-subtext)]">
                  {c.code}
                </p>
                <p className="text-sm text-[var(--fl-text)]">{c.title}</p>
                <p className="mt-1 text-xs text-[var(--fl-subtext)]">
                  {c.parties.join(" ↔ ")}
                </p>
              </div>
              <Button disabled={busy} onClick={() => void resolver(c)}>
                Resolver N2
              </Button>
            </li>
          ))}
          {!dash?.conflictsOpen?.length && (
            <p className="text-sm text-[var(--fl-subtext)]">
              Sin conflictos abiertos — nominal
            </p>
          )}
        </ul>
      </section>

      <section className="rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-5">
        <h2 className="mb-4 font-display text-lg">Tablero estratégico</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {(["BACKLOG", "IN_PROGRESS", "DONE"] as const).map((col) => (
            <div key={col}>
              <p className="mb-2 text-xs uppercase tracking-wide text-[var(--fl-subtext)]">
                {statusEs(col)}
              </p>
              <ul className="space-y-2">
                {(dash?.kanban?.[col] || []).map((p) => (
                  <li
                    key={p.id}
                    className="rounded-lg border border-[var(--fl-border)] bg-[var(--fl-canvas)] p-3"
                  >
                    <p className="font-mono text-xs text-[var(--fl-accent)]">
                      {p.code}
                    </p>
                    <p className="mt-1 text-sm">{p.title}</p>
                    {p.deadheadKmSaved != null && (
                      <p className="mt-1 font-mono text-xs text-[var(--fl-amber)]">
                        −{p.deadheadKmSaved} km vacío
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
