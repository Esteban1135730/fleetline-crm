"use client";



import { FormEvent, useEffect, useState } from "react";

import { Badge, Button } from "@fsg/ui";

import { api } from "@/lib/api";



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



export default function AtencionPage() {

  const [rows, setRows] = useState<Ticket[]>([]);

  const [agents, setAgents] = useState<OrgUser[]>([]);

  const [form, setForm] = useState({

    subject: "",

    requester: "",

    message: "",

    channel: "WHATSAPP",

  });



  async function load() {

    const [tickets, users] = await Promise.all([

      api<Ticket[]>("/atencion/tickets"),

      api<OrgUser[]>("/auth/users").catch(() => [] as OrgUser[]),

    ]);

    setRows(tickets);

    setAgents(users);

  }

  useEffect(() => {

    void load().catch(console.error);

  }, []);



  async function onCreate(e: FormEvent) {

    e.preventDefault();

    await api("/atencion/tickets", { method: "POST", body: JSON.stringify(form) });

    setForm({ subject: "", requester: "", message: "", channel: "WHATSAPP" });

    await load();

  }



  return (

    <div className="fade-in mx-auto max-w-[1600px] space-y-6">

      <div>

        <h2 className="page-title text-3xl md:text-4xl">Atención omnicanal</h2>

        <p className="page-sub">Tickets WhatsApp, email, teléfono y web</p>

      </div>

      <form onSubmit={onCreate} className="fsg-panel grid grid-cols-1 gap-3 p-4 md:grid-cols-2">

        <input className="field" placeholder="Asunto" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required />

        <input className="field" placeholder="Solicitante" value={form.requester} onChange={(e) => setForm({ ...form, requester: e.target.value })} required />

        <select className="field" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>

          <option value="WHATSAPP">WhatsApp</option>

          <option value="EMAIL">Email</option>

          <option value="PHONE">Teléfono</option>

          <option value="WEB">Web</option>

        </select>

        <input className="field" placeholder="Mensaje" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} required />

        <Button type="submit" variant="primary" className="md:col-span-2">Crear ticket</Button>

      </form>

      <div className="space-y-3">

        {rows.map((t) => (

          <div key={t.id} className="fsg-panel flex flex-wrap items-start justify-between gap-3 p-4">

            <div className="min-w-0 flex-1">

              <div className="flex flex-wrap items-center gap-2">

                <span className="font-data text-xs text-[var(--brand-primary)]">{t.code}</span>

                <Badge>{t.channel}</Badge>

                <Badge tone={t.status === "OPEN" || t.status === "IN_PROGRESS" ? "rose" : "emerald"}>{t.status}</Badge>

                <Badge tone={t.priority === "HIGH" ? "rose" : t.priority === "LOW" ? "cyan" : "amber"}>{t.priority}</Badge>

                {t.assignee ? (

                  <span className="text-xs text-[var(--brand-muted)]">→ {t.assignee.name}</span>

                ) : null}

              </div>

              <h3 className="mt-1 font-semibold">{t.subject}</h3>

              <p className="text-sm text-[var(--brand-muted)]">{t.requester}: {t.message}</p>

            </div>

            <div className="flex flex-wrap items-center gap-2">

              <select

                className="field py-1 text-xs"

                value={t.priority}

                onChange={async (e) => {

                  await api(`/atencion/tickets/${t.id}`, {

                    method: "PATCH",

                    body: JSON.stringify({ priority: e.target.value }),

                  });

                  await load();

                }}

              >

                <option value="LOW">Baja</option>

                <option value="NORMAL">Normal</option>

                <option value="HIGH">Alta</option>

              </select>

              {agents.length > 0 ? (

                <select

                  className="field py-1 text-xs"

                  value={t.assignee?.id ?? ""}

                  onChange={async (e) => {

                    await api(`/atencion/tickets/${t.id}`, {

                      method: "PATCH",

                      body: JSON.stringify({

                        assigneeId: e.target.value || null,

                      }),

                    });

                    await load();

                  }}

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

                  onClick={async () => {

                    await api(`/atencion/tickets/${t.id}/status`, {

                      method: "PATCH",

                      body: JSON.stringify({ status: "IN_PROGRESS" }),

                    });

                    await load();

                  }}

                >

                  Tomar

                </Button>

              ) : null}

              {t.status !== "RESOLVED" && t.status !== "CLOSED" ? (

                <Button

                  variant="primary"

                  onClick={async () => {

                    await api(`/atencion/tickets/${t.id}/status`, {

                      method: "PATCH",

                      body: JSON.stringify({ status: "RESOLVED" }),

                    });

                    await load();

                  }}

                >

                  Resolver

                </Button>

              ) : null}

              {t.status === "RESOLVED" ? (

                <Button

                  variant="ghost"

                  onClick={async () => {

                    await api(`/atencion/tickets/${t.id}/status`, {

                      method: "PATCH",

                      body: JSON.stringify({ status: "CLOSED" }),

                    });

                    await load();

                  }}

                >

                  Cerrar

                </Button>

              ) : null}

              {t.status === "CLOSED" || t.status === "RESOLVED" ? (

                <Button

                  variant="ghost"

                  onClick={async () => {

                    await api(`/atencion/tickets/${t.id}/status`, {

                      method: "PATCH",

                      body: JSON.stringify({ status: "OPEN" }),

                    });

                    await load();

                  }}

                >

                  Reabrir

                </Button>

              ) : null}

            </div>

          </div>

        ))}

      </div>

    </div>

  );

}


