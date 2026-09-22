"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, Eye, Route, ShieldAlert } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { isQaViewerClient } from "@/lib/qa-trace";
import { EmptyState, StatusPulseBadge } from "@/components/audit";
import { BentoPanel } from "@/components/nexa/bento-panel";
import { NexaTable, NexaRow, NexaCell } from "@/components/nexa/nexa-table";

type Coverage = {
  score: number;
  expected: number;
  hit: number;
  missing: string[];
};

type SessionRow = {
  id: string;
  userEmail: string | null;
  userName: string | null;
  ipAddress: string | null;
  startedAt: string;
  lastSeenAt: string;
  endedAt: string | null;
  durationMs: number;
  routeCount: number;
  actionCount: number;
  eventCount: number;
  modulesTouched: string[];
  coverage: Coverage;
  verdict: "COMPLETE" | "PARTIAL" | "SHALLOW";
};

type SessionDetail = SessionRow & {
  userAgent: string | null;
  expectedModules: string[];
  events: Array<{
    id: string;
    kind: string;
    path: string | null;
    method: string | null;
    moduleKey: string | null;
    ipAddress: string | null;
    at: string;
  }>;
};

type Overview = {
  enabled: boolean;
  windowDays: number;
  sessionCount: number;
  testers: Array<{
    email: string;
    sessions: number;
    avgScore: number;
    actions: number;
    routes: number;
  }>;
};

