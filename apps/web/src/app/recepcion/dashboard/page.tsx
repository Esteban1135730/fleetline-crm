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
import {
  clearFieldError,
  splitFormApiError,
} from "@/lib/form-api-error";
import { statusEs } from "@fsg/shared";
import {
  EmptyState,
  KpiCard,
  SlideOver,
  StatusPulseBadge,
} from "@/components/audit";
import { BentoPanel } from "@/components/nexa/bento-panel";
import { NexaTable, NexaRow, NexaCell } from "@/components/nexa/nexa-table";

const VISIT_FIELDS = [
  "document",
  "name",
  "company",
  "phone",
  "hostName",
  "reason",
  "visitClass",
  "badgeRfid",
] as const;
const LEAD_FIELDS = [
  "companyName",
  "email",
  "phone",
  "serviceDate",
] as const;
const PQRS_FIELDS = [
  "requester",
  "message",
  "schoolName",
  "routeLabel",
] as const;

function FormAlert({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded border border-[var(--brand-danger)]/40 bg-[var(--brand-danger)]/10 px-3 py-2 text-sm text-[var(--brand-danger)]"
    >
      {message}
    </p>
  );
}

function FieldHint({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-1 text-xs text-[var(--brand-danger)]">
      {message}
    </p>
  );
}

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

type PqrsTicket = {
  id: string;
  code?: string;
  subject?: string;
  requester?: string;
  status: string;
  priority?: string;
  pqrsType?: string | null;
  message?: string;
  createdAt: string;
};

const DEFCON_KEYWORDS = [
  "accidente",
  "abogado",
  "demanda",
  "peligro",
  "herido",
  "muerte",
  "choque",
  "fiscalía",
  "denuncia",
];

