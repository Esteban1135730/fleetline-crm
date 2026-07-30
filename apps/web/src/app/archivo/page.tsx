"use client";

import { FormEvent, useEffect, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { api, API_URL } from "@/lib/api";
import { HowToBox, PageIntro } from "@/components/page-intro";

type Doc = {
  id: string;
  title: string;
  category: string;
  fileRef?: string | null;
  tags?: string | null;
  createdAt: string;
};

export default function ArchivoPage() {
  const [rows, setRows] = useState<Doc[]>([]);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("CONTRACT");
  const [tags, setTags] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  async function load() {
    setRows(await api<Doc[]>("/archivo/documents"));
  }
  useEffect(() => {
    void load().catch(console.error);
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("title", title || file.name);
        fd.append("category", category);
        if (tags) fd.append("tags", tags);
        await api("/archivo/upload", { method: "POST", body: fd });
      } else {
        await api("/archivo/documents", {
          method: "POST",
          body: JSON.stringify({ title, category, tags }),
        });
      }
      setTitle("");
      setTags("");
      setFile(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    }
  }

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <PageIntro module="archivo" title="Archivo / Data Room" />
      <HowToBox
        steps={[
          "Sube un PDF o documento real (se guarda en el servidor).",
          "También puedes indexar solo con título si aún no tienes el archivo.",
          "La columna Ref enlaza al archivo descargable.",
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
          {file ? "Subir e indexar" : "Indexar sin archivo"}
        </Button>
        {error ? (
          <p className="text-sm text-[var(--brand-signal)] md:col-span-2">
            {error}
          </p>
        ) : null}
      </form>
      <div className="fsg-panel data-shell overflow-hidden">
        <div className="flex items-center gap-3 border-b border-[var(--brand-line)] px-4 py-3">
          <span className="text-sm font-semibold">Documentos</span>
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
              <th className="px-4 py-2">Archivo</th>
              <th className="px-4 py-2">Fecha</th>
              <th className="px-4 py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows
              .filter((r) => !categoryFilter || r.category === categoryFilter)
              .map((r) => (
              <tr key={r.id} className="border-t border-[var(--brand-line)]">
                <td className="px-4 py-2.5">{r.title}</td>
                <td className="px-4 py-2.5">
                  <Badge>{r.category}</Badge>
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
                        const title = window.prompt("Título", r.title);
                        if (title === null) return;
                        const tags = window.prompt("Tags", r.tags || "");
                        if (tags === null) return;
                        await api(`/archivo/documents/${r.id}`, {
                          method: "PATCH",
                          body: JSON.stringify({
                            title: title.trim() || r.title,
                            tags: tags.trim() || undefined,
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
          </tbody>
        </table>
      </div>
    </div>
  );
}
