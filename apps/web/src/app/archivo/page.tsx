"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import {
  FolderOpen,
  Lock,
  Plus,
  RefreshCw,
  Scan,
  ScanLine,
  Search,
  ShieldCheck,
} from "lucide-react";
import { api, API_URL } from "@/lib/api";
import { PageIntro } from "@/components/page-intro";
import {
  EmptyState,
  EvidenceDropzone,
  KpiCard,
  SlideOver,
  StatusPulseBadge,
} from "@/components/audit";

type Doc = {
  id: string;
  title: string;
  category: string;
  fileRef?: string | null;
  tags?: string | null;
  contentHash?: string | null;
  byteSize?: number | null;
  createdAt: string;
  uploadedBy?: { name: string; email: string } | null;
};

type AuditRow = {
  id: string;
  action: string;
  entityId?: string | null;
  createdAt: string;
  meta?: {
    title?: string;
    contentHash?: string;
    category?: string;
  } | null;
  user?: { name: string; email: string } | null;
};

type VaultMetrics = {
  ocrPrecisionPct: number;
  habeasShreddedToday: number;
  totalDocuments: number;
  storageMb: number;
};

function shortHash(h?: string | null) {
  if (!h) return "N/A";
  return `${h.slice(0, 12)}…${h.slice(-8)}`;
}

