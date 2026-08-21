"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import {
  Box,
  CheckCircle2,
  Cpu,
  Database,
  FileArchive,
  Lock,
  ScanLine,
  Search,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserX,
} from "lucide-react";
import { api } from "@/lib/api";
import { PageIntro } from "@/components/page-intro";
import { EmptyState, KpiCard, SlideOver, StatusPulseBadge } from "@/components/audit";

type SearchHit = {
  kind?: "document" | "vehicle" | "driver" | "employee" | "customer";
  id: string;
  title: string;
  plate: string | null;
  documentNumber: string | null;
  digitalPdf: string | null;
  locationLabel: string | null;
  custodyStatus: string;
  pendingDigitization: boolean;
  docType: string;
};

type VaultMetrics = {
  ocrPrecisionPct: number;
  habeasShreddedToday: number;
  operationalAssets: number;
  liquidationBlocks: number;
  totalDocuments: number;
  storageMb: number;
};

type IngestionItem = {
  id: string;
  title: string;
  docType: string;
  status: "processing" | "pending" | "validated";
  confidence?: number;
  contentHash?: string | null;
  routedTo?: string;
  updatedAt: string;
};

type AssetAlert = {
  employeeId: string;
  name: string;
  role: string;
  pendingAssets: string[];
  liquidationBlocked: boolean;
  detectedAt: string;
};

type AccessLogRow = {
  id: string;
  action: string;
  title?: string;
  contentHash?: string;
  userName: string;
  createdAt: string;
};

type Dashboard = {
  vaultMetrics: VaultMetrics;
  ingestionQueue: IngestionItem[];
  assetAlerts: AssetAlert[];
  accessLog: AccessLogRow[];
  pendingDigitization: Array<{
    id: string;
    title: string;
    plate: string | null;
    documentNumber: string | null;
    locationLabel: string | null;
    updatedAt: string;
  }>;
  loansOnHand: Array<{
    loanId: string;
    documentId: string;
    title: string;
    borrowerName: string | null;
    checkedOutAt: string;
    dueAt: string | null;
    daysOut: number;
    overdue: boolean;
    locationLabel: string | null;
  }>;
  inventory: Array<{
    id: string;
    sku: string;
    name: string;
    unit: string;
    quantity: number;
    minStock: number;
    critical: boolean;
  }>;
  overdueLoanCount: number;
};

const KIND_LABEL: Record<NonNullable<SearchHit["kind"]>, string> = {
  vehicle: "Unidad",
  driver: "Conductor",
  employee: "Personal",
  customer: "Cliente",
  document: "Expediente",
};

function hitKind(h: SearchHit): NonNullable<SearchHit["kind"]> {
  return h.kind || "document";
}

function shortHash(h?: string | null) {
  if (!h) return "—";
  return `${h.slice(0, 8)}…`;
}

function ingestionTone(status: IngestionItem["status"]) {
  if (status === "validated") return "active" as const;
  if (status === "processing") return "fatiga" as const;
  return "neutral" as const;
}

function ingestionLabel(status: IngestionItem["status"]) {
  if (status === "validated") return "Indexado";
  if (status === "processing") return "Procesando OCR";
  return "Pendiente";
}

