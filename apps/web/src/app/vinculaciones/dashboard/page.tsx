"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { api } from "@/lib/api";

type Onboarding = {
  id: string;
  code: string;
  stage: string;
  ownerName: string;
  plate?: string | null;
};

type TrafficRow = {
  vehicleId: string;
  plate: string;
  complianceBlocked: boolean;
  legalRed: boolean;
  docs: Record<
    string,
    { status: string; expiresAt: string | null; light: string }
  >;
};

type Dash = {
  kanban: {
    RECEIVED: Onboarding[];
    VALIDATING_DOCS: Onboarding[];
    CONTRACT_SIGN: Onboarding[];
    ACTIVE_FLEET: Onboarding[];
  };
  trafficLight: TrafficRow[];
  recentChecks: Array<{
    id: string;
    document: string;
    riskLight: string;
    diagnosis: string;
  }>;
  stats: {
    received: number;
    validating: number;
    signing: number;
    active: number;
    blockedLegal: number;
  };
};

const STAGES: Array<{ key: keyof Dash["kanban"]; label: string }> = [
  { key: "RECEIVED", label: "Solicitud Recibida" },
  { key: "VALIDATING_DOCS", label: "Validando Documentos" },
  { key: "CONTRACT_SIGN", label: "Firma de Contrato" },
  { key: "ACTIVE_FLEET", label: "Activo en Flota" },
];

const DOC_LABELS: Record<string, string> = {
  SOAT: "SOAT",
  TECNOMECANICA: "Tecno",
  TARJETA_OPERACION: "T. OperaciÃƒÂ³n",
  RCC: "RCC",
  RCE: "RCE",
  POLIZA_CONTRACTUAL: "PÃƒÂ³liza",
};

function lightTone(light: string): "success" | "warning" | "danger" | "info" {
  if (light === "GREEN") return "success";
  if (light === "AMBER_15" || light === "AMBER_7") return "warning";
  if (light === "RED_0" || light === "EXPIRED") return "danger";
  return "info";
}

