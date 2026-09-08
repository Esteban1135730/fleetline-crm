"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { HARD_RULES, statusEs } from "@fsg/shared";
import { api } from "@/lib/api";
import { BentoPanel } from "@/components/nexa/bento-panel";
import { NexaTable, NexaRow, NexaCell } from "@/components/nexa/nexa-table";
import { ComplianceBadge } from "@/components/rrhh/compliance-badge";

type FlaggedClause = {
  excerpt: string;
  penaltyPct: number;
  severity: string;
  policyMaxPct: number;
};

type ContractScan = {
  id: string;
  code: string;
  title: string;
  kind: string;
  status: string;
  fileRef: string | null;
  flaggedClauses: FlaggedClause[] | unknown;
  maxPenaltyPctFound: number | null;
  policyMaxPenaltyPct: number;
  commentsThread: Array<{ author: string; body: string; at: string }> | null;
};

type JudicialAlert = {
  id: string;
  title: string;
  kind: string;
  dueAt: string;
  immutable: boolean;
  alertRed: boolean;
  caseRef: string | null;
  daysLeft: number;
};

type SarlaftLight = {
  id: string;
  subjectName: string;
  document: string;
  riskScore: number;
  listsMatched: string[];
  light: "RED" | "AMBER" | "GREEN" | string;
  customerName: string | null;
};

type Dash = {
  hub: string;
  contracts: ContractScan[];
  judicialCalendar: JudicialAlert[];
  evidentiaryPackages: Array<{
    id: string;
    code: string;
    plate: string;
    contentHash: string;
    preopCount: number;
    gpsPointCount: number;
    workOrderCount: number;
  }>;
  sarlaftLights: SarlaftLight[];
  disciplinaryMemos: Array<{
    id: string;
    code: string;
    subjectName: string;
    plate: string | null;
    charge: string;
  }>;
  policy: { maxPenaltyClausePct: number };
};

function asClauses(raw: unknown): FlaggedClause[] {
  return Array.isArray(raw) ? (raw as FlaggedClause[]) : [];
}

