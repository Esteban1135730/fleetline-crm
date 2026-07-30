"use client";



import { FormEvent, useEffect, useState } from "react";

import { Badge, Button } from "@fsg/ui";

import { EMPLOYEE_AREAS } from "@fsg/shared";

import { api } from "@/lib/api";



type Emp = {

  id: string;

  name: string;

  document: string;

  position: string;

  area: string;

  status: string;

  fatigueScore: number;

  phone?: string | null;

  email?: string | null;

};



const STATUSES = ["ACTIVE", "VACATION", "MEDICAL", "INACTIVE"] as const;



export default function RrhhPage() {

  const [rows, setRows] = useState<Emp[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);

  const [editForm, setEditForm] = useState({

    name: "",

    position: "",

    area: "",

    phone: "",

    email: "",

  });

  const [form, setForm] = useState({

    name: "",

    document: "",

    position: "Conductor",

    area: "Operaciones",

  });



  async function load() {

    setRows(await api<Emp[]>("/rrhh/employees"));

  }

  useEffect(() => {

    void load().catch(console.error);

  }, []);



  async function onCreate(e: FormEvent) {

    e.preventDefault();

    await api("/rrhh/employees", { method: "POST", body: JSON.stringify(form) });

    setForm({ name: "", document: "", position: "Conductor", area: "Operaciones" });

    await load();

  }



  function startEdit(r: Emp) {

    setEditingId(r.id);

    setEditForm({

      name: r.name,

      position: r.position,

      area: r.area,

      phone: r.phone ?? "",

      email: r.email ?? "",

    });

  }



  async function saveEdit(id: string) {

    await api(`/rrhh/employees/${id}`, {

      method: "PATCH",

      body: JSON.stringify({

        name: editForm.name,

        position: editForm.position,

        area: editForm.area,

        phone: editForm.phone || undefined,

        email: editForm.email || undefined,

      }),

    });

    setEditingId(null);

    await load();

  }



  return (

    <div className="fade-in mx-auto max-w-[1600px] space-y-6">

      <div>

        <h2 className="page-title text-3xl md:text-4xl">Recursos humanos</h2>

        <p className="page-sub">Personal, estado y fatiga operativa</p>

      </div>

      <form onSubmit={onCreate} className="fsg-panel grid grid-cols-1 gap-3 p-4 md:grid-cols-5">

        <input className="field" placeholder="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />

        <input className="field" placeholder="Documento" value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} required />

        <input className="field" placeholder="Cargo" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />

        <select className="field" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })}>

          {EMPLOYEE_AREAS.map((a) => (

            <option key={a} value={a}>{a}</option>

          ))}

        </select>

        <Button type="submit" variant="primary">Alta</Button>

      </form>

      <div className="fsg-panel data-shell overflow-hidden">

        <table className="w-full text-left text-sm">

          <thead>

            <tr>

              <th className="px-4 py-2">Nombre</th>

              <th className="px-4 py-2">Cargo</th>

              <th className="px-4 py-2">Fatiga</th>

              <th className="px-4 py-2">Estado</th>

              <th className="px-4 py-2">Acciones</th>

            </tr>

          </thead>

          <tbody>

            {rows.map((r) => (

              <tr key={r.id} className="border-t border-[var(--brand-line)]">

                <td className="px-4 py-2.5">

                  {editingId === r.id ? (

                    <input

                      className="field py-1 text-xs"

                      value={editForm.name}

                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}

                    />

                  ) : (

                    <>

                      {r.name}

                      <div className="font-data text-[10px] text-[var(--brand-muted)]">{r.document}</div>

                    </>

                  )}

                </td>

                <td className="px-4 py-2.5">

                  {editingId === r.id ? (

                    <div className="space-y-1">

                      <input

                        className="field py-1 text-xs"

                        value={editForm.position}

                        onChange={(e) => setEditForm({ ...editForm, position: e.target.value })}

                      />

                      <select

                        className="field py-1 text-xs"

                        value={editForm.area}

                        onChange={(e) => setEditForm({ ...editForm, area: e.target.value })}

                      >

                        {EMPLOYEE_AREAS.map((a) => (

                          <option key={a} value={a}>{a}</option>

                        ))}

                      </select>

                    </div>

                  ) : (

                    `${r.position} · ${r.area}`

                  )}

                </td>

                <td className="px-4 py-2.5 font-data">{r.fatigueScore}</td>

                <td className="px-4 py-2.5">

                  <select

                    className="field py-1 text-xs"

                    value={r.status}

                    onChange={async (e) => {

                      await api(`/rrhh/employees/${r.id}`, {

                        method: "PATCH",

                        body: JSON.stringify({ status: e.target.value }),

                      });

                      await load();

                    }}

                  >

                    {STATUSES.map((s) => (

                      <option key={s} value={s}>{s}</option>

                    ))}

                  </select>

                </td>

                <td className="px-4 py-2.5">

                  <div className="flex flex-wrap gap-1">

                    {editingId === r.id ? (

                      <>

                        <Button variant="primary" onClick={() => void saveEdit(r.id)}>

                          Guardar

                        </Button>

                        <Button variant="ghost" onClick={() => setEditingId(null)}>

                          Cancelar

                        </Button>

                      </>

                    ) : (

                      <Button variant="ghost" onClick={() => startEdit(r)}>

                        Editar ficha

                      </Button>

                    )}

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


