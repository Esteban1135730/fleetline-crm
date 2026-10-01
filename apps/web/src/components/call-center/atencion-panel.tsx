"use client";

import { FormEvent, useEffect, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { Headphones } from "lucide-react";
import { api } from "@/lib/api";
import { statusEs } from "@fsg/shared";
import { EmptyState, SkeletonRows } from "@/components/audit";

type Ticket = {
  id: string;
  code: string;
  subject: string;
  channel: string;
  status: string;
  priority: string;
  requester: string;
  message: string;
  assignee?: { id: string; name: string } | null;
};

type OrgUser = { id: string; name: string; email: string };

const EMPTY_FORM = {
  subject: "",
  requester: "",
  message: "",
  channel: "WHATSAPP",
};

export default function AtencionPanel() {
  const [rows, setRows] = useState<Ticket[]>([]);
  const [agents, setAgents] = useState<OrgUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);

  async function load() {
    const [tickets, users] = await Promise.all([
      api<Ticket[]>("/atencion/tickets"),
      api<OrgUser[]>("/auth/users").catch(() => [] as OrgUser[]),
    ]);
    setRows(tickets);
    setAgents(users);
  }

  useEffect(() => {
    void load()
      .catch((e) =>
        setError(e instanceof Error ? e.message : "No se pudieron cargar los tickets"),
      )
      .finally(() => setLoading(false));
  }, []);

  async function run(action: () => Promise<unknown>, fallback: string) {
    setBusy(true);
    setError("");
    try {
      await action();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : fallback);
    } finally {
      setBusy(false);
    }
  }

  function patchTicket(id: string, body: Record<string, unknown>) {
    return run(
      () =>
        api(`/atencion/tickets/${id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        }),
      "No se pudo actualizar el ticket",
    );
  }

  function setStatus(id: string, status: string) {
    return run(
      () =>
        api(`/atencion/tickets/${id}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status }),
        }),
      "No se pudo cambiar el estado",
    );
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      await api("/atencion/tickets", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setForm(EMPTY_FORM);
    }, "No se pudo crear el ticket");
  }

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <div>
        <h2 className="page-title text-3xl md:text-4xl">Atención omnicanal</h2>
        <p className="page-sub">Tickets WhatsApp, correo, teléfono y web</p>
      </div>

      <form
        onSubmit={onCreate}
        className="nexa-panel grid grid-cols-1 gap-3 p-4 md:grid-cols-2"
      >
        <input
          className="field"
          placeholder="Asunto"
          value={form.subject}
          onChange={(e) => setForm({ ...form, subject: e.target.value })}
          required
        />
        <input
          className="field"
          placeholder="Solicitante"
          value={form.requester}
          onChange={(e) => setForm({ ...form, requester: e.target.value })}
          required
        />
        <select
          className="field"
          value={form.channel}
          onChange={(e) => setForm({ ...form, channel: e.target.value })}
        >
          <option value="WHATSAPP">WhatsApp</option>
          <option value="EMAIL">Correo</option>
          <option value="PHONE">Teléfono</option>
          <option value="WEB">Web</option>
        </select>
        <input
          className="field"
          placeholder="Mensaje"
          value={form.message}
          onChange={(e) => setForm({ ...form, message: e.target.value })}
          required
        />
        <Button
          type="submit"
          variant="primary"
          className="md:col-span-2"
          loading={busy}
        >
          Crear ticket
        </Button>
      </form>

      {error ? (
        <p
          role="alert"
          className="rounded border border-[var(--brand-danger)]/40 bg-[var(--brand-danger)]/10 px-3 py-2 text-sm text-[var(--brand-danger)]"
        >
          {error}
        </p>
      ) : null}

      {loading ? (
        <SkeletonRows rows={4} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Headphones className="h-7 w-7" />}
          title="Sin tickets de atención"
          description="Cree el primer ticket con el formulario de arriba. Aquí podrá priorizarlo, asignarlo a un agente y resolverlo."
        />
      ) : (
        <div className="space-y-3">
          {rows.map((t) => (
            <div
              key={t.id}
              className="nexa-panel flex flex-wrap items-start justify-between gap-3 p-4"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-data text-xs text-[var(--brand-primary)]">
                    {t.code}
                  </span>
                  <Badge>{statusEs(t.channel)}</Badge>
                  <Badge
                    tone={
                      t.status === "OPEN" || t.status === "IN_PROGRESS"
                        ? "danger"
                        : "success"
                    }
                  >
                    {statusEs(t.status)}
                  </Badge>
                  <Badge
                    tone={
                      t.priority === "HIGH"
                        ? "danger"
                        : t.priority === "LOW"
                          ? "info"
                          : "warning"
                    }
                  >
                    {statusEs(t.priority)}
                  </Badge>
                  {t.assignee ? (
                    <span className="text-xs text-[var(--brand-text-secondary)]">
                      → {t.assignee.name}
                    </span>
                  ) : null}
                </div>
                <h3 className="mt-1 font-semibold">{t.subject}</h3>
                <p className="text-sm text-[var(--brand-text-secondary)]">
                  {t.requester}: {t.message}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="field py-1 text-xs"
                  value={t.priority}
                  disabled={busy}
                  onChange={(e) =>
                    void patchTicket(t.id, { priority: e.target.value })
                  }
                >
                  <option value="LOW">Baja</option>
                  <option value="NORMAL">Normal</option>
                  <option value="HIGH">Alta</option>
                </select>
                {agents.length > 0 ? (
                  <select
                    className="field py-1 text-xs"
                    value={t.assignee?.id ?? ""}
                    disabled={busy}
                    onChange={(e) =>
                      void patchTicket(t.id, {
                        assigneeId: e.target.value || null,
                      })
                    }
                  >
                    <option value="">Sin asignar</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                ) : null}
                {t.status === "OPEN" ? (
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void setStatus(t.id, "IN_PROGRESS")}
                  >
                    Tomar
                  </Button>
                ) : null}
                {t.status !== "RESOLVED" && t.status !== "CLOSED" ? (
                  <Button
                    variant="primary"
                    disabled={busy}
                    onClick={() => void setStatus(t.id, "RESOLVED")}
                  >
                    Resolver
                  </Button>
                ) : null}
                {t.status === "RESOLVED" ? (
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void setStatus(t.id, "CLOSED")}
                  >
                    Cerrar
                  </Button>
                ) : null}
                {t.status === "CLOSED" || t.status === "RESOLVED" ? (
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void setStatus(t.id, "OPEN")}
                  >
                    Reabrir
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