function isDefcon1(text: string) {
  const n = text.toLowerCase();
  return DEFCON_KEYWORDS.some((k) => n.includes(k));
}

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
  const [radarError, setRadarError] = useState("");
  const [pqrsTickets, setPqrsTickets] = useState<PqrsTicket[]>([]);
  const [pqrsStatus, setPqrsStatus] = useState("");
  const [visitBusyId, setVisitBusyId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [boardFilter, setBoardFilter] = useState<string>("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [infoHref, setInfoHref] = useState("");
  const [selectedChat, setSelectedChat] = useState<InboxItem | null>(null);
  const [radarQ, setRadarQ] = useState("");
  const [panel, setPanel] = useState<"none" | "visit" | "lead" | "pqrs">("none");
  const [visitFormError, setVisitFormError] = useState("");
  const [visitFieldErrors, setVisitFieldErrors] = useState<
    Record<string, string>
  >({});
  const [leadFormError, setLeadFormError] = useState("");
  const [leadFieldErrors, setLeadFieldErrors] = useState<
    Record<string, string>
  >({});
  const [pqrsFormError, setPqrsFormError] = useState("");
  const [pqrsFieldErrors, setPqrsFieldErrors] = useState<
    Record<string, string>
  >({});

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
      const pqrsQs = pqrsStatus ? `?status=${pqrsStatus}` : "";
      const [ib, vis, met, pqrs, radarRes] = await Promise.all([
        api<InboxItem[]>("/api/v1/recepcion/omnicanal/inbox"),
        api<VisitorRow[]>(
          `/api/v1/recepcion/visitas/today${boardFilter ? `?boardStatus=${boardFilter}` : ""}`,
        ),
        api<Metrics>("/api/v1/recepcion/metrics/daily"),
        api<PqrsTicket[] | { items?: PqrsTicket[] }>(
          `/api/v1/pqrs/tickets${pqrsQs}`,
        ).catch(() => []),
        api<{ items: RadarItem[] }>(
          `/api/v1/recepcion/rutas/radar-status?q=${encodeURIComponent(radarQ)}`,
        ).catch(() => ({ items: [] as RadarItem[] })),
      ]);
      setInbox(ib);
      setVisitors(vis);
      setMetrics(met);
      setPqrsTickets(Array.isArray(pqrs) ? pqrs : pqrs.items ?? []);
      setRadar(radarRes.items ?? []);
      setRadarError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de conexión");
    }
  }, [boardFilter, pqrsStatus, radarQ]);

  useEffect(() => {
    void load();
  }, [load]);

  async function updateVisitorStatus(id: string, boardStatus: string) {
    setVisitBusyId(id);
    setError("");
    try {
      await api(`/api/v1/recepcion/visitas/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ boardStatus }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar visita");
    } finally {
      setVisitBusyId(null);
    }
  }

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
    setVisitFormError("");
    setVisitFieldErrors({});
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
      const split = splitFormApiError(err, [...VISIT_FIELDS]);
      setVisitFormError(split.formError);
      setVisitFieldErrors(split.fieldErrors);
    }
  }

  async function submitLead(e: FormEvent) {
    e.preventDefault();
    setLeadFormError("");
    setLeadFieldErrors({});
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
      const split = splitFormApiError(err, [...LEAD_FIELDS]);
      setLeadFormError(split.formError);
      setLeadFieldErrors(split.fieldErrors);
    }
  }

  async function submitPqrs(e: FormEvent) {
    e.preventDefault();
    setPqrsFormError("");
    setPqrsFieldErrors({});
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
      const split = splitFormApiError(err, [...PQRS_FIELDS]);
      setPqrsFormError(split.formError);
      setPqrsFieldErrors(split.fieldErrors);
    }
  }

  async function searchRadar() {
    setRadarError("");
    try {
      const res = await api<{ items: RadarItem[] }>(
        `/api/v1/recepcion/rutas/radar-status?q=${encodeURIComponent(radarQ)}`,
      );
      setRadar(res.items);
    } catch (err) {
      setRadarError(err instanceof Error ? err.message : "Radar sin señal");
      setRadar([]);
    }
  }

  const waiting = useMemo(
    () => visitors.filter((v) => v.boardStatus === "WAITING").length,
    [visitors],
  );

  const defconCount = useMemo(
    () =>
      inbox.filter(
        (i) => isDefcon1(`${i.subject} ${i.message}`) || isDefcon1(i.tagLabel),
      ).length,
    [inbox],
  );

  const pqrsDefcon = isDefcon1(pqrsForm.message);

  return (
    <div className="fade-in mx-auto max-w-[1800px] space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-border pb-4">
        <div>
          <p className="font-data text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-primary">
            Recepción
          </p>
          <h1 className="font-sans text-2xl font-semibold tracking-tight text-brand-text-primary md:text-3xl">
            Recepción · visitantes y mensajes
          </h1>
          <p className="mt-1 max-w-xl text-sm text-brand-text-secondary">
            Registro de visitas, mensajes entrantes (WhatsApp, correo, llamadas)
            y pase a Comercial o QHSE.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="primary"
            className="inline-flex w-auto items-center px-4 py-2"
            onClick={() => {
              setVisitFormError("");
              setVisitFieldErrors({});
              setPanel("visit");
            }}
          >
            <UserPlus className="mr-1.5 h-4 w-4" aria-hidden />
            Nuevo visitante
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-auto border border-brand-warning/50 px-4 py-2 text-brand-warning hover:bg-brand-warning/10"
            onClick={() => {
              setLeadFormError("");
              setLeadFieldErrors({});
              setError("");
              setPanel("lead");
            }}
          >
            + Cliente potencial
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-auto border border-brand-danger/35 px-4 py-2 text-brand-danger/90 hover:bg-brand-danger/10"
            onClick={() => {
              setPqrsFormError("");
              setPqrsFieldErrors({});
              setPanel("pqrs");
            }}
          >
            + Nueva PQRS
          </Button>
        </div>
      </header>

      {error ? (
        <p className="text-sm text-[var(--brand-danger)]">{error}</p>
      ) : null}
      {info ? (
        <p className="text-sm text-[var(--brand-warning)]">
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

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Visitas hoy"
          value={metrics?.visitors ?? "—"}
          tone="ok"
          icon={<Users className="h-5 w-5" aria-hidden />}
          delta={
            waiting > 0
              ? `${waiting} en espera en sala`
              : "Visitantes del día"
          }
          tip="Cuántas personas se registraron hoy en recepción."
        />
        <KpiCard
          label="Clientes potenciales enviados"
          value={metrics?.leadsConverted ?? "—"}
          tone="warn"
          icon={<UserPlus className="h-5 w-5" aria-hidden />}
          delta="Pase a Comercial"
          tip="Leads enviados a Comercial desde recepción o bandeja."
        />
        <KpiCard
          label="PQRS rápidas"
          value={metrics?.pqrsQuick ?? "—"}
          tone="danger"
          icon={<AlertTriangle className="h-5 w-5" aria-hidden />}
          delta="Tickets enviados a QHSE"
          tip="Quejas o reclamos enviados a Calidad / QHSE."
        />
        <KpiCard
          label="Urgencias en bandeja"
          value={defconCount}
          tone={defconCount > 0 ? "danger" : "ok"}
          icon={<AlertTriangle className="h-5 w-5" aria-hidden />}
          delta="Accidente, abogado, peligro…"
          tip="Mensajes con temas críticos en la bandeja."
        />
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <section
          id="omnicanal"
          className="nexa-panel xl:col-span-4 flex max-h-[78vh] flex-col overflow-hidden"
        >
          <div className="border-b border-[var(--brand-border)] px-4 py-3">
            <div className="flex items-center gap-2 font-display text-sm font-semibold">
              <MessageSquare className="h-4 w-4 text-brand-text-secondary" aria-hidden />
              Bandeja de mensajes
            </div>
            <p className="mt-1 text-xs leading-relaxed text-brand-text-secondary">
              Aquí llegan WhatsApp, correo y llamadas. Seleccione un mensaje
              para leerlo y enviarlo a Comercial cuando pida cotización.
            </p>
          </div>
          {inbox.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<MessageSquare className="h-7 w-7" />}
                title="Sin mensajes pendientes"
                description="Cuando llegue un WhatsApp, correo o llamada a recepción, aparecerá aquí para que lo revise y actúe."
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
                        ? "border-[var(--brand-primary)] bg-[color-mix(in_srgb,var(--brand-primary)_12%,transparent)]"
                        : "border-[var(--brand-border)] hover:border-[var(--brand-primary)]/40"
                    }`}
                  >
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-brand-border bg-brand-surface-elevated font-mono text-xs font-semibold text-brand-text-primary"
                      aria-hidden
                    >
                      {initials(c.requester)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-data text-[10px] uppercase tracking-wide text-[var(--brand-text-secondary)]">
                          {statusEs(c.channel)}
                        </span>
                        <StatusPulseBadge tone="fatiga">{c.tagLabel}</StatusPulseBadge>
                      </span>
                      <span className="mt-1 block text-sm font-medium text-brand-text-primary">
                        {c.subject}
                      </span>
                      <span className="mt-0.5 block font-data text-xs text-[var(--brand-text-secondary)]">
                        {c.requester} · {c.code}
                      </span>
                      <span className="mt-1 block font-mono text-[11px] tabular-nums text-brand-text-secondary">
                        {formatTs(c.createdAt)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {selectedChat ? (
            <div className="space-y-2 border-t border-[var(--brand-border)] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-text-secondary">
                Mensaje seleccionado
              </p>
              <p className="line-clamp-4 text-xs text-[var(--brand-text-secondary)]">
                {selectedChat.message}
              </p>
              <p className="text-[11px] text-brand-text-secondary">
                Acciones en recepción: enviar a Comercial (asigna al gestor y
                saca el caso de esta bandeja). La respuesta detallada del chat
                se hace en Atención al cliente.
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  variant="ghost"
                  className="w-auto border border-brand-border px-3 py-1.5 text-xs"
                  onClick={() => setSelectedChat(null)}
                >
                  Cerrar vista
                </Button>
                <Button
                  variant="ghost"
                  className="w-auto border border-brand-warning/50 px-4 py-2 text-brand-warning hover:bg-brand-warning/10"
                  onClick={() => {
                    setLeadFormError("");
                    setLeadFieldErrors({});
                    setPanel("lead");
                  }}
                >
                  Enviar a Comercial
                </Button>
              </div>
            </div>
          ) : inbox.length > 0 ? (
            <div className="border-t border-[var(--brand-border)] px-3 py-2 text-xs text-brand-text-secondary">
              Seleccione un mensaje para leerlo y enviarlo a Comercial si aplica.
            </div>
          ) : null}
        </section>

        <section
          id="visitantes"
          className="nexa-panel xl:col-span-8 flex max-h-[78vh] flex-col overflow-hidden"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--brand-border)] px-4 py-3">
            <div className="font-display text-sm font-semibold">
              Tablero de visitantes
              <span className="ml-2 font-data text-xs text-[var(--brand-text-secondary)]">
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
                  onAction={() => {
                    setVisitFormError("");
                    setVisitFieldErrors({});
                    setPanel("visit");
                  }}
                />
              </div>
            ) : (
              <NexaTable columns={["Visitante", "Clase", "Estado", "RFID", "Acciones"]}>
                {visitors.map((v) => (
                  <NexaRow key={v.id}>
                    <NexaCell>
                      <div className="flex items-center gap-2">
                        <span
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-brand-border bg-brand-surface-elevated font-data text-[10px] font-semibold text-brand-text-primary"
                          aria-hidden
                        >
                          {initials(v.name)}
                        </span>
                        <div>
                          <div className="font-medium">{v.name}</div>
                          <div className="font-data text-[11px] text-brand-text-secondary">
                            {v.document} · {v.hostName}
                          </div>
                        </div>
                      </div>
                    </NexaCell>
                    <NexaCell className="text-xs">
                      {VISIT_CLASS_LABEL[v.visitClass] || v.visitClass}
                    </NexaCell>
                    <NexaCell>
                      <StatusPulseBadge
                        tone={
                          v.boardStatus === "CHECKED_OUT"
                            ? "danger"
                            : v.boardStatus === "WAITING"
                              ? "fatiga"
                              : "active"
                        }
                      >
                        {statusEs(v.boardStatus)}
                      </StatusPulseBadge>
                    </NexaCell>
                    <NexaCell mono>{v.badgeRfid || "—"}</NexaCell>
                    <NexaCell>
                      <div className="flex flex-wrap gap-1">
                        {v.boardStatus === "WAITING" ? (
                          <Button
                            variant="ghost"
                            className="w-auto px-2 py-1 text-xs"
                            disabled={visitBusyId === v.id}
                            onClick={() =>
                              void updateVisitorStatus(v.id, "CHECKED_IN")
                            }
                          >
                            Ingresó
                          </Button>
                        ) : null}
                        {v.boardStatus !== "CHECKED_OUT" ? (
                          <Button
                            variant="ghost"
                            className="w-auto px-2 py-1 text-xs"
                            disabled={visitBusyId === v.id}
                            onClick={() =>
                              void updateVisitorStatus(v.id, "CHECKED_OUT")
                            }
                          >
                            Finalizar
                          </Button>
                        ) : null}
                      </div>
                    </NexaCell>
                  </NexaRow>
                ))}
              </NexaTable>
            )}
          </div>

          <div id="radar" className="border-t border-[var(--brand-border)] p-3">
            <div className="mb-2 flex items-center gap-1.5 font-display text-xs font-semibold uppercase tracking-wide text-[var(--brand-text-secondary)]">
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
            {radarError ? (
              <p role="alert" className="mb-2 text-xs text-brand-danger">
                {radarError}
              </p>
            ) : null}
            {radar.length === 0 ? (
              <p className="text-xs text-brand-text-secondary">Sin resultados de radar</p>
            ) : (
              <ul className="max-h-36 space-y-1 overflow-y-auto text-xs">
                {radar.map((r) => (
                  <li
                    key={r.tripId}
                    className="rounded border border-[var(--brand-border)] px-2 py-1.5"
                  >
                    <span className="font-data">{r.vehicle?.plate || "s/p"}</span>
                    {" · "}
                    {r.schoolOrRoute} · {statusEs(r.status)}
                    {r.vehicle?.lat != null && r.vehicle?.lng != null ? (
                      <span className="font-data text-[var(--brand-text-secondary)]">
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

      <BentoPanel
        id="pqrs"
        title="Bandeja PQRS"
        subtitle="Tickets creados · filtro por estado"
        className="mt-4"
      >
        <div className="mb-3 flex flex-wrap gap-2">
          {["", "OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].map((s) => (
            <button
              key={s || "all"}
              type="button"
              className={`flt-nav-item !inline-flex !w-auto px-2 py-1 text-xs ${pqrsStatus === s ? "is-active" : ""}`}
              onClick={() => setPqrsStatus(s)}
            >
              {s === ""
                ? "Todas"
                : s === "OPEN"
                  ? "Abiertas"
                  : s === "IN_PROGRESS"
                    ? "En curso"
                    : s === "RESOLVED"
                      ? "Resueltas"
                      : "Cerradas"}
            </button>
          ))}
        </div>
        {pqrsTickets.length === 0 ? (
          <EmptyState
            icon={<AlertTriangle className="h-7 w-7" />}
            title="Sin PQRS"
            description="Crea un ticket rápido o espera ingresos omnicanal."
            actionLabel="+ PQRS"
            onAction={() => setPanel("pqrs")}
          />
        ) : (
          <NexaTable columns={["Código", "Solicitante", "Estado", "Asunto"]}>
            {pqrsTickets.map((t) => (
              <NexaRow key={t.id}>
                <NexaCell mono>{t.code || t.id.slice(0, 8)}</NexaCell>
                <NexaCell>{t.requester || "—"}</NexaCell>
                <NexaCell>
                  <StatusPulseBadge
                    tone={
                      t.status === "OPEN" || t.status === "IN_PROGRESS"
                        ? "fatiga"
                        : "active"
                    }
                  >
                    {statusEs(t.status)}
                  </StatusPulseBadge>
                </NexaCell>
                <NexaCell className="text-xs text-brand-text-secondary">
                  {t.subject || t.message || "—"}
                </NexaCell>
              </NexaRow>
            ))}
          </NexaTable>
        )}
      </BentoPanel>

      <SlideOver
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
          {visitFormError ? <FormAlert message={visitFormError} /> : null}
          <div>
            <input
              className={`field h-11 min-h-[44px] font-data ${visitFieldErrors.document ? "border-[var(--brand-danger)]" : ""}`}
              placeholder="Cédula"
              value={visitForm.document}
              onChange={(e) => {
                setVisitFieldErrors((prev) =>
                  clearFieldError(prev, "document"),
                );
                setVisitForm((f) => ({ ...f, document: e.target.value }));
              }}
              onBlur={() => void onDocumentBlur()}
              required
              aria-invalid={Boolean(visitFieldErrors.document) || undefined}
            />
            <FieldHint message={visitFieldErrors.document} />
          </div>
          <div>
            <input
              className={`field h-11 min-h-[44px] ${visitFieldErrors.name ? "border-[var(--brand-danger)]" : ""}`}
              placeholder="Nombre"
              value={visitForm.name}
              onChange={(e) => {
                setVisitFieldErrors((prev) => clearFieldError(prev, "name"));
                setVisitForm((f) => ({ ...f, name: e.target.value }));
              }}
              required
              aria-invalid={Boolean(visitFieldErrors.name) || undefined}
            />
            <FieldHint message={visitFieldErrors.name} />
          </div>
          <div>
            <input
              className={`field h-11 min-h-[44px] ${visitFieldErrors.company ? "border-[var(--brand-danger)]" : ""}`}
              placeholder="Empresa"
              value={visitForm.company}
              onChange={(e) => {
                setVisitFieldErrors((prev) => clearFieldError(prev, "company"));
                setVisitForm((f) => ({ ...f, company: e.target.value }));
              }}
              aria-invalid={Boolean(visitFieldErrors.company) || undefined}
            />
            <FieldHint message={visitFieldErrors.company} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-brand-text-secondary">
              Anfitrión <span className="text-brand-danger">*</span>
            </label>
            <input
              className={`field h-11 min-h-[44px] ${visitFieldErrors.hostName ? "border-[var(--brand-danger)]" : ""}`}
              placeholder="Nombre de quien recibe al visitante"
              value={visitForm.hostName}
              onChange={(e) => {
                setVisitFieldErrors((prev) => clearFieldError(prev, "hostName"));
                setVisitForm((f) => ({ ...f, hostName: e.target.value }));
              }}
              required
              aria-invalid={Boolean(visitFieldErrors.hostName) || undefined}
              title="Persona de la empresa a la que viene a ver el visitante"
            />
            <p className="mt-1 text-xs leading-relaxed text-brand-text-secondary">
              Es la persona de la empresa que recibe al visitante (por ejemplo,
              el contacto de Comercial o RRHH). Es obligatorio para saber a quién
              avisar y registrar la visita correctamente.
            </p>
            <FieldHint message={visitFieldErrors.hostName} />
          </div>
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
          <div>
            <input
              className={`field h-11 min-h-[44px] font-data ${visitFieldErrors.badgeRfid ? "border-[var(--brand-danger)]" : ""}`}
              placeholder="Gafete RFID"
              value={visitForm.badgeRfid}
              onChange={(e) => {
                setVisitFieldErrors((prev) =>
                  clearFieldError(prev, "badgeRfid"),
                );
                setVisitForm((f) => ({ ...f, badgeRfid: e.target.value }));
              }}
              aria-invalid={Boolean(visitFieldErrors.badgeRfid) || undefined}
            />
            <FieldHint message={visitFieldErrors.badgeRfid} />
          </div>
        </form>
      </SlideOver>

      <SlideOver
        open={panel === "lead"}
        onClose={() => setPanel("none")}
        title="Cliente potencial"
        description={
          selectedChat
            ? `Mensaje ${selectedChat.code} · se enviará a Comercial como cotización en borrador`
            : "Persona o empresa que llegó interesada en un servicio. Comercial recibe una cotización en borrador."
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
          {leadFormError ? <FormAlert message={leadFormError} /> : null}
          <p className="rounded-lg border border-brand-border bg-brand-surface px-3 py-2 text-xs leading-relaxed text-brand-text-secondary">
            <strong className="text-brand-text-primary">Cliente potencial:</strong>{" "}
            alguien que aún no es cliente, pero pide cotización o información de
            servicio. Al guardar, Comercial lo ve en su embudo.
          </p>
          <div>
            <input
              className={`field h-11 min-h-[44px] ${leadFieldErrors.companyName ? "border-[var(--brand-danger)]" : ""}`}
              placeholder="Empresa"
              value={leadForm.companyName}
              onChange={(e) => {
                setLeadFieldErrors((prev) =>
                  clearFieldError(prev, "companyName"),
                );
                setLeadForm((f) => ({ ...f, companyName: e.target.value }));
              }}
              required
              aria-invalid={Boolean(leadFieldErrors.companyName) || undefined}
            />
            <FieldHint message={leadFieldErrors.companyName} />
          </div>
          <div>
            <input
              className={`field h-11 min-h-[44px] font-data ${leadFieldErrors.email ? "border-[var(--brand-danger)]" : ""}`}
              type="email"
              placeholder="Correo"
              value={leadForm.email}
              onChange={(e) => {
                setLeadFieldErrors((prev) => clearFieldError(prev, "email"));
                setLeadForm((f) => ({ ...f, email: e.target.value }));
              }}
              required
              aria-invalid={Boolean(leadFieldErrors.email) || undefined}
            />
            <FieldHint message={leadFieldErrors.email} />
          </div>
          <div>
            <input
              className={`field h-11 min-h-[44px] font-data ${leadFieldErrors.phone ? "border-[var(--brand-danger)]" : ""}`}
              placeholder="Teléfono"
              value={leadForm.phone}
              onChange={(e) => {
                setLeadFieldErrors((prev) => clearFieldError(prev, "phone"));
                setLeadForm((f) => ({ ...f, phone: e.target.value }));
              }}
              aria-invalid={Boolean(leadFieldErrors.phone) || undefined}
            />
            <FieldHint message={leadFieldErrors.phone} />
          </div>
          <input
            className="field h-11 min-h-[44px] font-data"
            type="date"
            value={leadForm.serviceDate}
            onChange={(e) =>
              setLeadForm((f) => ({ ...f, serviceDate: e.target.value }))
            }
          />
        </form>
      </SlideOver>

      <SlideOver
        open={panel === "pqrs"}
        onClose={() => setPanel("none")}
        title="Nueva PQRS"
        description={
          pqrsDefcon
            ? "Urgencia — se detectó lenguaje crítico. Escala de inmediato a QHSE."
            : "Radicación rápida hacia Torre de Control / QHSE."
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
          {pqrsFormError ? <FormAlert message={pqrsFormError} /> : null}
          <div>
            <input
              className={`field h-11 min-h-[44px] ${pqrsFieldErrors.requester ? "border-[var(--brand-danger)]" : ""}`}
              placeholder="Solicitante"
              value={pqrsForm.requester}
              onChange={(e) => {
                setPqrsFieldErrors((prev) =>
                  clearFieldError(prev, "requester"),
                );
                setPqrsForm((f) => ({ ...f, requester: e.target.value }));
              }}
              required
              aria-invalid={Boolean(pqrsFieldErrors.requester) || undefined}
            />
            <FieldHint message={pqrsFieldErrors.requester} />
          </div>
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
          <div>
            <textarea
              className={`field min-h-[80px] ${pqrsFieldErrors.message ? "border-[var(--brand-danger)]" : ""}`}
              value={pqrsForm.message}
              onChange={(e) => {
                setPqrsFieldErrors((prev) => clearFieldError(prev, "message"));
                setPqrsForm((f) => ({ ...f, message: e.target.value }));
              }}
              required
              aria-invalid={Boolean(pqrsFieldErrors.message) || undefined}
            />
            <FieldHint message={pqrsFieldErrors.message} />
          </div>
          {pqrsDefcon ? (
            <p
              role="alert"
              className="rounded-md border border-[var(--brand-danger)]/40 bg-[color-mix(in_srgb,var(--brand-danger)_12%,transparent)] px-3 py-2 text-xs font-medium text-[var(--brand-danger)]"
            >
              Urgencia detectada (accidente, abogado, peligro…). Priorice el
              escalamiento a QHSE.
            </p>
          ) : null}
        </form>
      </SlideOver>
    </div>
  );
}
