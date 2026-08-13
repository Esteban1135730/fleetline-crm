"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { api } from "@/lib/api";
import { HowToBox, PageIntro } from "@/components/page-intro";

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
  TARJETA_OPERACION: "T. Operación",
  RCC: "RCC",
  RCE: "RCE",
  POLIZA_CONTRACTUAL: "Póliza",
};

function lightTone(light: string): "emerald" | "amber" | "rose" | "slate" {
  if (light === "GREEN") return "emerald";
  if (light === "AMBER_15" || light === "AMBER_7") return "amber";
  if (light === "RED_0" || light === "EXPIRED") return "rose";
  return "slate";
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
      setError((e as Error).message || "Señal perdida — uplink vinculaciones");
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
      setMsg(`${res.message} · ${res.link.portalUrl}`);
      setOwnerName("");
      setOwnerDoc("");
      setOwnerEmail("");
      await load();
    } catch (e) {
      setError((e as Error).message || "No se generó portal");
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
      setError((e as Error).message || "Background check fallido");
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
    <div className="fade-in mx-auto max-w-[1400px] space-y-5 bg-[#F4F6F9] p-4 text-[#0F172A] dark:bg-[#0A0D14] dark:text-[#F8FAFC] md:p-6">
      <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-[0_10px_30px_rgba(0,0,0,0.04)] dark:border-white/10 dark:bg-[#121722]">
        <PageIntro module="rrhh" title="Smart Onboarding · Vinculaciones" />
        <p className="mt-1 text-sm text-[#64748B] dark:text-[#94A3B8]">
          Embudo de auditoría legal · RUNT/SIMIT · OCR
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge tone="amber">Pipeline {dash?.stats.received ?? 0} nuevas</Badge>
          <Badge tone="rose">
            Bloqueo legal {dash?.stats.blockedLegal ?? 0}
          </Badge>
        </div>
      </div>

      <HowToBox
        steps={[
          "Genere link de auto-servicio para el propietario.",
          "OCR extrae SOAT/TO/pólizas; contrato PDF listo para firma.",
          "TO vencida a las 00:00 → ROJO legal y rebote en Logística.",
        ]}
      />

      {error ? (
        <p className="rounded-xl border border-[#DC2626]/40 bg-[#DC2626]/10 px-4 py-3 text-sm text-[#DC2626]">
          {error}
        </p>
      ) : null}
      {msg ? (
        <p className="rounded-xl border border-[#0D9488]/40 bg-[#0D9488]/10 px-4 py-3 text-sm">
          {msg}
        </p>
      ) : null}

      {/* Kanban */}
      <section id="kanban" className="space-y-3">
        <h3 className="font-display text-lg">Kanban de Ingreso</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {STAGES.map((s) => (
            <div
              key={s.key}
              className="rounded-xl border border-[#E2E8F0] bg-white p-3 dark:border-white/10 dark:bg-[#121722]"
            >
              <p className="text-xs font-semibold uppercase text-[#64748B]">
                {s.label}
              </p>
              <ul className="mt-2 space-y-2">
                {(dash?.kanban[s.key] ?? []).map((card) => (
                  <li
                    key={card.id}
                    className="rounded-lg border border-[#E2E8F0] px-2 py-2 text-sm dark:border-white/10"
                  >
                    <p className="font-mono text-xs text-[#0D9488]">
                      {card.code}
                    </p>
                    <p>{card.ownerName}</p>
                    <p className="font-mono text-xs text-[#64748B]">
                      {card.plate || "sin placa"}
                    </p>
                  </li>
                ))}
                {(dash?.kanban[s.key] ?? []).length === 0 ? (
                  <li className="py-6 text-center text-xs text-[#94A3B8]">
                    Vacío
                  </li>
                ) : null}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Acciones */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-[#E2E8F0] bg-white p-4 dark:border-white/10 dark:bg-[#121722]">
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
            placeholder="Email"
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
            Generar portal-link
          </Button>
        </section>

        <section className="rounded-xl border border-[#E2E8F0] bg-white p-4 dark:border-white/10 dark:bg-[#121722]">
          <h3 className="font-display text-base">Background check</h3>
          <input
            className="field mt-2 w-full"
            placeholder="Cédula conductor"
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
                      ? "emerald"
                      : c.riskLight === "AMBER"
                        ? "amber"
                        : "rose"
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
          className="rounded-xl border border-[#E2E8F0] bg-white p-4 dark:border-white/10 dark:bg-[#121722]"
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
        <div className="min-h-[220px] rounded-xl border border-dashed border-[#E2E8F0] bg-[#0A0D14]/5 p-4 font-mono text-xs dark:border-white/20">
          <p className="mb-2 text-[#64748B]">Visor PDF (split)</p>
          <pre className="whitespace-pre-wrap text-[#0F172A] dark:text-[#F8FAFC]">
            {ocrText || "Pegue texto OCR / referencia de PDF"}
          </pre>
        </div>
        <div className="min-h-[220px] rounded-xl border border-[#E2E8F0] bg-white p-4 dark:border-white/10 dark:bg-[#121722]">
          <p className="mb-2 text-sm text-[#64748B]">Extracción / contrato</p>
          <p className="font-mono text-sm text-[#0D9488]">
            {selectedPdf || "Contrato pendiente de generación"}
          </p>
          <p className="mt-4 text-xs text-[#64748B]">
            Validación manual: contraste OCR vs PDF original antes de firma
            digital.
          </p>
        </div>
      </section>

      {/* Traffic light */}
      <section
        id="vencimientos"
        className="rounded-xl border border-[#E2E8F0] bg-white p-4 dark:border-white/10 dark:bg-[#121722]"
      >
        <h3 className="font-display text-lg">Matriz de Vencimientos</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-[#E2E8F0] text-xs uppercase text-[#64748B] dark:border-white/10">
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
                  className="border-b border-[#E2E8F0]/70 dark:border-white/5"
                >
                  <td className="py-2 pr-2 font-mono text-[#0D9488]">
                    {row.plate}
                  </td>
                  {Object.keys(DOC_LABELS).map((k) => {
                    const d = row.docs[k];
                    return (
                      <td key={k} className="py-2 pr-2">
                        {d ? (
                          <Badge tone={lightTone(d.light)}>{d.light}</Badge>
                        ) : (
                          <span className="text-xs text-[#94A3B8]">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="py-2">
                    <Badge tone={row.legalRed ? "rose" : "emerald"}>
                      {row.legalRed ? "ROJO" : "OK"}
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