export default function VinculacionesDashboardPage() {
  const [dash, setDash] = useState<Dash | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ownerName, setOwnerName] = useState("");
  const [ownerDoc, setOwnerDoc] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [cedula, setCedula] = useState("");
  const [ocrText, setOcrText] = useState(
    "TARJETA DE OPERACION Placa ABC123 Vence 2026-08-12",
  );
  const [selectedPdf, setSelectedPdf] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setDash(await api<Dash>("/api/v1/vinculaciones/dashboard"));
    } catch (e) {
      setError((e as Error).message || "SeÃƒÂ±al perdida Ã¢â‚¬â€ conexiÃƒÂ³n de vinculaciones");
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 20_000);
    return () => clearInterval(t);
  }, [load]);

  async function createPortal() {
    if (!ownerName.trim() || !ownerDoc.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await api<{ message: string; link: { portalUrl: string } }>(
        "/api/v1/vinculaciones/afiliados/portal-link",
        {
          method: "POST",
          body: JSON.stringify({
            ownerName: ownerName.trim(),
            ownerDocument: ownerDoc.trim(),
            ownerEmail: ownerEmail.trim() || undefined,
          }),
        },
      );
      setMsg(`${res.message} Ã‚Â· ${res.link.portalUrl}`);
      setOwnerName("");
      setOwnerDoc("");
      setOwnerEmail("");
      await load();
    } catch (e) {
      setError((e as Error).message || "No se generÃƒÂ³ portal");
    } finally {
      setBusy(false);
    }
  }

  async function runBgCheck() {
    if (!cedula.trim()) return;
    setBusy(true);
    try {
      const res = await api<{ message: string }>(
        "/api/v1/vinculaciones/conductores/background-check",
        {
          method: "POST",
          body: JSON.stringify({ document: cedula.trim() }),
        },
      );
      setMsg(res.message);
      setCedula("");
      await load();
    } catch (e) {
      setError((e as Error).message || "VerificaciÃƒÂ³n de antecedentes fallida");
    } finally {
      setBusy(false);
    }
  }

  async function validarOcr() {
    setBusy(true);
    try {
      const res = await api<{ message: string; contractPdfRef?: string | null }>(
        "/api/v1/vinculaciones/vehiculos/validar-ocr",
        {
          method: "POST",
          body: JSON.stringify({
            docType: "TARJETA_OPERACION",
            rawText: ocrText,
          }),
        },
      );
      setMsg(res.message);
      if (res.contractPdfRef) setSelectedPdf(res.contractPdfRef);
      await load();
    } catch (e) {
      setError((e as Error).message || "OCR fallido");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fade-in mx-auto max-w-[1400px] space-y-5 bg-[var(--brand-canvas)] p-4 text-[var(--brand-text-primary)] md:p-6">
      <header className="nexa-panel flex flex-wrap items-start justify-between gap-3 p-4 backdrop-blur-md">
        <div>
          <h1 className="font-sans text-xl font-semibold tracking-tight text-brand-text-primary">
            Vinculaciones
          </h1>
          <p className="mt-1 font-data text-[10px] uppercase tracking-[0.14em] text-brand-text-secondary">
            Embudo legal · RUNT · OCR
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="warning">Embudo {dash?.stats.received ?? 0} nuevas</Badge>
          <Badge tone="danger">
            Bloqueo legal {dash?.stats.blockedLegal ?? 0}
          </Badge>
        </div>
      </header>

      {error ? (
        <p className="rounded-xl border border-brand-danger/40 bg-brand-danger/10 px-4 py-3 text-sm text-brand-danger">
          {error}
        </p>
      ) : null}
      {msg ? (
        <p className="rounded-xl border border-brand-secondary/40 bg-brand-secondary/10 px-4 py-3 text-sm">
          {msg}
        </p>
      ) : null}

      {/* Kanban */}
      <section id="kanban" className="space-y-3">
        <h3 className="font-display text-lg">Tablero de ingreso</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {STAGES.map((s) => (
            <div
              key={s.key}
              className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-3"
            >
              <p className="text-xs font-semibold uppercase text-brand-text-secondary">
                {s.label}
              </p>
              <ul className="mt-2 space-y-2">
                {(dash?.kanban[s.key] ?? []).map((card) => (
                  <li
                    key={card.id}
                    className="rounded-lg border border-[var(--brand-border)] px-2 py-2 text-sm"
                  >
                    <p className="font-mono text-xs text-brand-secondary">
                      {card.code}
                    </p>
                    <p>{card.ownerName}</p>
                    <p className="font-mono text-xs text-brand-text-secondary">
                      {card.plate || "sin placa"}
                    </p>
                  </li>
                ))}
                {(dash?.kanban[s.key] ?? []).length === 0 ? (
                  <li className="py-6 text-center text-xs text-brand-text-secondary">
                    VacÃƒÂ­o
                  </li>
                ) : null}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Acciones */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4">
          <h3 className="font-display text-base">Portal afiliado</h3>
          <input
            className="field mt-2 w-full"
            placeholder="Nombre propietario"
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
          />
          <input
            className="field mt-2 w-full"
            placeholder="Documento"
            value={ownerDoc}
            onChange={(e) => setOwnerDoc(e.target.value)}
          />
          <input
            className="field mt-2 w-full"
            placeholder="Correo"
            value={ownerEmail}
            onChange={(e) => setOwnerEmail(e.target.value)}
          />
          <Button
            type="button"
            variant="primary"
            className="mt-3"
            disabled={busy}
            onClick={() => void createPortal()}
          >
            Generar enlace del portal
          </Button>
        </section>

        <section className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4">
          <h3 className="font-display text-base">VerificaciÃƒÂ³n de antecedentes</h3>
          <input
            className="field mt-2 w-full"
            placeholder="CÃƒÂ©dula conductor"
            value={cedula}
            onChange={(e) => setCedula(e.target.value)}
          />
          <Button
            type="button"
            variant="secondary"
            className="mt-3"
            disabled={busy}
            onClick={() => void runBgCheck()}
          >
            SIMIT + RUNT
          </Button>
          <ul className="mt-3 space-y-1 text-xs">
            {(dash?.recentChecks ?? []).slice(0, 4).map((c) => (
              <li key={c.id} className="flex justify-between gap-2">
                <span className="font-mono">{c.document}</span>
                <Badge
                  tone={
                    c.riskLight === "GREEN"
                      ? "success"
                      : c.riskLight === "AMBER"
                        ? "warning"
                        : "danger"
                  }
                >
                  {c.riskLight}
                </Badge>
              </li>
            ))}
          </ul>
        </section>

        <section
          id="ocr"
          className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4"
        >
          <h3 className="font-display text-base">Validar OCR</h3>
          <textarea
            className="field mt-2 min-h-[88px] w-full font-mono text-xs"
            value={ocrText}
            onChange={(e) => setOcrText(e.target.value)}
          />
          <Button
            type="button"
            variant="primary"
            className="mt-3"
            disabled={busy}
            onClick={() => void validarOcr()}
          >
            Extraer + contrato PDF
          </Button>
        </section>
      </div>

      {/* Split-screen OCR viewer */}
      <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="min-h-[220px] rounded-xl border border-dashed border-[var(--brand-border)] bg-[color-mix(in_srgb,var(--brand-canvas)_40%,transparent)] p-4 font-mono text-xs">
          <p className="mb-2 text-brand-text-secondary">Visor de documento (pantalla partida)</p>
          <pre className="whitespace-pre-wrap text-[var(--brand-text-primary)]">
            {ocrText || "Pegue texto OCR / referencia de PDF"}
          </pre>
        </div>
        <div className="min-h-[220px] rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4">
          <p className="mb-2 text-sm text-brand-text-secondary">ExtracciÃƒÂ³n / contrato</p>
          <p className="font-mono text-sm text-brand-secondary">
            {selectedPdf || "Contrato pendiente de generaciÃƒÂ³n"}
          </p>
          <p className="mt-4 text-xs text-brand-text-secondary">
            ValidaciÃƒÂ³n manual: contraste de lectura vs documento original antes de firma
            digital.
          </p>
        </div>
      </section>

      {/* Traffic light */}
      <section
        id="vencimientos"
        className="rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4"
      >
        <h3 className="font-display text-lg">Matriz de Vencimientos</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--brand-border)] text-xs uppercase text-[var(--brand-text-secondary)]">
                <th className="py-2 pr-2">Placa</th>
                {Object.keys(DOC_LABELS).map((k) => (
                  <th key={k} className="py-2 pr-2">
                    {DOC_LABELS[k]}
                  </th>
                ))}
                <th className="py-2">Legal</th>
              </tr>
            </thead>
            <tbody>
              {(dash?.trafficLight ?? []).map((row) => (
                <tr
                  key={row.vehicleId}
                  className="border-b border-[var(--brand-border)]"
                >
                  <td className="py-2 pr-2 font-mono text-brand-secondary">
                    {row.plate}
                  </td>
                  {Object.keys(DOC_LABELS).map((k) => {
                    const d = row.docs[k];
                    return (
                      <td key={k} className="py-2 pr-2">
                        {d ? (
                          <Badge tone={lightTone(d.light)}>{d.light}</Badge>
                        ) : (
                          <span className="text-xs text-brand-text-secondary">Ã¢â‚¬â€</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="py-2">
                    <Badge tone={row.legalRed ? "danger" : "success"}>
                      {row.legalRed ? "ROJO" : "Correcto"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
