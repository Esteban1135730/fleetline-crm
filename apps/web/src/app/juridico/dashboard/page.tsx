"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { HARD_RULES, statusEs } from "@fsg/shared";
import { api } from "@/lib/api";
import { HowToBox, PageIntro } from "@/components/page-intro";

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

function lightTone(light: string): "emerald" | "amber" | "rose" | "slate" {
  if (light === "GREEN") return "emerald";
  if (light === "AMBER") return "amber";
  if (light === "RED") return "rose";
  return "slate";
}

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
  const [sarlaftDoc, setSarlaftDoc] = useState("CLINTON001");
  const [sarlaftName, setSarlaftName] = useState("Propietario demo");
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
    <div className="space-y-8">
      <PageIntro module="juridico" title="Centro jurídico" />
      <HowToBox
        steps={[
          "La revisión jurídica compara el documento contra el tope de penalidad.",
          "Calendario judicial marca audiencias y derechos de petición inamovibles.",
          "Expediente por placa sella preoperacionales, taller y GPS con hash SHA-256.",
          "Semáforos SARLAFT consultan OFAC, Clinton, Interpol y listas nacionales.",
        ]}
      />

      {error && (
        <p className="rounded-lg border border-[color:var(--fl-critical)]/40 bg-[color:var(--fl-critical)]/10 px-4 py-3 text-sm text-[color:var(--fl-critical)]">
          {error}
        </p>
      )}
      {msg && (
        <p className="rounded-lg border border-[color:var(--fl-border)] bg-[color:var(--fl-surface)] px-4 py-3 font-mono text-sm text-[color:var(--fl-text)]">
          {msg}
        </p>
      )}

      {/* Calendario judicial */}
      <section id="calendario" className="space-y-3">
        <h2 className="text-lg font-semibold text-[color:var(--fl-text)]">
          Calendario Judicial
        </h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(dash?.judicialCalendar ?? []).map((e) => (
            <article
              key={e.id}
              className={`rounded-xl border p-4 ${
                e.alertRed
                  ? "border-[color:var(--fl-critical)] bg-[color:var(--fl-critical)]/10"
                  : "border-[color:var(--fl-border)] bg-[color:var(--fl-surface)]"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-[color:var(--fl-text)]">
                  {e.title}
                </p>
                {e.alertRed && <Badge tone="rose">INAMOVIBLE</Badge>}
              </div>
              <p className="mt-2 font-mono text-xs text-[color:var(--fl-subtext)]">
                {e.kind} · {e.caseRef ?? "—"} · {e.daysLeft}d
              </p>
              <p className="mt-1 font-mono text-xs text-[color:var(--fl-amber)]">
                {new Date(e.dueAt).toLocaleString("es-CO")}
              </p>
            </article>
          ))}
          {!dash?.judicialCalendar?.length && (
            <p className="text-sm text-[color:var(--fl-subtext)]">
              Sin plazos cargados.
            </p>
          )}
        </div>
      </section>

      {/* Split-screen contratos */}
      <section id="contratos" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-semibold text-[color:var(--fl-text)]">
            Gestor de Contratos
          </h2>
          <p className="font-mono text-xs text-[color:var(--fl-subtext)]">
            Tope penalidad FSG: {policyMax}%
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3 rounded-xl border border-[color:var(--fl-border)] bg-[color:var(--fl-surface)] p-4">
            <div className="flex flex-wrap gap-2">
              {(dash?.contracts ?? []).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={`rounded-md border px-3 py-1.5 font-mono text-xs ${
                    selected?.id === c.id
                      ? "border-[color:var(--fl-accent)] text-[color:var(--fl-accent)]"
                      : "border-[color:var(--fl-border)] text-[color:var(--fl-subtext)]"
                  }`}
                >
                  {c.code}
                </button>
              ))}
            </div>
            {selected ? (
              <>
                <p className="text-sm font-medium text-[color:var(--fl-text)]">
                  {selected.title}
                </p>
                <div className="flex gap-2">
                  <Badge
                    tone={
                      selected.status === "FLAGGED"
                        ? "rose"
                        : selected.status === "CLEARED"
                          ? "emerald"
                          : "amber"
                    }
                  >
                    {statusEs(selected.status)}
                  </Badge>
                  <Badge tone="slate">{selected.kind}</Badge>
                </div>
                <div className="min-h-[220px] rounded-lg border border-dashed border-[color:var(--fl-border)] bg-[color:var(--fl-canvas)] p-3 font-mono text-xs leading-relaxed text-[color:var(--fl-subtext)]">
                  <p className="mb-2 text-[color:var(--fl-text)]">
                    Vista documento · {selected.fileRef ?? "texto / PDF"}
                  </p>
                  {asClauses(selected.flaggedClauses).map((f, i) => (
                    <p
                      key={`${f.penaltyPct}-${i}`}
                      className={
                        f.severity === "OVER_POLICY"
                          ? "mb-2 rounded bg-[color:var(--fl-critical)]/15 p-2 text-[color:var(--fl-critical)]"
                          : "mb-2 rounded bg-[color:var(--fl-amber)]/15 p-2 text-[color:var(--fl-amber)]"
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
              <p className="text-sm text-[color:var(--fl-subtext)]">
                Sin escaneos. Ejecute el análisis jurídico.
              </p>
            )}
            <textarea
              value={scanText}
              onChange={(e) => setScanText(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-[color:var(--fl-border)] bg-[color:var(--fl-canvas)] p-3 text-sm text-[color:var(--fl-text)]"
            />
            <Button disabled={busy} onClick={() => void runSmartScan()}>
              Análisis jurídico
            </Button>
          </div>

          <div className="flex flex-col rounded-xl border border-[color:var(--fl-border)] bg-[color:var(--fl-surface)] p-4">
            <h3 className="mb-3 text-sm font-semibold text-[color:var(--fl-text)]">
              Cadena de comentarios
            </h3>
            <div className="mb-3 flex-1 space-y-3 overflow-y-auto">
              {(selected?.commentsThread ?? []).map((c, i) => (
                <div
                  key={`${c.at}-${i}`}
                  className="rounded-lg border border-[color:var(--fl-border)] px-3 py-2"
                >
                  <p className="text-xs font-medium text-[color:var(--fl-accent)]">
                    {c.author}
                  </p>
                  <p className="mt-1 text-sm text-[color:var(--fl-text)]">
                    {c.body}
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-[color:var(--fl-subtext)]">
                    {c.at}
                  </p>
                </div>
              ))}
              {!selected?.commentsThread?.length && (
                <p className="text-sm text-[color:var(--fl-subtext)]">
                  Sin comentarios en el hilo.
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Observación jurídica…"
                className="flex-1 rounded-lg border border-[color:var(--fl-border)] bg-[color:var(--fl-canvas)] px-3 py-2 text-sm"
              />
              <Button disabled={busy || !selected} onClick={() => void postComment()}>
                Enviar
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* SARLAFT */}
      <section id="sarlaft" className="space-y-3">
        <h2 className="text-lg font-semibold text-[color:var(--fl-text)]">
          Módulo de Riesgo SARLAFT
        </h2>
        <div className="flex flex-wrap gap-2">
          <input
            value={sarlaftDoc}
            onChange={(e) => setSarlaftDoc(e.target.value)}
            className="rounded-lg border border-[color:var(--fl-border)] bg-[color:var(--fl-surface)] px-3 py-2 font-mono text-sm"
            placeholder="Documento"
          />
          <input
            value={sarlaftName}
            onChange={(e) => setSarlaftName(e.target.value)}
            className="rounded-lg border border-[color:var(--fl-border)] bg-[color:var(--fl-surface)] px-3 py-2 text-sm"
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
              className="rounded-xl border border-[color:var(--fl-border)] bg-[color:var(--fl-surface)] p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-[color:var(--fl-text)]">
                  {s.subjectName}
                </p>
                <Badge tone={lightTone(s.light)}>{s.light}</Badge>
              </div>
              <p className="mt-2 font-mono text-xs text-[color:var(--fl-subtext)]">
                {s.document} · score {s.riskScore}
              </p>
              <p className="mt-1 font-mono text-[10px] text-[color:var(--fl-amber)]">
                {s.listsMatched.join(" · ") || "Sin hits"}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* Expediente */}
      <section id="expediente" className="space-y-3">
        <h2 className="text-lg font-semibold text-[color:var(--fl-text)]">
          Expediente Probatorio
        </h2>
        <div className="flex flex-wrap gap-2">
          <input
            value={plate}
            onChange={(e) => setPlate(e.target.value.toUpperCase())}
            className="rounded-lg border border-[color:var(--fl-border)] bg-[color:var(--fl-surface)] px-3 py-2 font-mono text-sm"
          />
          <Button disabled={busy} onClick={() => void generateExpediente()}>
            Generar documento inmutable
          </Button>
        </div>
        <ul className="space-y-2">
          {(dash?.evidentiaryPackages ?? []).map((p) => (
            <li
              key={p.id}
              className="rounded-lg border border-[color:var(--fl-border)] bg-[color:var(--fl-surface)] px-4 py-3 font-mono text-xs text-[color:var(--fl-subtext)]"
            >
              <span className="text-[color:var(--fl-text)]">{p.code}</span> ·{" "}
              {p.plate} · hash {p.contentHash.slice(0, 16)}… · preop{" "}
              {p.preopCount} · GPS {p.gpsPointCount} · OT {p.workOrderCount}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
