"use client";

import { FormEvent, useEffect, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { api } from "@/lib/api";
import { HowToBox, PageIntro } from "@/components/page-intro";

type Customer = {
  id: string;
  name: string;
  nit: string;
  segment: string;
  email?: string | null;
  phone?: string | null;
};

type Quote = {
  id: string;
  code: string;
  amount: string | number;
  status: string;
  customer: { name: string };
};

type Contract = {
  id: string;
  code: string;
  name: string;
  channel: string;
  status: string;
  route?: string | null;
  monthlyValue?: string | number | null;
  endDate?: string | null;
  customer: { name: string };
  _count: { trips: number };
};

const CHANNEL_ES: Record<string, string> = {
  PRIVATE: "Empresa privada",
  PUBLIC_TENDER: "Licitación pública",
};

export default function ComercialPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [name, setName] = useState("");
  const [nit, setNit] = useState("");
  const [segment, setSegment] = useState<"B2B" | "ESCOLAR" | "TURISMO">("B2B");
  const [contractForm, setContractForm] = useState({
    name: "",
    customerId: "",
    channel: "PRIVATE" as "PRIVATE" | "PUBLIC_TENDER",
    route: "",
    startDate: "",
    endDate: "",
    monthlyValue: "",
  });

  const [quoteForm, setQuoteForm] = useState({
    customerId: "",
    amount: "",
    notes: "",
  });

  async function load() {
    const [c, q, ctr] = await Promise.all([
      api<Customer[]>("/comercial/customers"),
      api<Quote[]>("/comercial/quotes"),
      api<Contract[]>("/comercial/contracts"),
    ]);
    setCustomers(c);
    setQuotes(q);
    setContracts(ctr);
    if (!contractForm.customerId && c[0])
      setContractForm((f) => ({ ...f, customerId: c[0].id }));
    if (!quoteForm.customerId && c[0])
      setQuoteForm((f) => ({ ...f, customerId: c[0].id }));
  }

  useEffect(() => {
    void load().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    await api("/comercial/customers", {
      method: "POST",
      body: JSON.stringify({ name, nit, segment }),
    });
    setName("");
    setNit("");
    await load();
  }

  async function onCreateContract(e: FormEvent) {
    e.preventDefault();
    await api("/comercial/contracts", {
      method: "POST",
      body: JSON.stringify({
        ...contractForm,
        monthlyValue: contractForm.monthlyValue
          ? Number(contractForm.monthlyValue)
          : undefined,
      }),
    });
    setContractForm((f) => ({
      ...f,
      name: "",
      route: "",
      monthlyValue: "",
    }));
    await load();
  }

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <PageIntro module="comercial" title="Comercial y contratos" />
      <HowToBox
        steps={[
          "Registra clientes (empresa privada, colegio o turismo).",
          "Crea contratos operativos: privados o por licitación pública.",
          "Los viajes en Operaciones se vinculan al contrato correspondiente.",
        ]}
      />

      <form
        onSubmit={onCreate}
        className="fsg-panel grid grid-cols-1 gap-3 p-4 md:grid-cols-4"
      >
        <input
          placeholder="Nombre del cliente"
          className="field"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <input
          placeholder="NIT (ej. 900123456-1)"
          className="field"
          value={nit}
          onChange={(e) => setNit(e.target.value)}
          required
        />
        <select
          className="field"
          value={segment}
          onChange={(e) => setSegment(e.target.value as typeof segment)}
        >
          <option value="B2B">Empresa</option>
          <option value="ESCOLAR">Colegio</option>
          <option value="TURISMO">Turismo</option>
        </select>
        <Button type="submit" variant="primary">
          Crear cliente
        </Button>
      </form>

      <form
        onSubmit={onCreateContract}
        className="fsg-panel grid grid-cols-1 gap-3 p-4 md:grid-cols-7"
      >
        <input
          className="field md:col-span-2"
          placeholder="Nombre del contrato"
          value={contractForm.name}
          onChange={(e) =>
            setContractForm({ ...contractForm, name: e.target.value })
          }
          required
        />
        <select
          className="field"
          value={contractForm.customerId}
          onChange={(e) =>
            setContractForm({ ...contractForm, customerId: e.target.value })
          }
          required
        >
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          className="field"
          value={contractForm.channel}
          onChange={(e) =>
            setContractForm({
              ...contractForm,
              channel: e.target.value as "PRIVATE" | "PUBLIC_TENDER",
            })
          }
        >
          <option value="PRIVATE">Empresa privada</option>
          <option value="PUBLIC_TENDER">Licitación pública</option>
        </select>
        <input
          className="field"
          placeholder="Ruta"
          value={contractForm.route}
          onChange={(e) =>
            setContractForm({ ...contractForm, route: e.target.value })
          }
        />
        <input
          className="field"
          type="date"
          value={contractForm.startDate}
          onChange={(e) =>
            setContractForm({ ...contractForm, startDate: e.target.value })
          }
          required
        />
        <input
          className="field"
          type="date"
          value={contractForm.endDate}
          onChange={(e) =>
            setContractForm({ ...contractForm, endDate: e.target.value })
          }
          required
        />
        <input
          className="field"
          type="number"
          placeholder="Valor mensual COP"
          value={contractForm.monthlyValue}
          onChange={(e) =>
            setContractForm({ ...contractForm, monthlyValue: e.target.value })
          }
        />
        <Button type="submit" variant="primary" className="md:col-span-7">
          Crear contrato operativo
        </Button>
      </form>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="fsg-panel data-shell overflow-hidden lg:col-span-1">
          <div className="border-b border-[var(--brand-line)] px-4 py-3 font-display text-sm font-semibold">
            Clientes ({customers.length})
          </div>
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="px-4 py-2">Nombre</th>
                <th className="px-4 py-2">Segmento</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="border-t border-[var(--brand-line)]">
                  <td className="px-4 py-2.5">
                    {c.name}
                    <div className="font-data text-[10px] text-[var(--brand-muted)]">
                      {c.nit}
                    </div>
                    {c.email || c.phone ? (
                      <div className="text-[10px] text-[var(--brand-muted)]">
                        {[c.email, c.phone].filter(Boolean).join(" · ")}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge>{c.segment}</Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        const name = window.prompt("Nombre", c.name);
                        if (name === null) return;
                        const email = window.prompt(
                          "Email",
                          c.email || "",
                        );
                        if (email === null) return;
                        const phone = window.prompt(
                          "Teléfono",
                          c.phone || "",
                        );
                        if (phone === null) return;
                        await api(`/comercial/customers/${c.id}`, {
                          method: "PATCH",
                          body: JSON.stringify({
                            name: name.trim() || c.name,
                            email: email.trim() || undefined,
                            phone: phone.trim() || undefined,
                          }),
                        });
                        await load();
                      }}
                    >
                      Editar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="fsg-panel data-shell overflow-hidden lg:col-span-2">
          <div className="border-b border-[var(--brand-line)] px-4 py-3 font-display text-sm font-semibold">
            Contratos operativos ({contracts.length})
          </div>
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="px-4 py-2">Código</th>
                <th className="px-4 py-2">Cliente</th>
                <th className="px-4 py-2">Canal</th>
                <th className="px-4 py-2">Viajes</th>
                <th className="px-4 py-2">Valor/mes</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((ctr) => (
                <tr key={ctr.id} className="border-t border-[var(--brand-line)]">
                  <td className="px-4 py-2.5">
                    <span className="font-data text-xs text-[var(--brand-primary)]">
                      {ctr.code}
                    </span>
                    <div>{ctr.name}</div>
                  </td>
                  <td className="px-4 py-2.5">{ctr.customer.name}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone={ctr.channel === "PUBLIC_TENDER" ? "info" : "emerald"}>
                      {CHANNEL_ES[ctr.channel] || ctr.channel}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 font-data">{ctr._count.trips}</td>
                  <td className="px-4 py-2.5 font-data text-xs">
                    {ctr.monthlyValue
                      ? `$${Number(ctr.monthlyValue).toLocaleString("es-CO")}`
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge
                      tone={
                        ctr.status === "ACTIVE"
                          ? "emerald"
                          : ctr.status === "SUSPENDED"
                            ? "amber"
                            : "slate"
                      }
                    >
                      {ctr.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      <Button
                        variant="ghost"
                        onClick={async () => {
                          const name = window.prompt("Nombre", ctr.name);
                          if (name === null) return;
                          const route = window.prompt(
                            "Ruta",
                            ctr.route || "",
                          );
                          if (route === null) return;
                          const monthlyValue = window.prompt(
                            "Valor mensual COP",
                            ctr.monthlyValue
                              ? String(ctr.monthlyValue)
                              : "",
                          );
                          if (monthlyValue === null) return;
                          const endDate = window.prompt(
                            "Fecha fin (YYYY-MM-DD)",
                            ctr.endDate
                              ? ctr.endDate.slice(0, 10)
                              : "",
                          );
                          if (endDate === null) return;
                          await api(`/comercial/contracts/${ctr.id}`, {
                            method: "PATCH",
                            body: JSON.stringify({
                              name: name.trim() || ctr.name,
                              route: route.trim() || undefined,
                              monthlyValue: monthlyValue.trim()
                                ? Number(monthlyValue)
                                : undefined,
                              endDate: endDate.trim() || undefined,
                            }),
                          });
                          await load();
                        }}
                      >
                        Editar
                      </Button>
                      {ctr.status !== "ACTIVE" ? (
                        <Button
                          variant="ghost"
                          onClick={async () => {
                            await api(`/comercial/contracts/${ctr.id}`, {
                              method: "PATCH",
                              body: JSON.stringify({ status: "ACTIVE" }),
                            });
                            await load();
                          }}
                        >
                          Activar
                        </Button>
                      ) : null}
                      {ctr.status === "ACTIVE" ? (
                        <Button
                          variant="ghost"
                          onClick={async () => {
                            await api(`/comercial/contracts/${ctr.id}`, {
                              method: "PATCH",
                              body: JSON.stringify({ status: "SUSPENDED" }),
                            });
                            await load();
                          }}
                        >
                          Suspender
                        </Button>
                      ) : null}
                      {ctr.status !== "ENDED" ? (
                        <Button
                          variant="ghost"
                          onClick={async () => {
                            await api(`/comercial/contracts/${ctr.id}`, {
                              method: "PATCH",
                              body: JSON.stringify({ status: "ENDED" }),
                            });
                            await load();
                          }}
                        >
                          Cerrar
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await api("/comercial/quotes", {
            method: "POST",
            body: JSON.stringify({
              customerId: quoteForm.customerId,
              amount: Number(quoteForm.amount),
              notes: quoteForm.notes || undefined,
            }),
          });
          setQuoteForm((f) => ({ ...f, amount: "", notes: "" }));
          await load();
        }}
        className="fsg-panel grid grid-cols-1 gap-3 p-4 md:grid-cols-4"
      >
        <select
          className="field"
          value={quoteForm.customerId}
          onChange={(e) =>
            setQuoteForm({ ...quoteForm, customerId: e.target.value })
          }
          required
        >
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          className="field"
          type="number"
          placeholder="Monto COP"
          value={quoteForm.amount}
          onChange={(e) =>
            setQuoteForm({ ...quoteForm, amount: e.target.value })
          }
          required
        />
        <input
          className="field"
          placeholder="Notas"
          value={quoteForm.notes}
          onChange={(e) =>
            setQuoteForm({ ...quoteForm, notes: e.target.value })
          }
        />
        <Button type="submit" variant="primary">
          Crear cotización
        </Button>
      </form>

      <div className="fsg-panel data-shell overflow-hidden">
        <div className="border-b border-[var(--brand-line)] px-4 py-3 font-display text-sm font-semibold">
          Cotizaciones ({quotes.length})
        </div>
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="px-4 py-2">Código</th>
              <th className="px-4 py-2">Cliente</th>
              <th className="px-4 py-2">Monto</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {quotes.map((q) => (
              <tr key={q.id} className="border-t border-[var(--brand-line)]">
                <td className="px-4 py-2.5 font-data text-xs">{q.code}</td>
                <td className="px-4 py-2.5">{q.customer.name}</td>
                <td className="px-4 py-2.5 font-data text-xs">
                  ${Number(q.amount).toLocaleString("es-CO")}
                </td>
                <td className="px-4 py-2.5">
                  <Badge tone="emerald">{q.status}</Badge>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {q.status === "DRAFT" || q.status === "SENT" ? (
                      <>
                        <Button
                          variant="ghost"
                          onClick={async () => {
                            await api(`/comercial/quotes/${q.id}/status`, {
                              method: "PATCH",
                              body: JSON.stringify({ status: "APPROVED" }),
                            });
                            await load();
                          }}
                        >
                          Aprobar
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={async () => {
                            await api(`/comercial/quotes/${q.id}/status`, {
                              method: "PATCH",
                              body: JSON.stringify({ status: "REJECTED" }),
                            });
                            await load();
                          }}
                        >
                          Rechazar
                        </Button>
                      </>
                    ) : null}
                    {q.status === "DRAFT" ? (
                      <Button
                        variant="ghost"
                        onClick={async () => {
                          await api(`/comercial/quotes/${q.id}/status`, {
                            method: "PATCH",
                            body: JSON.stringify({ status: "SENT" }),
                          });
                          await load();
                        }}
                      >
                        Enviar
                      </Button>
                    ) : null}
                    {q.status === "APPROVED" ||
                    q.status === "SENT" ||
                    q.status === "DRAFT" ? (
                      <Button
                        variant="ghost"
                        onClick={async () => {
                          await api(
                            `/comercial/quotes/${q.id}/to-contract`,
                            { method: "POST" },
                          );
                          await load();
                        }}
                      >
                        → Contrato
                      </Button>
                    ) : null}
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
