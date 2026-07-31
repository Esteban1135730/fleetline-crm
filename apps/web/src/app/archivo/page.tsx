"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { api, API_URL } from "@/lib/api";
import { HowToBox, PageIntro } from "@/components/page-intro";

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

function shortHash(h?: string | null) {
  if (!h) return "—";
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

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (categoryFilter) params.set("category", categoryFilter);
    if (q.trim()) params.set("q", q.trim());
    const qs = params.toString();
    const [docs, logs] = await Promise.all([
      api<Doc[]>(`/archivo/documents${qs ? `?${qs}` : ""}`),
      api<AuditRow[]>("/archivo/audit?take=40"),
    ]);
    setRows(docs);
    setAudit(logs);
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
            ? `DOCUMENTO SELLADO · HASH NOMINAL · ${shortHash(sealed.contentHash)}`
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
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fallo de uplink — archivo");
    }
  }

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <PageIntro module="archivo" title="Archivo / Data Room" />
      <HowToBox
        steps={[
          "Sube un documento: el sistema sella SHA-256 en bóveda local.",
          "Filtra por categoría o busca título, tag o hash.",
          "El log de auditoría registra sellado, índice y borrado.",
        ]}
      />

      <form
        onSubmit={onCreate}
        className="fsg-panel grid grid-cols-1 gap-3 p-4 md:grid-cols-2"
      >
        <input
          className="field"
          placeholder="Título"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required={!file}
        />
        <select
          className="field"
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
        <input
          className="field"
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
        <input
          className="field"
          placeholder="Tags"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />
        <Button type="submit" variant="primary" className="md:col-span-2">
          {file ? "Sellar e indexar" : "Indexar sin archivo"}
        </Button>
        {statusMsg ? (
          <p className="font-data text-xs text-[var(--brand-primary)] md:col-span-2">
            {statusMsg}
          </p>
        ) : null}
        {error ? (
          <p className="text-sm text-[var(--brand-signal)] md:col-span-2">
            {error}
          </p>
        ) : null}
      </form>

      <div className="fsg-panel data-shell overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--brand-line)] px-4 py-3">
          <span className="text-sm font-semibold">Expediente</span>
          <input
            className="field max-w-[280px] text-sm"
            placeholder="Buscar título, tag o hash…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
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
                    "—"
                  )}
                </td>
                <td className="px-4 py-2.5 font-data text-xs">
                  {new Date(r.createdAt).toLocaleDateString("es-CO")}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    <Button
                      variant="ghost"
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
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-sm text-[var(--brand-muted)]"
                >
                  Sin documentos en expediente — uplink vacío
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="fsg-panel data-shell overflow-hidden">
        <div className="border-b border-[var(--brand-line)] px-4 py-3">
          <span className="text-sm font-semibold">Auditoría de bóveda</span>
          <p className="text-xs text-[var(--brand-muted)]">
            Eventos inmutables · ARCHIVE_VAULT / INDEX / DELETE
          </p>
        </div>
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
                  <Badge
                    tone={
                      a.action === "ARCHIVE_VAULT"
                        ? "success"
                        : a.action === "ARCHIVE_DELETE"
                          ? "danger"
                          : "info"
                    }
                  >
                    {a.action}
                  </Badge>
                </td>
                <td className="px-4 py-2.5">{a.meta?.title || a.entityId || "—"}</td>
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
            {audit.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-6 text-center text-sm text-[var(--brand-muted)]"
                >
                  Sin eventos de auditoría
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
