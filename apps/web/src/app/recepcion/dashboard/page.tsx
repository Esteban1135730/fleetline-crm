"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@fsg/ui";
import {
  MessageSquare,
  UserPlus,
  AlertTriangle,
  Radar,
  Users,
} from "lucide-react";
import { api } from "@/lib/api";
import { statusEs } from "@fsg/shared";
import { PageIntro } from "@/components/page-intro";
import {
  EmptyState,
  KpiCard,
  Modal,
  StatusPulseBadge,
} from "@/components/audit";

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
  B2B_MEETING: "Cliente empresa / reunión",
  OTHER: "Otro",
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function formatTs(iso: string) {
  try {
    return new Date(iso).toLocaleString("es-CO", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function RecepcionDashboardPage() {
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [visitors, setVisitors] = useState<VisitorRow[]>([]);
  const [radar, setRadar] = useState<RadarItem[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [boardFilter, setBoardFilter] = useState<string>("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [infoHref, setInfoHref] = useState("");
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
      setError(e instanceof Error ? e.message : "Error de conexión");
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
    setInfoHref("");
    try {
      const res = await api<{
        destination?: { board: string; notifiedArea: string; href: string };
      }>("/api/v1/recepcion/visitas/check-in", {
        method: "POST",
        body: JSON.stringify({
          ...visitForm,
          badgeRfid: visitForm.badgeRfid || undefined,
        }),
      });
      const dest = res.destination;
      setInfo(
        dest
          ? `Visitante en ${dest.board}. Aviso enviado a ${dest.notifiedArea}.`
          : "Visita registrada en el tablero de visitantes.",
      );
      setInfoHref(dest?.href || "#visitantes");
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
      document.getElementById("visitantes")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  async function submitLead(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const res = await api<{
        dailyLeadMetrics: number;
        message: string;
        destination?: { href: string; label?: string };
      }>("/api/v1/recepcion/omnicanal/convert-lead", {
        method: "POST",
        body: JSON.stringify({
          ticketId: selectedChat?.id,
          companyName: leadForm.companyName,
          email: leadForm.email,
          phone: leadForm.phone || undefined,
          serviceDate: leadForm.serviceDate || undefined,
        }),
      });
      setInfo(
        `${res.message} · llega a Comercial (${res.destination?.label || "cotización en borrador"}).`,
      );
      setInfoHref(res.destination?.href || "/comercial");
      setSelectedChat(null);
      setLeadForm({ companyName: "", email: "", serviceDate: "", phone: "" });
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
      const t = await api<{
        code: string;
        destination?: { href: string; area: string };
      }>("/api/v1/recepcion/pqrs/quick-ticket", {
        method: "POST",
        body: JSON.stringify({
          subject: "Retraso en ruta",
          requester: pqrsForm.requester,
          message: pqrsForm.message,
          schoolName: pqrsForm.schoolName || undefined,
          routeLabel: pqrsForm.routeLabel || undefined,
        }),
      });
      setInfo(
        `PQRS ${t.code} enviada a ${t.destination?.area || "QHSE / Torre de Control"}.`,
      );
      setInfoHref(t.destination?.href || "/qhse/dashboard");
      setPqrsForm({
        requester: "",
        message: "Cliente reporta retraso en ruta",
        schoolName: "",
        routeLabel: "",
      });
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
        title="Recepción · Atención omnicanal"
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="primary"
              className="inline-flex w-auto items-center px-4 py-2"
              onClick={() => setPanel("visit")}
            >
              <UserPlus className="mr-1.5 h-4 w-4" aria-hidden />
              Nuevo visitante
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-auto border border-amber-500/50 px-4 py-2 text-amber-300 hover:bg-amber-500/10"
              onClick={() => {
                setError("");
                setPanel("lead");
              }}
            >
              + Nuevo prospecto
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-auto border border-rose-500/35 px-4 py-2 text-rose-300/90 hover:bg-rose-500/10"
              onClick={() => setPanel("pqrs")}
            >
              + Nueva PQRS
            </Button>
          </div>
        }
      />

      {error ? (
        <p className="text-sm text-[var(--brand-signal,#FF2A5F)]">{error}</p>
      ) : null}
      {info ? (
        <p className="text-sm text-[var(--brand-amber,#FFB800)]">
          {info}{" "}
          {infoHref.startsWith("/") ? (
            <Link
              href={infoHref}
              className="ml-1 underline underline-offset-2"
            >
              Abrir destino
            </Link>
          ) : infoHref.startsWith("#") ? (
            <a href={infoHref} className="ml-1 underline underline-offset-2">
              Ver tablero
            </a>
          ) : null}
        </p>
      ) : null}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard
          label="Visitas hoy"
          value={metrics?.visitors ?? "—"}
          tone="ok"
          icon={<Users />}
          delta={waiting > 0 ? `${waiting} en espera` : "Destino: tablero de visitantes"}
        />
        <KpiCard
          label="Prospectos convertidos"
          value={metrics?.leadsConverted ?? "—"}
          tone="warn"
          icon={<UserPlus />}
          delta="Destino: Comercial"
        />
        <KpiCard
          label="PQRS rápidas"
          value={metrics?.pqrsQuick ?? "—"}
          tone="danger"
          icon={<AlertTriangle />}
          delta="Destino: QHSE"
        />
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <section
          id="omnicanal"
          className="fsg-panel xl:col-span-4 flex max-h-[78vh] flex-col overflow-hidden"
        >
          <div className="flex items-center gap-2 border-b border-[var(--brand-line)] px-4 py-3 font-display text-sm font-semibold">
            <MessageSquare className="h-4 w-4 text-slate-500" aria-hidden />
            Bandeja omnicanal
          </div>
          {inbox.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<MessageSquare className="h-7 w-7" />}
                title="Sin chats entrantes"
                description="La cola omnicanal está vacía. Los mensajes aparecerán aquí."
              />
            </div>
          ) : (
            <ul className="flex-1 space-y-2 overflow-y-auto p-3">
              {inbox.map((c) => (
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
                    className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition duration-150 ease-in-out ${
                      selectedChat?.id === c.id
                        ? "border-[var(--accent-primary)] bg-[color-mix(in_srgb,var(--accent-primary)_12%,transparent)]"
                        : "border-[var(--brand-line)] hover:border-[var(--accent-primary)]/40"
                    }`}
                  >
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-800 font-mono text-xs font-semibold text-slate-200"
                      aria-hidden
                    >
                      {initials(c.requester)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-data text-[10px] uppercase tracking-wide text-[var(--text-secondary)]">
                          {statusEs(c.channel)}
                        </span>
                        <StatusPulseBadge tone="fatiga">{c.tagLabel}</StatusPulseBadge>
                      </span>
                      <span className="mt-1 block text-sm font-medium text-slate-100">
                        {c.subject}
                      </span>
                      <span className="mt-0.5 block font-data text-xs text-[var(--text-secondary)]">
                        {c.requester} · {c.code}
                      </span>
                      <span className="mt-1 block font-mono text-[11px] tabular-nums text-slate-500">
                        {formatTs(c.createdAt)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {selectedChat ? (
            <div className="border-t border-[var(--brand-line)] p-3">
              <p className="mb-2 line-clamp-3 text-xs text-[var(--text-secondary)]">
                {selectedChat.message}
              </p>
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  className="w-auto border border-amber-500/50 px-4 py-2 text-amber-300 hover:bg-amber-500/10"
                  onClick={() => setPanel("lead")}
                >
                  Convertir a Lead
                </Button>
              </div>
            </div>
          ) : null}
        </section>

        <section
          id="visitantes"
          className="fsg-panel xl:col-span-8 flex max-h-[78vh] flex-col overflow-hidden"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--brand-line)] px-4 py-3">
            <div className="font-display text-sm font-semibold">
              Tablero de visitantes
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
            {visitors.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={<Users className="h-7 w-7" />}
                  title="Sin visitas registradas"
                  description="Registra el primer visitante del día."
                  actionLabel="+ Nuevo visitante"
                  onAction={() => setPanel("visit")}
                />
              </div>
            ) : (
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
                        <div className="flex items-center gap-2">
                          <span
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-800 font-mono text-[10px] font-semibold text-slate-200"
                            aria-hidden
                          >
                            {initials(v.name)}
                          </span>
                          <div>
                            <div className="font-medium">{v.name}</div>
                            <div className="font-data text-[11px] text-[var(--text-secondary)]">
                              {v.document} · {v.hostName}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {VISIT_CLASS_LABEL[v.visitClass] || v.visitClass}
                      </td>
                      <td className="px-3 py-2">
                        <StatusPulseBadge
                          tone={
                            v.boardStatus === "CHECKED_OUT"
                              ? "danger"
                              : v.boardStatus === "WAITING"
                                ? "fatiga"
                                : "active"
                          }
                        >
                          {v.boardStatus}
                        </StatusPulseBadge>
                      </td>
                      <td className="px-3 py-2 font-data text-xs">
                        {v.badgeRfid || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div id="radar" className="border-t border-[var(--brand-line)] p-3">
            <div className="mb-2 flex items-center gap-1.5 font-display text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
              <Radar className="h-3.5 w-3.5" aria-hidden />
              Radar de rutas (solo lectura)
            </div>
            <div className="mb-2 flex flex-wrap gap-2">
              <input
                className="field h-11 min-h-[44px] flex-1"
                placeholder="Colegio / ruta / placa"
                value={radarQ}
                onChange={(e) => setRadarQ(e.target.value)}
              />
              <Button
                variant="ghost"
                className="w-auto px-4 py-2"
                onClick={() => void searchRadar()}
              >
                Buscar
              </Button>
            </div>
            {radar.length === 0 ? (
              <p className="text-xs text-slate-500">Sin resultados de radar</p>
            ) : (
              <ul className="max-h-36 space-y-1 overflow-y-auto text-xs">
                {radar.map((r) => (
                  <li
                    key={r.tripId}
                    className="rounded border border-[var(--brand-line)] px-2 py-1.5"
                  >
                    <span className="font-data">{r.vehicle?.plate || "s/p"}</span>
                    {" · "}
                    {r.schoolOrRoute} · {statusEs(r.status)}
                    {r.vehicle ? (
                      <span className="font-data text-[var(--text-secondary)]">
                        {" "}
                        ({r.vehicle.lat.toFixed(4)}, {r.vehicle.lng.toFixed(4)})
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <Modal
        open={panel === "visit"}
        onClose={() => setPanel("none")}
        title="Nuevo visitante"
        description="Ingreso con cédula, clasificación y gafete RFID."
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              className="w-auto px-4 py-2"
              onClick={() => setPanel("none")}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="visit-form"
              variant="primary"
              className="w-auto px-4 py-2"
            >
              Registrar visita
            </Button>
          </>
        }
      >
        <form id="visit-form" onSubmit={submitVisit} className="space-y-3">
          <input
            className="field h-11 min-h-[44px] font-data"
            placeholder="Cédula"
            value={visitForm.document}
            onChange={(e) =>
              setVisitForm((f) => ({ ...f, document: e.target.value }))
            }
            onBlur={() => void onDocumentBlur()}
            required
          />
          <input
            className="field h-11 min-h-[44px]"
            placeholder="Nombre"
            value={visitForm.name}
            onChange={(e) =>
              setVisitForm((f) => ({ ...f, name: e.target.value }))
            }
            required
          />
          <input
            className="field h-11 min-h-[44px]"
            placeholder="Empresa"
            value={visitForm.company}
            onChange={(e) =>
              setVisitForm((f) => ({ ...f, company: e.target.value }))
            }
          />
          <input
            className="field h-11 min-h-[44px]"
            placeholder="Anfitrión"
            value={visitForm.hostName}
            onChange={(e) =>
              setVisitForm((f) => ({ ...f, hostName: e.target.value }))
            }
            required
          />
          <select
            className="field h-11 min-h-[44px]"
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
            className="field h-11 min-h-[44px] font-data"
            placeholder="Gafete RFID"
            value={visitForm.badgeRfid}
            onChange={(e) =>
              setVisitForm((f) => ({ ...f, badgeRfid: e.target.value }))
            }
          />
        </form>
      </Modal>

      <Modal
        open={panel === "lead"}
        onClose={() => setPanel("none")}
        title="Nuevo prospecto"
        description={
          selectedChat
            ? `Chat ${selectedChat.code} · pase a Comercial`
            : "Prospecto presencial (llegada directa). Llega a Comercial como cotización en borrador."
        }
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              className="w-auto px-4 py-2"
              onClick={() => setPanel("none")}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="lead-form"
              variant="primary"
              className="w-auto px-4 py-2"
            >
              Asignar a gestor comercial
            </Button>
          </>
        }
      >
        <form id="lead-form" onSubmit={submitLead} className="space-y-3">
          <input
            className="field h-11 min-h-[44px]"
            placeholder="Empresa"
            value={leadForm.companyName}
            onChange={(e) =>
              setLeadForm((f) => ({ ...f, companyName: e.target.value }))
            }
            required
          />
          <input
            className="field h-11 min-h-[44px] font-data"
            type="email"
            placeholder="Correo"
            value={leadForm.email}
            onChange={(e) =>
              setLeadForm((f) => ({ ...f, email: e.target.value }))
            }
            required
          />
          <input
            className="field h-11 min-h-[44px] font-data"
            placeholder="Teléfono"
            value={leadForm.phone}
            onChange={(e) =>
              setLeadForm((f) => ({ ...f, phone: e.target.value }))
            }
          />
          <input
            className="field h-11 min-h-[44px] font-data"
            type="date"
            value={leadForm.serviceDate}
            onChange={(e) =>
              setLeadForm((f) => ({ ...f, serviceDate: e.target.value }))
            }
          />
        </form>
      </Modal>

      <Modal
        open={panel === "pqrs"}
        onClose={() => setPanel("none")}
        title="Nueva PQRS"
        description="Radicación rápida hacia Torre de Control / QHSE."
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              className="w-auto px-4 py-2"
              onClick={() => setPanel("none")}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="pqrs-form"
              variant="primary"
              className="w-auto px-4 py-2"
            >
              Reportar novedad
            </Button>
          </>
        }
      >
        <form id="pqrs-form" onSubmit={submitPqrs} className="space-y-3">
          <input
            className="field h-11 min-h-[44px]"
            placeholder="Solicitante"
            value={pqrsForm.requester}
            onChange={(e) =>
              setPqrsForm((f) => ({ ...f, requester: e.target.value }))
            }
            required
          />
          <input
            className="field h-11 min-h-[44px]"
            placeholder="Colegio"
            value={pqrsForm.schoolName}
            onChange={(e) =>
              setPqrsForm((f) => ({ ...f, schoolName: e.target.value }))
            }
          />
          <input
            className="field h-11 min-h-[44px]"
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
        </form>
      </Modal>
    </div>
  );
}