export default function JuridicoDashboardPage() {
  const [dash, setDash] = useState<Dash | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [plate, setPlate] = useState("BUS-001");
  const [sarlaftDoc, setSarlaftDoc] = useState("");
  const [sarlaftName, setSarlaftName] = useState("");
  const [comment, setComment] = useState("");
  const [scanText, setScanText] = useState(
    "Contrato de prestación. Las partes acuerdan una penalidad del 25% del valor mensual por incumplimiento. Multa de 8% por mora en pago.",
  );

  const load = useCallback(async () => {
    try {
      const data = await api.get<Dash>("/api/v1/juridico/dashboard");
      setDash(data);
      if (data.contracts[0] && !selectedId) {
        setSelectedId(data.contracts[0].id);
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Conexión fallida");
    }
  }, [selectedId]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected =
    dash?.contracts.find((c) => c.id === selectedId) ?? dash?.contracts[0];

  async function runSmartScan() {
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const res = await api.post<{
        id: string;
        status: string;
        message: string;
      }>("/api/v1/juridico/contratos/smart-scan", {
        contractTitle: "Revisión asistida — carga del centro jurídico",
        contractKind: "B2B",
        contractText: scanText,
        comments: [
          {
            author: "Sofía Directora Jurídica",
            body: "Revisión jurídica iniciada",
          },
        ],
      });
      setMsg(`${res.status}: ${res.message}`);
      setSelectedId(res.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Revisión automática fallida");
    } finally {
      setBusy(false);
    }
  }

  async function postComment() {
    if (!selected || !comment.trim()) return;
    setBusy(true);
    try {
      await api.post("/api/v1/juridico/contratos/comentario", {
        scanId: selected.id,
        author: "Sofía Directora Jurídica",
        body: comment.trim(),
      });
      setComment("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Comentario no registrado");
    } finally {
      setBusy(false);
    }
  }

  async function generateExpediente() {
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const res = await api.get<{
        code: string;
        contentHash: string;
        message: string;
        preopCount: number;
        gpsPointCount: number;
      }>(`/api/v1/juridico/expediente-probatorio/${encodeURIComponent(plate)}`);
      setMsg(
        `${res.code}: ${res.message} · hash ${res.contentHash.slice(0, 12)}… · preop ${res.preopCount} · GPS ${res.gpsPointCount}`,
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Expediente fallido");
    } finally {
      setBusy(false);
    }
  }

  async function consultaSarlaft() {
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const res = await api.post<{
        light: string;
        riskScore: number;
        message: string;
        hits: Array<{ list: string }>;
      }>("/api/v1/juridico/sarlaft/consulta-listas", {
        document: sarlaftDoc,
        subjectName: sarlaftName,
        entityType: "PROPIETARIO",
      });
      setMsg(
        `Semáforo ${res.light} · score ${res.riskScore} · ${res.message} · hits: ${res.hits.map((h) => h.list).join(", ") || "ninguno"}`,
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Consulta SARLAFT fallida");
    } finally {
      setBusy(false);
    }
  }

  const policyMax =
    dash?.policy.maxPenaltyClausePct ?? HARD_RULES.LEGAL_MAX_PENALTY_CLAUSE_PCT;

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <header className="border-b border-brand-border pb-4">
        <p className="font-data text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-primary">
          Jurídico
        </p>
        <h1 className="font-sans text-2xl font-semibold tracking-tight text-brand-text-primary md:text-3xl">
          Centro jurídico
        </h1>
      </header>

      {error && (
        <p className="rounded-lg border border-brand-danger/40 bg-brand-danger/10 px-4 py-3 text-sm text-brand-danger">
          {error}
        </p>
      )}
      {msg && (
        <p className="rounded-lg border border-brand-border bg-brand-surface px-4 py-3 font-data text-sm text-brand-text-primary">
          {msg}
        </p>
      )}

      <BentoPanel id="calendario" title="Calendario judicial" subtitle="Audiencias y plazos inamovibles">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(dash?.judicialCalendar ?? []).map((e) => (
            <article
              key={e.id}
              className={`rounded-xl border p-4 ${
                e.alertRed
                  ? "border-brand-danger bg-brand-danger/10"
                  : "border-brand-border bg-brand-canvas"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-brand-text-primary">{e.title}</p>
                {e.alertRed && <Badge tone="danger">INAMOVIBLE</Badge>}
              </div>
              <p className="mt-2 font-data text-xs text-brand-text-secondary">
                {e.kind} · {e.caseRef ?? "—"} · {e.daysLeft}d
              </p>
              <p className="mt-1 font-data text-xs text-brand-warning">
                {new Date(e.dueAt).toLocaleString("es-CO")}
              </p>
            </article>
          ))}
          {!dash?.judicialCalendar?.length && (
            <p className="text-sm text-brand-text-secondary">Sin plazos cargados.</p>
          )}
        </div>
      </BentoPanel>

      <div id="contratos" className="grid gap-4 lg:grid-cols-2">
        <BentoPanel
          title="Gestor de contratos"
          subtitle={`Tope penalidad FSG: ${policyMax}%`}
        >
            <div className="flex flex-wrap gap-2">
              {(dash?.contracts ?? []).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={`rounded-md border px-3 py-1.5 font-mono text-xs ${
                    selected?.id === c.id
                      ? "border-[color:var(--brand-primary)] text-[color:var(--brand-primary)]"
                      : "border-[color:var(--brand-border)] text-[color:var(--brand-text-secondary)]"
                  }`}
                >
                  {c.code}
                </button>
              ))}
            </div>
            {selected ? (
              <>
                <p className="text-sm font-medium text-[color:var(--brand-text-primary)]">
                  {selected.title}
                </p>
                <div className="flex gap-2">
                  <Badge
                    tone={
                      selected.status === "FLAGGED"
                        ? "danger"
                        : selected.status === "CLEARED"
                          ? "success"
                          : "warning"
                    }
                  >
                    {statusEs(selected.status)}
                  </Badge>
                  <Badge tone="info">{selected.kind}</Badge>
                </div>
                <div className="min-h-[220px] rounded-lg border border-dashed border-[color:var(--brand-border)] bg-[color:var(--brand-canvas)] p-3 font-mono text-xs leading-relaxed text-[color:var(--brand-text-secondary)]">
                  <p className="mb-2 text-[color:var(--brand-text-primary)]">
                    Vista documento · {selected.fileRef ?? "texto / PDF"}
                  </p>
                  {asClauses(selected.flaggedClauses).map((f, i) => (
                    <p
                      key={`${f.penaltyPct}-${i}`}
                      className={
                        f.severity === "OVER_POLICY"
                          ? "mb-2 rounded bg-[color:var(--brand-danger)]/15 p-2 text-[color:var(--brand-danger)]"
                          : "mb-2 rounded bg-[color:var(--brand-warning)]/15 p-2 text-[color:var(--brand-warning)]"
                      }
                    >
                      [{f.penaltyPct}%] {f.excerpt}
                    </p>
                  ))}
                  {!asClauses(selected.flaggedClauses).length && (
                    <p>Sin cláusulas fuera de política en este escaneo.</p>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-[color:var(--brand-text-secondary)]">
                Sin escaneos. Ejecute el análisis jurídico.
              </p>
            )}
            <textarea
              value={scanText}
              onChange={(e) => setScanText(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-[color:var(--brand-border)] bg-[color:var(--brand-canvas)] p-3 text-sm text-[color:var(--brand-text-primary)]"
            />
            <Button disabled={busy} onClick={() => void runSmartScan()}>
              Análisis jurídico
            </Button>
        </BentoPanel>

        <BentoPanel title="Cadena de comentarios">
          <div className="mb-3 flex-1 space-y-3 overflow-y-auto">
              {(selected?.commentsThread ?? []).map((c, i) => (
                <div
                  key={`${c.at}-${i}`}
                  className="rounded-lg border border-[color:var(--brand-border)] px-3 py-2"
                >
                  <p className="text-xs font-medium text-[color:var(--brand-primary)]">
                    {c.author}
                  </p>
                  <p className="mt-1 text-sm text-[color:var(--brand-text-primary)]">
                    {c.body}
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-[color:var(--brand-text-secondary)]">
                    {c.at}
                  </p>
                </div>
              ))}
              {!selected?.commentsThread?.length && (
                <p className="text-sm text-[color:var(--brand-text-secondary)]">
                  Sin comentarios en el hilo.
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Observación jurídica…"
                className="flex-1 rounded-lg border border-[color:var(--brand-border)] bg-[color:var(--brand-canvas)] px-3 py-2 text-sm"
              />
              <Button disabled={busy || !selected} onClick={() => void postComment()}>
                Enviar
              </Button>
            </div>
        </BentoPanel>
      </div>

      <BentoPanel id="sarlaft" title="Riesgo SARLAFT" subtitle="Consulta listas restrictivas">
        <div className="mb-4 flex flex-wrap gap-2">
          <input
            value={sarlaftDoc}
            onChange={(e) => setSarlaftDoc(e.target.value)}
            className="field font-data"
            placeholder="Documento"
          />
          <input
            value={sarlaftName}
            onChange={(e) => setSarlaftName(e.target.value)}
            className="field"
            placeholder="Sujeto"
          />
          <Button disabled={busy} onClick={() => void consultaSarlaft()}>
            Consultar listas
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(dash?.sarlaftLights ?? []).map((s) => (
            <article
              key={s.id}
              className="rounded-xl border border-brand-border bg-brand-canvas p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-brand-text-primary">{s.subjectName}</p>
                <ComplianceBadge
                  level={
                    s.light === "GREEN"
                      ? "GREEN"
                      : s.light === "AMBER"
                        ? "AMBER"
                        : "RED"
                  }
                >
                  {s.light}
                </ComplianceBadge>
              </div>
              <p className="mt-2 font-data text-xs text-brand-text-secondary">
                {s.document} · score {s.riskScore}
              </p>
              <p className="mt-1 font-data text-[10px] text-brand-warning">
                {s.listsMatched.join(" · ") || "Sin hits"}
              </p>
            </article>
          ))}
        </div>
      </BentoPanel>

      <BentoPanel id="expediente" title="Expediente probatorio" subtitle="Hash SHA-256 · preops · GPS">
        <div className="mb-4 flex flex-wrap gap-2">
          <input
            value={plate}
            onChange={(e) => setPlate(e.target.value.toUpperCase())}
            className="field font-data"
          />
          <Button disabled={busy} onClick={() => void generateExpediente()}>
            Generar documento inmutable
          </Button>
        </div>
        {(dash?.evidentiaryPackages ?? []).length === 0 ? (
          <p className="text-sm text-brand-text-secondary">Sin expedientes generados.</p>
        ) : (
          <NexaTable columns={["Código", "Placa", "Hash", "Preop", "GPS", "OT"]}>
            {(dash?.evidentiaryPackages ?? []).map((p) => (
              <NexaRow key={p.id}>
                <NexaCell mono>{p.code}</NexaCell>
                <NexaCell mono>{p.plate}</NexaCell>
                <NexaCell mono className="text-[11px] text-brand-text-secondary">
                  {p.contentHash.slice(0, 16)}…
                </NexaCell>
                <NexaCell mono>{p.preopCount}</NexaCell>
                <NexaCell mono>{p.gpsPointCount}</NexaCell>
                <NexaCell mono>{p.workOrderCount}</NexaCell>
              </NexaRow>
            ))}
          </NexaTable>
        )}
      </BentoPanel>
    </div>
  );
}