export default function ArchivoPage() {
  const [rows, setRows] = useState<Doc[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("CONTRACT");
  const [tags, setTags] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [q, setQ] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [metrics, setMetrics] = useState<VaultMetrics | null>(null);
  const [ocrBusy, setOcrBusy] = useState<string | null>(null);

  const sealedCount = useMemo(
    () => rows.filter((r) => r.contentHash).length,
    [rows],
  );

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (categoryFilter) params.set("category", categoryFilter);
    if (q.trim()) params.set("q", q.trim());
    const qs = params.toString();
    const [docs, logs, dash] = await Promise.all([
      api<Doc[]>(`/archivo/documents${qs ? `?${qs}` : ""}`),
      api<AuditRow[]>("/archivo/audit?take=40"),
      api<{ vaultMetrics: VaultMetrics }>("/api/v1/archivo/dashboard").catch(
        () => null,
      ),
    ]);
    setRows(docs);
    setAudit(logs);
    setMetrics(dash?.vaultMetrics ?? null);
  }, [categoryFilter, q]);

  useEffect(() => {
    void load().catch(console.error);
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError("");
    setStatusMsg("");
    try {
      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("title", title || file.name);
        fd.append("category", category);
        if (tags) fd.append("tags", tags);
        const sealed = await api<Doc>("/archivo/upload", {
          method: "POST",
          body: fd,
        });
        setStatusMsg(
          sealed.contentHash
            ? `DOCUMENTO SELLADO · SELLO NOMINAL · ${shortHash(sealed.contentHash)}`
            : "DOCUMENTO INDEXADO",
        );
      } else {
        await api("/archivo/documents", {
          method: "POST",
          body: JSON.stringify({ title, category, tags }),
        });
        setStatusMsg("Índice metadatos registrado (sin sello de archivo)");
      }
      setTitle("");
      setTags("");
      setFile(null);
      setUploadOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fallo de conexión — archivo");
    }
  }

  function runSearch() {
    setQ(searchDraft);
  }

  async function runOcr(documentId: string) {
    setOcrBusy(documentId);
    setError("");
    try {
      await api("/archivo/ocr/process", {
        method: "POST",
        body: JSON.stringify({ documentId }),
      });
      setStatusMsg("OCR COGNITIVO · documento indexado y enrutado");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "OCR fallido");
    } finally {
      setOcrBusy(null);
    }
  }

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <PageIntro
        module="archivo"
        title="Sala documental · Quantum Vault"
        subtitle="Sello SHA-256 · cadena de custodia inmutable"
        action={
          <Button
            type="button"
            variant="primary"
            className="w-auto px-4 py-2"
            data-testid="archivo-open-upload"
            onClick={() => setUploadOpen(true)}
          >
            <Plus className="mr-1.5 inline h-4 w-4" aria-hidden />
            Indexar documento
          </Button>
        }
      />

      {metrics ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Documentos en bóveda"
            value={metrics.totalDocuments}
            delta={`${sealedCount} sellados SHA-256`}
            icon={<ShieldCheck className="h-5 w-5 text-[var(--accent-primary)]" aria-hidden />}
          />
          <KpiCard
            label="Precisión OCR"
            value={`${metrics.ocrPrecisionPct}%`}
            delta="Auto-indexado cognitivo"
            tone="ok"
            icon={<ScanLine className="h-5 w-5 text-indigo-400" aria-hidden />}
          />
          <KpiCard
            label="Almacenamiento"
            value={`${metrics.storageMb} MB`}
            delta="Cifrado en reposo"
            icon={<Lock className="h-5 w-5 text-[var(--brand-muted)]" aria-hidden />}
          />
          <KpiCard
            label="Habeas Data hoy"
            value={String(metrics.habeasShreddedToday)}
            delta="Destrucción por retención legal"
            tone="warn"
          />
        </div>
      ) : null}

      {statusMsg ? (
        <div className="rounded-lg border border-[var(--accent-primary)]/30 bg-[var(--accent-primary)]/10 px-4 py-2 font-data text-xs text-[var(--accent-primary)]">
          {statusMsg}
        </div>
      ) : null}
      {error ? (
        <p
          role="alert"
          data-testid="archivo-error"
          className="text-sm text-[var(--brand-signal)]"
        >
          {error}
        </p>
      ) : null}

      <div className="fsg-panel data-shell overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--brand-line)] px-4 py-3">
          <span className="text-sm font-semibold">Expediente</span>
          <input
            className="field max-w-[280px] text-sm"
            placeholder="Buscar título, tag o hash…"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") runSearch();
            }}
          />
          <Button
            type="button"
            variant="primary"
            className="w-auto px-4 py-2"
            onClick={runSearch}
          >
            <Search className="mr-1.5 inline h-4 w-4" aria-hidden />
            Buscar
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-auto border border-slate-600 px-4 py-2"
            onClick={() => void load()}
          >
            <RefreshCw className="mr-1.5 inline h-4 w-4" aria-hidden />
            Refrescar
          </Button>
          <select
            className="field ml-auto max-w-[200px] text-sm"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">Todas las categorías</option>
            <option value="CONTRACT">Contrato</option>
            <option value="INVOICE">Factura</option>
            <option value="LEGAL">Legal</option>
            <option value="HR">RRHH</option>
            <option value="OPS">Operaciones</option>
            <option value="OTHER">Otro</option>
          </select>
        </div>
        {!rows.length ? (
          <div className="p-4">
            <EmptyState
              icon={<FolderOpen className="h-7 w-7" />}
              title="Sin documentos en expediente"
              description="Selle e indexe el primer archivo en la bóveda."
              actionLabel="+ Indexar documento"
              onAction={() => setUploadOpen(true)}
            />
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="px-4 py-2">Título</th>
                <th className="px-4 py-2">Categoría</th>
                <th className="px-4 py-2">Hash SHA-256</th>
                <th className="px-4 py-2">Archivo</th>
                <th className="px-4 py-2">Fecha</th>
                <th className="px-4 py-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-[var(--brand-line)]">
                  <td className="px-4 py-2.5">
                    <div>{r.title}</div>
                    {r.tags ? (
                      <div className="text-xs text-[var(--brand-muted)]">
                        {r.tags}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge>{r.category}</Badge>
                  </td>
                  <td
                    className="px-4 py-2.5 font-data text-xs text-[var(--brand-muted)]"
                    title={r.contentHash || undefined}
                  >
                    {r.contentHash ? (
                      <span className="text-[var(--brand-primary)]">
                        {shortHash(r.contentHash)}
                      </span>
                    ) : (
                      "sin sello"
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-data text-xs">
                    {r.fileRef ? (
                      <a
                        className="text-[var(--brand-primary)] underline"
                        href={
                          r.fileRef.startsWith("http")
                            ? r.fileRef
                            : `${API_URL}${r.fileRef}`
                        }
                        target="_blank"
                        rel="noreferrer"
                      >
                        Abrir
                      </a>
                    ) : (
                      "N/A"
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-data text-xs">
                    {new Date(r.createdAt).toLocaleDateString("es-CO")}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {!r.contentHash ? (
                        <Button
                          variant="ghost"
                          className="w-auto px-2 py-1 text-[10px]"
                          loading={ocrBusy === r.id}
                          onClick={() => void runOcr(r.id)}
                        >
                          <ScanLine className="mr-1 inline h-3 w-3" aria-hidden />
                          OCR
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        className="w-auto px-2 py-1"
                        onClick={async () => {
                          const nextTitle = window.prompt("Título", r.title);
                          if (nextTitle === null) return;
                          const nextTags = window.prompt("Tags", r.tags || "");
                          if (nextTags === null) return;
                          await api(`/archivo/documents/${r.id}`, {
                            method: "PATCH",
                            body: JSON.stringify({
                              title: nextTitle.trim() || r.title,
                              tags: nextTags.trim() || undefined,
                            }),
                          });
                          await load();
                        }}
                      >
                        Editar
                      </Button>
                      <Button
                        variant="ghost"
                        className="w-auto px-2 py-1"
                        onClick={async () => {
                          if (!confirm(`¿Eliminar "${r.title}"?`)) return;
                          await api(`/archivo/documents/${r.id}/delete`, {
                            method: "POST",
                          });
                          await load();
                        }}
                      >
                        Eliminar
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="fsg-panel data-shell overflow-hidden">
        <div className="border-b border-[var(--brand-line)] px-4 py-3">
          <span className="text-sm font-semibold">Auditoría de bóveda</span>
          <p className="text-xs text-[var(--brand-muted)]">
            Eventos inmutables · ARCHIVE_VAULT / INDEX / DELETE
          </p>
        </div>
        {!audit.length ? (
          <div className="p-4">
            <EmptyState
              icon={<Scan className="h-7 w-7" />}
              title="Sin eventos de auditoría"
              description="Los sellados, índices y borrados aparecen aquí."
            />
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="px-4 py-2">Acción</th>
                <th className="px-4 py-2">Documento</th>
                <th className="px-4 py-2">Hash</th>
                <th className="px-4 py-2">Operador</th>
                <th className="px-4 py-2">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((a) => (
                <tr key={a.id} className="border-t border-[var(--brand-line)]">
                  <td className="px-4 py-2.5">
                    <StatusPulseBadge
                      tone={
                        a.action === "ARCHIVE_VAULT"
                          ? "active"
                          : a.action === "ARCHIVE_DELETE"
                            ? "danger"
                            : "neutral"
                      }
                      pulse={a.action === "ARCHIVE_DELETE"}
                    >
                      {a.action}
                    </StatusPulseBadge>
                  </td>
                  <td className="px-4 py-2.5">
                    {a.meta?.title || a.entityId || "N/A"}
                  </td>
                  <td className="px-4 py-2.5 font-data text-xs">
                    {shortHash(a.meta?.contentHash)}
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    {a.user?.name || "sistema"}
                  </td>
                  <td className="px-4 py-2.5 font-data text-xs">
                    {new Date(a.createdAt).toLocaleString("es-CO")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <SlideOver
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title="Indexar documento"
        description="Sello SHA-256 en bóveda · enrutamiento OCR automático"
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              className="w-auto px-4 py-2"
              onClick={() => setUploadOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="archivo-upload-form"
              variant="primary"
              className="w-auto px-4 py-2"
              data-testid="archivo-submit"
            >
              {file ? "Sellar e indexar" : "Indexar sin archivo"}
            </Button>
          </>
        }
      >
        <form
          id="archivo-upload-form"
          onSubmit={onCreate}
          data-testid="archivo-upload-form"
          className="space-y-4"
        >
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Título
            </span>
            <input
              className="field w-full"
              data-testid="archivo-title"
              placeholder="Título"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required={!file}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Categoría
            </span>
            <select
              className="field w-full"
              data-testid="archivo-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="CONTRACT">Contrato</option>
              <option value="INVOICE">Factura</option>
              <option value="LEGAL">Legal</option>
              <option value="HR">RRHH</option>
              <option value="OPS">Operaciones</option>
              <option value="OTHER">Otro</option>
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Tags
            </span>
            <input
              className="field w-full"
              data-testid="archivo-tags"
              placeholder="Tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
          </label>
          <div className="space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Archivo
            </span>
            <EvidenceDropzone
              onFiles={(files) => setFile(files[0] || null)}
              acceptLabel="PDF o imágenes"
            />
            <input
              className="field w-full text-sm"
              data-testid="archivo-file"
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </div>
        </form>
      </SlideOver>
    </div>
  );
}