export default function ArchivoDashboardPage() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [open, setOpen] = useState(false);
  const [opsPanel, setOpsPanel] = useState<"none" | "despacho" | "prestamo">(
    "none",
  );
  const [opsBusy, setOpsBusy] = useState(false);
  const [opsMsg, setOpsMsg] = useState("");
  const [despachoForm, setDespachoForm] = useState({
    itemId: "",
    quantity: "1",
    ticketRef: "",
    notes: "",
  });
  const [prestamoForm, setPrestamoForm] = useState({
    documentId: "",
    borrowerUserId: "",
    purpose: "",
    dueDays: "7",
  });
  const boxRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadDash = useCallback(async () => {
    setError("");
    try {
      const d = await api<Dashboard>("/api/v1/archivo/dashboard");
      setDash(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Conexión de archivo fallida");
    }
  }, []);

  useEffect(() => {
    void loadDash();
  }, [loadDash]);

  useEffect(() => {
    function onDoc(ev: MouseEvent) {
      if (!boxRef.current?.contains(ev.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const runSearch = useCallback(async (term: string) => {
    const needle = term.trim();
    if (needle.length < 2) {
      setHits([]);
      setSearched(false);
      setOpen(false);
      return;
    }
    setSearching(true);
    setError("");
    try {
      const res = await api<SearchHit[]>(
        `/api/v1/archivo/search?q=${encodeURIComponent(needle)}`,
      );
      const list = Array.isArray(res) ? res : [];
      setHits(list);
      setSearched(true);
      setOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Búsqueda fallida");
      setHits([]);
      setSearched(true);
      setOpen(true);
    } finally {
      setSearching(false);
    }
  }, []);

  function onQueryChange(value: string) {
    setQ(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runSearch(value);
    }, 220);
  }

  function onSearch(e?: FormEvent) {
    e?.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    void runSearch(q);
  }

  function pickHit(h: SearchHit) {
    const label = h.plate || h.documentNumber || h.title;
    setQ(label);
    setHits([h]);
    setSearched(true);
    setOpen(false);
  }

  const metrics = dash?.vaultMetrics;

  async function submitDespacho(e: FormEvent) {
    e.preventDefault();
    if (!despachoForm.itemId) return;
    setOpsBusy(true);
    setOpsMsg("");
    setError("");
    try {
      await api("/api/v1/archivo/suministros/despachar", {
        method: "POST",
        body: JSON.stringify({
          itemId: despachoForm.itemId,
          quantity: Number(despachoForm.quantity) || 1,
          ticketRef: despachoForm.ticketRef || undefined,
          notes: despachoForm.notes || undefined,
        }),
      });
      setOpsMsg("Despacho de papelería registrado");
      setOpsPanel("none");
      setDespachoForm({ itemId: "", quantity: "1", ticketRef: "", notes: "" });
      await loadDash();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Despacho fallido");
    } finally {
      setOpsBusy(false);
    }
  }

  async function submitPrestamo(e: FormEvent) {
    e.preventDefault();
    if (!prestamoForm.documentId || !prestamoForm.borrowerUserId) return;
    setOpsBusy(true);
    setOpsMsg("");
    setError("");
    try {
      await api("/api/v1/archivo/prestamos/check-out", {
        method: "POST",
        body: JSON.stringify({
          documentId: prestamoForm.documentId,
          borrowerUserId: prestamoForm.borrowerUserId,
          purpose: prestamoForm.purpose || undefined,
          dueDays: Number(prestamoForm.dueDays) || 7,
        }),
      });
      setOpsMsg("Préstamo de carpeta registrado");
      setOpsPanel("none");
      setPrestamoForm({
        documentId: "",
        borrowerUserId: "",
        purpose: "",
        dueDays: "7",
      });
      await loadDash();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Préstamo fallido");
    } finally {
      setOpsBusy(false);
    }
  }

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <PageIntro
        module="archivo"
        title="Quantum Vault & Assets"
        subtitle="OCR cognitivo activo · cero-knowledge encryption"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              className="w-auto px-3 py-2"
              onClick={() => setOpsPanel("despacho")}
            >
              Despachar papelería
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="w-auto px-3 py-2"
              onClick={() => setOpsPanel("prestamo")}
            >
              Préstamo carpeta
            </Button>
            {metrics ? (
              <div className="rounded-lg border border-[var(--brand-line)] bg-[var(--brand-surface)] px-3 py-2 text-right">
                <p className="text-[10px] uppercase tracking-wider text-[var(--brand-muted)]">
                  Almacenamiento global
                </p>
                <p className="font-data text-sm font-bold text-[var(--brand-primary)]">
                  {metrics.storageMb} MB · {metrics.totalDocuments.toLocaleString("es-CO")} docs
                </p>
              </div>
            ) : null}
            <Button type="button" variant="primary" className="w-auto">
              <ScanLine className="mr-1.5 inline h-4 w-4" aria-hidden />
              Ingesta masiva (AI)
            </Button>
          </div>
        }
      />

      {error ? (
        <p role="alert" className="text-sm text-[var(--brand-signal)]">
          {error}
        </p>
      ) : null}

      {metrics ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Precisión OCR (auto-indexado)"
            value={`${metrics.ocrPrecisionPct}%`}
            delta="Cero intervención humana"
            tone="ok"
            icon={<Cpu className="h-5 w-5 text-indigo-400" aria-hidden />}
          />
          <KpiCard
            label="Habeas Data (auto-shred)"
            value={String(metrics.habeasShreddedToday)}
            delta="Docs destruidos hoy (fin retención)"
            tone="neutral"
            icon={<Trash2 className="h-5 w-5 text-[var(--brand-muted)]" aria-hidden />}
          />
          <KpiCard
            label="Activos operativos"
            value={metrics.operationalAssets.toLocaleString("es-CO")}
            delta="Tablets, dotación, papelería"
            tone="ok"
            icon={<Smartphone className="h-5 w-5 text-[var(--accent-primary)]" aria-hidden />}
          />
          <KpiCard
            label="Bloqueos de liquidación"
            value={String(metrics.liquidationBlocks)}
            delta="Activos pendientes por devolver"
            tone={metrics.liquidationBlocks > 0 ? "danger" : "ok"}
            icon={<UserX className="h-5 w-5 text-[var(--accent-alert)]" aria-hidden />}
          />
        </div>
      ) : null}

      <form onSubmit={onSearch} className="relative z-10">
        <div ref={boxRef} className="relative">
          <label className="sr-only" htmlFor="archivo-search">
            Búsqueda profunda
          </label>
          <div className="fsg-panel flex items-center gap-2 p-2 shadow-lg">
            <Search className="ml-2 h-5 w-5 shrink-0 text-[var(--brand-muted)]" aria-hidden />
            <input
              id="archivo-search"
              type="search"
              data-field="skip"
              autoComplete="off"
              data-testid="archivo-universal-search"
              className="field flex-1 border-0 bg-transparent text-sm shadow-none focus:ring-0"
              placeholder="Búsqueda profunda: contrato, placa, cédula, serial tablet…"
              value={q}
              onChange={(e) => onQueryChange(e.target.value)}
              onFocus={() => {
                if (hits.length || searched) setOpen(true);
              }}
            />
            <StatusPulseBadge tone="active" pulse={false}>
              NLP Search
            </StatusPulseBadge>
          </div>
          {open && q.trim().length >= 2 ? (
            <ul
              className="absolute z-40 mt-1 max-h-80 w-full overflow-auto rounded-xl border border-[var(--brand-line)] bg-[var(--brand-surface)] shadow-xl"
              role="listbox"
            >
              {searching ? (
                <li className="px-4 py-3 text-sm text-[var(--brand-muted)]">
                  Buscando en flota, personal y bóveda…
                </li>
              ) : null}
              {!searching && searched && hits.length === 0 ? (
                <li className="px-4 py-3 text-sm text-[var(--brand-muted)]">
                  Sin coincidencias para «{q.trim()}».
                </li>
              ) : null}
              {!searching
                ? hits.map((h) => (
                    <li key={`${hitKind(h)}-${h.id}`}>
                      <button
                        type="button"
                        role="option"
                        className="flex w-full items-start justify-between gap-3 px-4 py-2.5 text-left hover:bg-[var(--brand-primary)]/10"
                        onClick={() => pickHit(h)}
                      >
                        <span>
                          <span className="block text-sm font-medium">{h.title}</span>
                          <span className="mt-0.5 block font-data text-[11px] text-[var(--brand-muted)]">
                            {KIND_LABEL[hitKind(h)]} ·{" "}
                            {h.plate || h.documentNumber || h.docType}
                            {h.locationLabel ? ` · ${h.locationLabel}` : ""}
                          </span>
                        </span>
                        {h.digitalPdf ? (
                          <Badge tone="emerald">PDF</Badge>
                        ) : hitKind(h) === "document" ? (
                          <Badge tone="amber">Sin PDF</Badge>
                        ) : null}
                      </button>
                    </li>
                  ))
                : null}
            </ul>
          ) : null}
        </div>
      </form>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <section className="fsg-panel flex flex-col overflow-hidden lg:col-span-7">
          <header className="flex items-center justify-between border-b border-[var(--brand-line)] px-4 py-3">
            <div className="flex items-center gap-2">
              <ScanLine className="h-4 w-4 text-indigo-400" aria-hidden />
              <h2 className="text-sm font-semibold uppercase tracking-wider">
                Cognitive Ingestion Pipeline
              </h2>
            </div>
            <StatusPulseBadge tone="fatiga" pulse>
              Procesando
            </StatusPulseBadge>
          </header>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {(dash?.ingestionQueue ?? []).length === 0 ? (
              <EmptyState
                icon={<Database className="h-7 w-7" aria-hidden />}
                title="Cola vacía"
                description="Suba documentos para activar el enrutador OCR."
              />
            ) : (
              dash!.ingestionQueue.map((item) => (
                <article
                  key={item.id}
                  className={`rounded-lg border p-4 ${
                    item.status === "validated"
                      ? "border-[var(--accent-primary)]/30 bg-[var(--accent-primary)]/5 opacity-80"
                      : "border-[var(--brand-line)]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      {item.status === "validated" ? (
                        <CheckCircle2 className="mt-0.5 h-5 w-5 text-[var(--accent-primary)]" aria-hidden />
                      ) : (
                        <ScanLine className="mt-0.5 h-5 w-5 animate-pulse text-indigo-400" aria-hidden />
                      )}
                      <div>
                        <h3 className="text-sm font-semibold">{item.title}</h3>
                        <p className="mt-0.5 text-[10px] font-mono text-[var(--brand-muted)]">
                          {item.docType}
                          {item.routedTo ? ` → ${item.routedTo}` : ""}
                        </p>
                        {item.status === "processing" ? (
                          <p className="mt-2 text-[10px] text-indigo-400">
                            Clasificando y enrutando…
                          </p>
                        ) : item.status === "validated" ? (
                          <p className="mt-2 text-[10px] font-semibold text-[var(--accent-primary)]">
                            Indexado
                            {item.confidence
                              ? ` · confianza ${Math.round(item.confidence * 100)}%`
                              : ""}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="text-right">
                      <StatusPulseBadge tone={ingestionTone(item.status)} pulse={item.status === "processing"}>
                        {ingestionLabel(item.status)}
                      </StatusPulseBadge>
                      {item.contentHash ? (
                        <p className="mt-1 flex items-center justify-end gap-1 font-data text-[10px] text-[var(--brand-muted)]">
                          <Lock className="h-3 w-3" aria-hidden />
                          {shortHash(item.contentHash)}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="flex flex-col gap-4 lg:col-span-5">
          <div className="fsg-panel flex flex-1 flex-col overflow-hidden">
            <header className="flex items-center justify-between border-b border-[var(--brand-line)] px-4 py-3">
              <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
                <Box className="h-4 w-4 text-[var(--accent-primary)]" aria-hidden />
                Asset Control (HR Sync)
              </h2>
              {(dash?.assetAlerts.length ?? 0) > 0 ? (
                <StatusPulseBadge tone="danger" pulse>
                  {dash!.assetAlerts.length} alertas
                </StatusPulseBadge>
              ) : null}
            </header>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {(dash?.assetAlerts ?? []).length === 0 ? (
                <EmptyState
                  icon={<ShieldCheck className="h-7 w-7" aria-hidden />}
                  title="Sin bloqueos activos"
                  description="No hay activos pendientes vinculados a bajas de personal."
                />
              ) : (
                dash!.assetAlerts.map((a) => (
                  <article
                    key={a.employeeId}
                    className="rounded-lg border border-[var(--accent-alert)]/40 bg-[var(--accent-alert)]/5 p-4"
                  >
                    <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[var(--accent-alert)]">
                      <UserX className="h-3 w-3" aria-hidden />
                      Baja de personal detectada
                    </p>
                    <h3 className="mt-1 text-sm font-semibold">
                      {a.name}{" "}
                      <span className="text-xs font-normal text-[var(--brand-muted)]">
                        ({a.role})
                      </span>
                    </h3>
                    <ul className="mt-2 space-y-1 rounded-md border border-[var(--accent-alert)]/20 bg-[var(--brand-surface)]/50 p-2 font-mono text-[11px] text-[var(--accent-alert)]">
                      {a.pendingAssets.map((asset) => (
                        <li key={asset}>· {asset}</li>
                      ))}
                    </ul>
                    {a.liquidationBlocked ? (
                      <p className="mt-2 flex items-center gap-1 text-[9px] font-bold text-[var(--accent-alert)]">
                        <Lock className="h-3 w-3" aria-hidden />
                        Pago de liquidación bloqueado en Tesorería
                      </p>
                    ) : null}
                  </article>
                ))
              )}
            </div>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="fsg-panel p-4 lg:col-span-1">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--brand-muted)]">
            Pendientes de digitalizar
          </h2>
          <div className="space-y-2">
            {(dash?.pendingDigitization ?? []).slice(0, 6).map((p) => (
              <article
                key={p.id}
                className="rounded-md border border-[var(--brand-line)] px-3 py-2"
              >
                <p className="text-sm">{p.title}</p>
                <p className="font-data text-[10px] text-[var(--brand-muted)]">
                  {p.plate || p.documentNumber || "—"} · {p.locationLabel || "Sin ubicación"}
                </p>
              </article>
            ))}
            {!dash?.pendingDigitization?.length ? (
              <p className="text-xs text-[var(--brand-muted)]">Bandeja vacía.</p>
            ) : null}
          </div>
        </section>

        <section className="fsg-panel p-4 lg:col-span-1">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--brand-muted)]">
            Carpetas en préstamo
            {(dash?.overdueLoanCount ?? 0) > 0 ? (
              <span className="ml-2 text-[var(--accent-alert)]">
                ({dash!.overdueLoanCount} vencidas)
              </span>
            ) : null}
          </h2>
          <div className="space-y-2">
            {(dash?.loansOnHand ?? []).slice(0, 6).map((l) => (
              <article
                key={l.loanId}
                className="rounded-md border border-[var(--brand-line)] px-3 py-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm">{l.title}</p>
                  <Badge tone={l.overdue ? "rose" : "amber"}>{l.daysOut}d</Badge>
                </div>
                <p className="text-xs text-[var(--brand-muted)]">
                  {l.borrowerName || "Solicitante"}
                </p>
              </article>
            ))}
            {!dash?.loansOnHand?.length ? (
              <EmptyState
                icon={<Lock className="h-6 w-6" aria-hidden />}
                title="Sin préstamos activos"
                description="Registre el check-out de una carpeta física."
                actionLabel="Préstamo carpeta"
                onAction={() => setOpsPanel("prestamo")}
              />
            ) : null}
          </div>
        </section>

        <section className="fsg-panel p-4 lg:col-span-1">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--brand-muted)]">
            Inventario administrativo
          </h2>
          <div className="space-y-2">
            {(dash?.inventory ?? []).slice(0, 6).map((i) => (
              <article
                key={i.id}
                className={`rounded-md border px-3 py-2 ${
                  i.critical ? "border-[var(--accent-alert)]/40 bg-[var(--accent-alert)]/5" : "border-[var(--brand-line)]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm">{i.name}</p>
                  {i.critical ? <Badge tone="rose">Crítico</Badge> : null}
                </div>
                <p className="font-data text-xs text-[var(--brand-muted)]">
                  {i.sku} · {i.quantity}/{i.minStock} {i.unit}
                </p>
              </article>
            ))}
            {!dash?.inventory?.length ? (
              <EmptyState
                icon={<Box className="h-6 w-6" aria-hidden />}
                title="Sin ítems de papelería"
                description="Cargue el inventario administrativo para despachar."
                actionLabel="Despachar papelería"
                onAction={() => setOpsPanel("despacho")}
              />
            ) : null}
          </div>
        </section>
      </div>

      <section className="fsg-panel overflow-hidden">
        <header className="border-b border-[var(--brand-line)] px-4 py-3">
          <h2 className="text-sm font-semibold">Cadena de custodia inmutable</h2>
          <p className="text-xs text-[var(--brand-muted)]">
            Descargas, sellados e indexaciones · trazabilidad legal
          </p>
        </header>
        {!dash?.accessLog?.length ? (
          <div className="p-4">
            <EmptyState
              icon={<FileArchive className="h-7 w-7" aria-hidden />}
              title="Sin eventos"
              description="Los accesos a la bóveda aparecerán aquí."
            />
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-[var(--brand-muted)]">
                <th className="px-4 py-2">Acción</th>
                <th className="px-4 py-2">Documento</th>
                <th className="px-4 py-2">Hash</th>
                <th className="px-4 py-2">Operador</th>
                <th className="px-4 py-2">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {dash.accessLog.map((a) => (
                <tr key={a.id} className="border-t border-[var(--brand-line)]">
                  <td className="px-4 py-2">
                    <StatusPulseBadge
                      tone={
                        a.action.includes("DELETE")
                          ? "danger"
                          : a.action.includes("OCR") || a.action.includes("UPLOAD")
                            ? "active"
                            : "neutral"
                      }
                      pulse={false}
                    >
                      {a.action}
                    </StatusPulseBadge>
                  </td>
                  <td className="px-4 py-2 text-xs">{a.title || "—"}</td>
                  <td className="px-4 py-2 font-data text-xs">{shortHash(a.contentHash)}</td>
                  <td className="px-4 py-2 text-xs">{a.userName}</td>
                  <td className="px-4 py-2 font-data text-xs">
                    {new Date(a.createdAt).toLocaleString("es-CO")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {opsMsg ? (
        <p className="text-sm text-[var(--accent-primary)]">{opsMsg}</p>
      ) : null}

      <SlideOver
        open={opsPanel === "despacho"}
        onClose={() => setOpsPanel("none")}
        title="Despachar papelería"
        description="Salida de stock con ticket y hard lock si cantidad inválida."
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              className="w-auto px-4 py-2"
              onClick={() => setOpsPanel("none")}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="archivo-despacho-form"
              variant="primary"
              className="w-auto px-4 py-2"
              loading={opsBusy}
            >
              Despachar
            </Button>
          </>
        }
      >
        <form
          id="archivo-despacho-form"
          onSubmit={(e) => void submitDespacho(e)}
          className="space-y-3"
        >
          <label className="flex flex-col gap-1 text-xs uppercase text-[var(--text-secondary)]">
            Ítem
            <select
              className="field"
              value={despachoForm.itemId}
              onChange={(e) =>
                setDespachoForm((f) => ({ ...f, itemId: e.target.value }))
              }
              required
            >
              <option value="">Seleccione…</option>
              {(dash?.inventory ?? []).map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} · {i.sku} ({i.quantity})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase text-[var(--text-secondary)]">
            Cantidad
            <input
              className="field font-mono"
              type="number"
              min={1}
              value={despachoForm.quantity}
              onChange={(e) =>
                setDespachoForm((f) => ({ ...f, quantity: e.target.value }))
              }
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase text-[var(--text-secondary)]">
            Ticket / referencia
            <input
              className="field"
              value={despachoForm.ticketRef}
              onChange={(e) =>
                setDespachoForm((f) => ({ ...f, ticketRef: e.target.value }))
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase text-[var(--text-secondary)]">
            Notas
            <textarea
              className="field min-h-[72px]"
              value={despachoForm.notes}
              onChange={(e) =>
                setDespachoForm((f) => ({ ...f, notes: e.target.value }))
              }
            />
          </label>
        </form>
      </SlideOver>

      <SlideOver
        open={opsPanel === "prestamo"}
        onClose={() => setOpsPanel("none")}
        title="Préstamo de carpeta"
        description="Hard lock si el expediente ya está en custodia de otro usuario."
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              className="w-auto px-4 py-2"
              onClick={() => setOpsPanel("none")}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="archivo-prestamo-form"
              variant="primary"
              className="w-auto px-4 py-2"
              loading={opsBusy}
            >
              Registrar préstamo
            </Button>
          </>
        }
      >
        <form
          id="archivo-prestamo-form"
          onSubmit={(e) => void submitPrestamo(e)}
          className="space-y-3"
        >
          <label className="flex flex-col gap-1 text-xs uppercase text-[var(--text-secondary)]">
            ID documento
            <input
              className="field font-mono"
              value={prestamoForm.documentId}
              onChange={(e) =>
                setPrestamoForm((f) => ({ ...f, documentId: e.target.value }))
              }
              placeholder="cuid del expediente"
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase text-[var(--text-secondary)]">
            ID usuario solicitante
            <input
              className="field font-mono"
              value={prestamoForm.borrowerUserId}
              onChange={(e) =>
                setPrestamoForm((f) => ({
                  ...f,
                  borrowerUserId: e.target.value,
                }))
              }
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase text-[var(--text-secondary)]">
            Días de préstamo
            <input
              className="field font-mono"
              type="number"
              min={1}
              max={90}
              value={prestamoForm.dueDays}
              onChange={(e) =>
                setPrestamoForm((f) => ({ ...f, dueDays: e.target.value }))
              }
            />
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase text-[var(--text-secondary)]">
            Propósito
            <textarea
              className="field min-h-[72px]"
              value={prestamoForm.purpose}
              onChange={(e) =>
                setPrestamoForm((f) => ({ ...f, purpose: e.target.value }))
              }
            />
          </label>
        </form>
      </SlideOver>
    </div>
  );
}
