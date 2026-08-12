"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { api } from "@/lib/api";
import { HowToBox, PageIntro } from "@/components/page-intro";

type InboxItem = {
  id: string;
  code: string;
  subject: string;
  requester: string;
  channel: string;
  message: string;
  tag: string;
  tagLabel: string;
  createdAt: string;
};

type VisitorRow = {
  id: string;
  name: string;
  document: string;
  company?: string | null;
  hostName: string;
  visitClass: string;
  boardStatus: string;
  badgeRfid?: string | null;
  checkedInAt: string;
  passCode?: string | null;
};

type RadarItem = {
  tripId: string;
  code: string;
  status: string;
  schoolOrRoute: string;
  vehicle: { plate: string; lat: number; lng: number } | null;
  driver: { name: string } | null;
  etaHint: string;
};

type Metrics = { visitors: number; leadsConverted: number; pqrsQuick: number };

const VISIT_CLASS_LABEL: Record<string, string> = {
  DRIVER_CANDIDATE: "Candidato conductor",
  SUPPLIER: "Proveedor/contratista",
  B2B_MEETING: "Cliente B2B / reunión",
  OTHER: "Otro",
};

export default function RecepcionDashboardPage() {
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [visitors, setVisitors] = useState<VisitorRow[]>([]);
  const [radar, setRadar] = useState<RadarItem[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [boardFilter, setBoardFilter] = useState<string>("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [selectedChat, setSelectedChat] = useState<InboxItem | null>(null);
  const [radarQ, setRadarQ] = useState("");
  const [panel, setPanel] = useState<"none" | "visit" | "lead" | "pqrs">("none");

  const [visitForm, setVisitForm] = useState({
    document: "",
    name: "",
    company: "",
    phone: "",
    hostName: "",
    reason: "Visita sede",
    visitClass: "OTHER",
    badgeRfid: "",
    boardStatus: "CHECKED_IN",
  });

  const [leadForm, setLeadForm] = useState({
    companyName: "",
    email: "",
    serviceDate: "",
    phone: "",
  });

  const [pqrsForm, setPqrsForm] = useState({
    requester: "",
    message: "Cliente reporta retraso en ruta",
    schoolName: "",
    routeLabel: "",
  });

  const load = useCallback(async () => {
    setError("");
    try {
      const [ib, vis, met] = await Promise.all([
        api<InboxItem[]>("/api/v1/recepcion/omnicanal/inbox"),
        api<VisitorRow[]>(
          `/api/v1/recepcion/visitas/today${boardFilter ? `?boardStatus=${boardFilter}` : ""}`,
        ),
        api<Metrics>("/api/v1/recepcion/metrics/daily"),
      ]);
      setInbox(ib);
      setVisitors(vis);
      setMetrics(met);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de uplink");
    }
  }, [boardFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onDocumentBlur() {
    if (visitForm.document.length < 4) return;
    try {
      const prev = await api<{
        name: string;
        company?: string;
        phone?: string;
        hostName?: string;
        visitClass?: string;
      } | null>(
        `/api/v1/recepcion/visitas/lookup?document=${encodeURIComponent(visitForm.document)}`,
      );
      if (!prev) return;
      setVisitForm((f) => ({
        ...f,
        name: f.name || prev.name,
        company: f.company || prev.company || "",
        phone: f.phone || prev.phone || "",
        hostName: f.hostName || prev.hostName || "",
        visitClass: prev.visitClass || f.visitClass,
      }));
    } catch {
      /* noop */
    }
  }

  async function submitVisit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    try {
      await api("/api/v1/recepcion/visitas/check-in", {
        method: "POST",
        body: JSON.stringify({
          ...visitForm,
          badgeRfid: visitForm.badgeRfid || undefined,
        }),
      });
      setInfo("Visita registrada · evento visitor.checked_in emitido");
      setPanel("none");
      setVisitForm({
        document: "",
        name: "",
        company: "",
        phone: "",
        hostName: "",
        reason: "Visita sede",
        visitClass: "OTHER",
        badgeRfid: "",
        boardStatus: "CHECKED_IN",
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  async function submitLead(e: FormEvent) {
    e.preventDefault();
    if (!selectedChat) {
      setError("Selecciona un chat de la bandeja");
      return;
    }
    setError("");
    try {
      const res = await api<{
        dailyLeadMetrics: number;
        message: string;
      }>("/api/v1/recepcion/omnicanal/convert-lead", {
        method: "POST",
        body: JSON.stringify({
          ticketId: selectedChat.id,
          companyName: leadForm.companyName,
          email: leadForm.email,
          phone: leadForm.phone || undefined,
          serviceDate: leadForm.serviceDate || undefined,
        }),
      });
      setInfo(
        `${res.message} · métrica diaria leads: ${res.dailyLeadMetrics}`,
      );
      setSelectedChat(null);
      setPanel("none");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  async function submitPqrs(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const t = await api<{ code: string }>("/api/v1/recepcion/pqrs/quick-ticket", {
        method: "POST",
        body: JSON.stringify({
          subject: "Retraso en ruta",
          requester: pqrsForm.requester,
          message: pqrsForm.message,
          schoolName: pqrsForm.schoolName || undefined,
          routeLabel: pqrsForm.routeLabel || undefined,
        }),
      });
      setInfo(`PQRS ${t.code} enviado a Torre de Control / QHSE`);
      setPanel("none");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  async function searchRadar() {
    setError("");
    try {
      const res = await api<{ items: RadarItem[] }>(
        `/api/v1/recepcion/rutas/radar-status?q=${encodeURIComponent(radarQ)}`,
      );
      setRadar(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  const waiting = useMemo(
    () => visitors.filter((v) => v.boardStatus === "WAITING").length,
    [visitors],
  );

  return (
    <div className="fade-in mx-auto max-w-[1800px] space-y-4">
      <PageIntro
        module="call_center"
        title="Recepción · Concierge omnicanal"
        action={
          metrics ? (
            <div className="flex flex-wrap gap-2 font-data text-xs">
              <Badge tone="emerald">Visitas {metrics.visitors}</Badge>
              <Badge tone="amber">Leads {metrics.leadsConverted}</Badge>
              <Badge tone="rose">PQRS {metrics.pqrsQuick}</Badge>
            </div>
          ) : null
        }
      />
      <HowToBox
        steps={[
          "Registra visitas con cédula, clasificación y gafete RFID.",
          "Tipifica chats y convierte a Lead (pase de balón comercial).",
          "Consulta radar solo lectura y radica PQRS de retraso.",
        ]}
      />

      {error ? (
        <p className="text-sm text-[var(--brand-signal,#FF2A5F)]">{error}</p>
      ) : null}
      {info ? (
        <p className="text-sm text-[var(--brand-amber,#FFB800)]">{info}</p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* Columna izquierda — Omnicanal */}
        <section
          id="omnicanal"
          className="fsg-panel xl:col-span-4 flex max-h-[78vh] flex-col overflow-hidden"
        >
          <div className="border-b border-[var(--brand-line)] px-4 py-3 font-display text-sm font-semibold">
            Bandeja omnicanal
          </div>
          <ul className="flex-1 space-y-2 overflow-y-auto p-3">
            {inbox.length === 0 ? (
              <li className="text-sm text-[var(--text-secondary)]">
                Sin chats entrantes
              </li>
            ) : (
              inbox.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedChat(c);
                      setLeadForm((f) => ({
                        ...f,
                        companyName: f.companyName || c.requester,
                      }));
                    }}
                    className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                      selectedChat?.id === c.id
                        ? "border-[var(--accent-primary)] bg-[color-mix(in_srgb,var(--accent-primary)_12%,transparent)]"
                        : "border-[var(--brand-line)] hover:border-[var(--accent-primary)]/40"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-data text-[10px] uppercase tracking-wide text-[var(--text-secondary)]">
                        {c.channel}
                      </span>
                      <Badge tone="amber">{c.tagLabel}</Badge>
                    </div>
                    <div className="mt-1 text-sm font-medium">{c.subject}</div>
                    <div className="font-data text-xs text-[var(--text-secondary)]">
                      {c.requester} · {c.code}
                    </div>
                  </button>
                </li>
              ))
            )}
          </ul>
          {selectedChat ? (
            <div className="border-t border-[var(--brand-line)] p-3">
              <p className="mb-2 line-clamp-3 text-xs text-[var(--text-secondary)]">
                {selectedChat.message}
              </p>
              <Button
                variant="primary"
                onClick={() => setPanel("lead")}
              >
                Convertir a Lead
              </Button>
            </div>
          ) : null}
        </section>

        {/* Centro — Smart Visitor Board */}
        <section
          id="visitantes"
          className="fsg-panel xl:col-span-5 flex max-h-[78vh] flex-col overflow-hidden"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--brand-line)] px-4 py-3">
            <div className="font-display text-sm font-semibold">
              Smart Visitor Board
              <span className="ml-2 font-data text-xs text-[var(--text-secondary)]">
                espera {waiting}
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {["", "WAITING", "CHECKED_IN", "CHECKED_OUT"].map((s) => (
                <button
                  key={s || "all"}
                  type="button"
                  className={`flt-nav-item !inline-flex !w-auto px-2 py-1 text-xs ${boardFilter === s ? "is-active" : ""}`}
                  onClick={() => setBoardFilter(s)}
                >
                  {s === ""
                    ? "Hoy"
                    : s === "WAITING"
                      ? "En espera"
                      : s === "CHECKED_IN"
                        ? "Ingresó"
                        : "Salió"}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs text-[var(--text-secondary)]">
                  <th className="px-3 py-2">Visitante</th>
                  <th className="px-3 py-2">Clase</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2">RFID</th>
                </tr>
              </thead>
              <tbody>
                {visitors.map((v) => (
                  <tr key={v.id} className="border-t border-[var(--brand-line)]">
                    <td className="px-3 py-2">
                      <div className="font-medium">{v.name}</div>
                      <div className="font-data text-[11px] text-[var(--text-secondary)]">
                        {v.document} · {v.hostName}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {VISIT_CLASS_LABEL[v.visitClass] || v.visitClass}
                    </td>
                    <td className="px-3 py-2">
                      <Badge
                        tone={
                          v.boardStatus === "CHECKED_OUT"
                            ? "rose"
                            : v.boardStatus === "WAITING"
                              ? "amber"
                              : "emerald"
                        }
                      >
                        {v.boardStatus}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 font-data text-xs">
                      {v.badgeRfid || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div id="radar" className="border-t border-[var(--brand-line)] p-3">
            <div className="mb-2 font-display text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
              Radar de rutas (solo lectura)
            </div>
            <div className="mb-2 flex gap-2">
              <input
                className="field flex-1"
                placeholder="Colegio / ruta / placa"
                value={radarQ}
                onChange={(e) => setRadarQ(e.target.value)}
              />
              <Button variant="ghost" onClick={() => void searchRadar()}>
                Buscar
              </Button>
            </div>
            <ul className="max-h-36 space-y-1 overflow-y-auto text-xs">
              {radar.map((r) => (
                <li
                  key={r.tripId}
                  className="rounded border border-[var(--brand-line)] px-2 py-1.5"
                >
                  <span className="font-data">{r.vehicle?.plate || "s/p"}</span>
                  {" · "}
                  {r.schoolOrRoute} · {r.status}
                  {r.vehicle ? (
                    <span className="font-data text-[var(--text-secondary)]">
                      {" "}
                      ({r.vehicle.lat.toFixed(4)}, {r.vehicle.lng.toFixed(4)})
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Derecha — acciones rápidas */}
        <section className="fsg-panel xl:col-span-3 space-y-3 p-4">
          <div className="font-display text-sm font-semibold">Acción rápida</div>
          <button
            type="button"
            className="login-submit flex w-full items-center justify-center py-5 text-base font-semibold"
            onClick={() => setPanel("visit")}
          >
            + Nuevo visitante
          </button>
          <button
            type="button"
            className="flex w-full items-center justify-center rounded-lg border border-[var(--brand-line)] bg-[var(--surface-1,#121722)] py-5 text-base font-semibold transition hover:border-[var(--accent-primary)]"
            onClick={() => {
              if (!selectedChat) {
                setError("Selecciona un chat para convertir a Lead");
                return;
              }
              setPanel("lead");
            }}
          >
            + Nuevo Lead
          </button>
          <button
            type="button"
            className="flex w-full items-center justify-center rounded-lg border border-[var(--brand-signal,#FF2A5F)]/50 py-5 text-base font-semibold text-[var(--brand-signal,#FF2A5F)] transition hover:bg-[color-mix(in_srgb,var(--brand-signal)_10%,transparent)]"
            onClick={() => setPanel("pqrs")}
            id="pqrs"
          >
            + Reportar PQRS
          </button>

          {panel === "visit" ? (
            <form onSubmit={submitVisit} className="space-y-2 border-t border-[var(--brand-line)] pt-3">
              <input
                className="field font-data"
                placeholder="Cédula"
                value={visitForm.document}
                onChange={(e) =>
                  setVisitForm((f) => ({ ...f, document: e.target.value }))
                }
                onBlur={() => void onDocumentBlur()}
                required
              />
              <input
                className="field"
                placeholder="Nombre"
                value={visitForm.name}
                onChange={(e) =>
                  setVisitForm((f) => ({ ...f, name: e.target.value }))
                }
                required
              />
              <input
                className="field"
                placeholder="Empresa"
                value={visitForm.company}
                onChange={(e) =>
                  setVisitForm((f) => ({ ...f, company: e.target.value }))
                }
              />
              <input
                className="field"
                placeholder="Anfitrión"
                value={visitForm.hostName}
                onChange={(e) =>
                  setVisitForm((f) => ({ ...f, hostName: e.target.value }))
                }
                required
              />
              <select
                className="field"
                value={visitForm.visitClass}
                onChange={(e) =>
                  setVisitForm((f) => ({ ...f, visitClass: e.target.value }))
                }
              >
                {Object.entries(VISIT_CLASS_LABEL).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
              <input
                className="field font-data"
                placeholder="Gafete RFID"
                value={visitForm.badgeRfid}
                onChange={(e) =>
                  setVisitForm((f) => ({ ...f, badgeRfid: e.target.value }))
                }
              />
              <Button type="submit" variant="primary">
                Registrar visita
              </Button>
            </form>
          ) : null}

          {panel === "lead" ? (
            <form onSubmit={submitLead} className="space-y-2 border-t border-[var(--brand-line)] pt-3">
              <p className="text-xs text-[var(--text-secondary)]">
                Chat: {selectedChat?.code || "—"}
              </p>
              <input
                className="field"
                placeholder="Empresa"
                value={leadForm.companyName}
                onChange={(e) =>
                  setLeadForm((f) => ({ ...f, companyName: e.target.value }))
                }
                required
              />
              <input
                className="field font-data"
                type="email"
                placeholder="Email"
                value={leadForm.email}
                onChange={(e) =>
                  setLeadForm((f) => ({ ...f, email: e.target.value }))
                }
                required
              />
              <input
                className="field font-data"
                type="date"
                value={leadForm.serviceDate}
                onChange={(e) =>
                  setLeadForm((f) => ({ ...f, serviceDate: e.target.value }))
                }
              />
              <Button type="submit" variant="primary">
                Asignar a gestor comercial
              </Button>
            </form>
          ) : null}

          {panel === "pqrs" ? (
            <form onSubmit={submitPqrs} className="space-y-2 border-t border-[var(--brand-line)] pt-3">
              <input
                className="field"
                placeholder="Solicitante"
                value={pqrsForm.requester}
                onChange={(e) =>
                  setPqrsForm((f) => ({ ...f, requester: e.target.value }))
                }
                required
              />
              <input
                className="field"
                placeholder="Colegio"
                value={pqrsForm.schoolName}
                onChange={(e) =>
                  setPqrsForm((f) => ({ ...f, schoolName: e.target.value }))
                }
              />
              <input
                className="field"
                placeholder="Ruta"
                value={pqrsForm.routeLabel}
                onChange={(e) =>
                  setPqrsForm((f) => ({ ...f, routeLabel: e.target.value }))
                }
              />
              <textarea
                className="field min-h-[80px]"
                value={pqrsForm.message}
                onChange={(e) =>
                  setPqrsForm((f) => ({ ...f, message: e.target.value }))
                }
                required
              />
              <Button type="submit" variant="primary">
                Reportar novedad
              </Button>
            </form>
          ) : null}
        </section>
      </div>
    </div>
  );
}