function fmtTs(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-CO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function fmtDuration(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function verdictTone(
  v: SessionRow["verdict"],
): "active" | "fatiga" | "danger" | "neutral" {
  if (v === "COMPLETE") return "active";
  if (v === "PARTIAL") return "fatiga";
  return "danger";
}

export default function QaTracePage() {
  const { user, loading, homePath } = useAuth();
  const router = useRouter();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user || !isQaViewerClient(user.email)) {
      router.replace(homePath || "/dashboard");
    }
  }, [user, loading, router, homePath]);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const [ov, list] = await Promise.all([
        api.get<Overview>("/api/v1/qa-trace/overview"),
        api.get<{ sessions: SessionRow[] }>("/api/v1/qa-trace/sessions?limit=80"),
      ]);
      setOverview(ov);
      setSessions(list.sessions);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar QA Trace");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!user || !isQaViewerClient(user.email)) return;
    void load();
  }, [user, load]);

  const openDetail = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      const d = await api.get<SessionDetail>(`/api/v1/qa-trace/sessions/${id}`);
      setDetail(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sesión no disponible");
    } finally {
      setBusy(false);
    }
  };

  if (loading || !user || !isQaViewerClient(user.email)) {
    return (
      <div className="p-6 text-sm text-[var(--text-secondary,#8B9BB4)]">
        Verificando acceso…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-[var(--text-secondary,#8B9BB4)]">
            Staging · privado
          </p>
          <h1 className="text-xl font-semibold tracking-tight text-white">
            QA Trace
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary,#8B9BB4)]">
            Cobertura de prueba por sesión — solo {user.email}
          </p>
        </div>
        <button
          type="button"
          className="rounded-lg border border-[#1C3A5E] bg-[#0B1325]/85 px-4 py-2 text-sm text-[#00E5FF] transition hover:border-[rgba(0,229,255,0.3)]"
          onClick={() => void load()}
          disabled={busy}
        >
          Actualizar
        </button>
      </div>

      {error ? (
        <div className="nexa-panel flex items-center gap-2 p-3 text-sm text-[#FF2A55]">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <BentoPanel className="p-4">
          <div className="flex items-center gap-2 text-[var(--text-secondary,#8B9BB4)]">
            <Activity className="h-4 w-4" />
            <span className="text-xs uppercase">Sesiones 7d</span>
          </div>
          <p className="mt-2 font-mono text-2xl tabular-nums text-white [text-shadow:0_0_10px_rgba(0,229,255,0.5)]">
            {overview?.sessionCount ?? "—"}
          </p>
        </BentoPanel>
        <BentoPanel className="p-4">
          <div className="flex items-center gap-2 text-[var(--text-secondary,#8B9BB4)]">
            <Eye className="h-4 w-4" />
            <span className="text-xs uppercase">Testers</span>
          </div>
          <p className="mt-2 font-mono text-2xl tabular-nums text-white">
            {overview?.testers.length ?? "—"}
          </p>
        </BentoPanel>
        <BentoPanel className="p-4">
          <div className="flex items-center gap-2 text-[var(--text-secondary,#8B9BB4)]">
            <Route className="h-4 w-4" />
            <span className="text-xs uppercase">Estado</span>
          </div>
          <p className="mt-2 text-sm text-[#00E5FF]">
            {overview?.enabled ? "Captura activa" : "Desactivado"}
          </p>
        </BentoPanel>
      </div>

      {overview?.testers.length ? (
        <BentoPanel className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-white">
            Testers (7 días)
          </h2>
          <NexaTable
            columns={["Email", "Sesiones", "Score medio", "Rutas", "Acciones"]}
          >
            {overview.testers.map((t) => (
              <NexaRow key={t.email}>
                <NexaCell>{t.email}</NexaCell>
                <NexaCell mono>{t.sessions}</NexaCell>
                <NexaCell mono>{t.avgScore}%</NexaCell>
                <NexaCell mono>{t.routes}</NexaCell>
                <NexaCell mono>{t.actions}</NexaCell>
              </NexaRow>
            ))}
          </NexaTable>
        </BentoPanel>
      ) : null}

      <BentoPanel className="p-4">
        <h2 className="mb-3 text-sm font-semibold text-white">Sesiones</h2>
        {!sessions.length ? (
          <EmptyState
            icon={<Activity className="h-7 w-7" />}
            title="Sin sesiones aún"
            description="Cuando un tester navegue en staging, aparecerán aquí rutas, IP y cobertura."
          />
        ) : (
          <NexaTable
            columns={[
              "Usuario",
              "IP",
              "Inicio",
              "Duración",
              "Rutas",
              "Acciones",
              "Cobertura",
              "Veredicto",
              "",
            ]}
          >
            {sessions.map((s) => (
              <NexaRow key={s.id}>
                <NexaCell>
                  <div className="text-white">{s.userName || "—"}</div>
                  <div className="text-xs text-[var(--text-secondary,#8B9BB4)]">
                    {s.userEmail}
                  </div>
                </NexaCell>
                <NexaCell mono>{s.ipAddress || "—"}</NexaCell>
                <NexaCell mono>{fmtTs(s.startedAt)}</NexaCell>
                <NexaCell mono>{fmtDuration(s.durationMs)}</NexaCell>
                <NexaCell mono>{s.routeCount}</NexaCell>
                <NexaCell mono>{s.actionCount}</NexaCell>
                <NexaCell mono>{s.coverage.score}%</NexaCell>
                <NexaCell>
                  <StatusPulseBadge tone={verdictTone(s.verdict)}>
                    {s.verdict}
                  </StatusPulseBadge>
                </NexaCell>
                <NexaCell>
                  <button
                    type="button"
                    className="text-sm text-[#00E5FF] hover:underline"
                    onClick={() => void openDetail(s.id)}
                  >
                    Detalle
                  </button>
                </NexaCell>
              </NexaRow>
            ))}
          </NexaTable>
        )}
      </BentoPanel>

      {detail ? (
        <BentoPanel className="p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">
              Detalle · {detail.userEmail} · {fmtTs(detail.startedAt)}
            </h2>
            <button
              type="button"
              className="text-sm text-[var(--text-secondary,#8B9BB4)] hover:text-white"
              onClick={() => setDetail(null)}
            >
              Cerrar
            </button>
          </div>
          <p className="mb-2 text-xs text-[var(--text-secondary,#8B9BB4)]">
            Módulos: {detail.modulesTouched.join(", ") || "—"} · Faltan:{" "}
            {detail.coverage.missing.join(", ") || "ninguno"}
          </p>
          <NexaTable columns={["Hora", "Tipo", "Método", "Módulo", "Ruta"]}>
            {detail.events.map((e) => (
              <NexaRow key={e.id}>
                <NexaCell mono>{fmtTs(e.at)}</NexaCell>
                <NexaCell>{e.kind}</NexaCell>
                <NexaCell mono>{e.method || "—"}</NexaCell>
                <NexaCell>{e.moduleKey || "—"}</NexaCell>
                <NexaCell mono>{e.path || "—"}</NexaCell>
              </NexaRow>
            ))}
          </NexaTable>
        </BentoPanel>
      ) : null}
    </div>
  );
}
