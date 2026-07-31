"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  QUOTE_DEFAULT_MARGIN_PCT,
  QUOTE_VEHICLE_COSTS,
  type QuoteCostBreakdown,
  type QuoteVehicleType,
} from "@fsg/shared";
import { Badge, Button, Tooltip } from "@fsg/ui";
import { api } from "@/lib/api";
import { HowToBox, PageIntro } from "@/components/page-intro";
import { useShell } from "@/lib/shell-context";

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
  notes?: string | null;
  calcJson?: QuoteCostBreakdown | null;
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

function money(n: number) {
  return `$${Math.round(n).toLocaleString("es-CO")}`;
}

const MARGIN_TIP =
  "Calculado automáticamente con un margen objetivo del 30% sobre costos de ruta y peajes (ajustable en el cotizador).";

export default function ComercialPage() {
  const { openInspector } = useShell();
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

  const [calcForm, setCalcForm] = useState({
    customerId: "",
    origen: "Bogotá",
    destino: "Medellín",
    tipoVehiculo: "BUS_TURISMO" as QuoteVehicleType,
    distanciaKm: "420",
    cantidadPeajes: "8",
    margenDeseado: String(QUOTE_DEFAULT_MARGIN_PCT),
  });
  const [breakdown, setBreakdown] = useState<QuoteCostBreakdown | null>(null);
  const [calcBusy, setCalcBusy] = useState(false);
  const [calcError, setCalcError] = useState("");

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
    if (!calcForm.customerId && c[0])
      setCalcForm((f) => ({ ...f, customerId: c[0].id }));
  }

  useEffect(() => {
    void load().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const calcPayload = useMemo(
    () => ({
      origen: calcForm.origen,
      destino: calcForm.destino,
      tipoVehiculo: calcForm.tipoVehiculo,
      distanciaKm: Number(calcForm.distanciaKm) || 0,
      cantidadPeajes: Number(calcForm.cantidadPeajes) || 0,
      margenDeseado: Number(calcForm.margenDeseado) || QUOTE_DEFAULT_MARGIN_PCT,
    }),
    [calcForm],
  );

  async function runCalculate() {
    setCalcBusy(true);
    setCalcError("");
    try {
      const result = await api<QuoteCostBreakdown>(
        "/comercial/quotes/calculate",
        {
          method: "POST",
          body: JSON.stringify(calcPayload),
        },
      );
      setBreakdown(result);
    } catch (err) {
      setBreakdown(null);
      setCalcError(
        err instanceof Error ? err.message : "Fallo de cálculo — uplink",
      );
    } finally {
      setCalcBusy(false);
    }
  }

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (
        calcForm.origen.trim() &&
        calcForm.destino.trim() &&
        Number(calcForm.distanciaKm) > 0
      ) {
        void runCalculate();
      }
    }, 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calcPayload]);

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

  async function saveQuoteFromCalc(e: FormEvent) {
    e.preventDefault();
    if (!breakdown) {
      setCalcError("Calcule la tarifa antes de guardar la cotización");
      return;
    }
    await api("/comercial/quotes", {
      method: "POST",
      body: JSON.stringify({
        customerId: calcForm.customerId,
        calc: calcPayload,
        notes: `${breakdown.origen} → ${breakdown.destino} · ${breakdown.tipoVehiculoLabel}`,
      }),
    });
    await load();
  }

  async function approveAndConvert(q: Quote) {
    const res = await api<Quote & { draftTrip?: { code: string } }>(
      `/comercial/quotes/${q.id}/status`,
      {
        method: "PATCH",
        body: JSON.stringify({ status: "WON" }),
      },
    );
    await load();
    const tripCode = res.draftTrip?.code;
    openInspector(
      `${q.code} · convertida`,
      <div className="space-y-3 text-sm">
        <p className="font-semibold text-[var(--accent-primary)]">
          Cotización WON — viaje borrador generado
        </p>
        {tripCode ? (
          <p className="font-data text-xs">
            Viaje {tripCode} en Logística (PENDING)
          </p>
        ) : (
          <p className="text-[var(--text-secondary)]">
            Revise Logística para el viaje TRP generado.
          </p>
        )}
      </div>,
    );
  }

  function openQuoteInspector(q: Quote) {
    const calc = q.calcJson;
    openInspector(
      `${q.code} · cotización`,
      <div className="space-y-4 text-sm">
        <div>
          <p className="font-data text-[10px] uppercase tracking-[0.14em] text-[var(--accent-primary)]">
            {q.customer.name}
          </p>
          <p className="mt-1 font-data text-lg font-bold text-[var(--text-primary)]">
            {money(Number(q.amount))}
          </p>
          <p className="text-xs text-[var(--text-secondary)]">{q.status}</p>
        </div>
        {calc ? (
          <dl className="space-y-2 font-data text-xs">
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--text-secondary)]">Ruta</dt>
              <dd>
                {calc.origen} → {calc.destino}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--text-secondary)]">Costo ruta</dt>
              <dd>{money(calc.costoDistancia)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--text-secondary)]">Peajes</dt>
              <dd>{money(calc.costoPeajes)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--text-secondary)]">Conductor</dt>
              <dd>{money(calc.pagoConductor)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--text-secondary)]">Costo operativo</dt>
              <dd>{money(calc.costoOperativo)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-[var(--text-secondary)]">Utilidad bruta</dt>
              <dd className="text-[var(--accent-metric)]">
                {money(calc.utilidadBruta)}
              </dd>
            </div>
            <div className="flex justify-between gap-2 border-t border-[var(--border-subtle)] pt-2">
              <dt className="text-[var(--text-secondary)]">Precio cliente</dt>
              <dd className="font-bold text-[var(--accent-primary)]">
                {money(calc.precioSugerido)}
              </dd>
            </div>
            <p className="text-[10px] text-[var(--text-secondary)]">
              Margen {calc.margenDeseado}%
            </p>
          </dl>
        ) : (
          <p className="text-[var(--text-secondary)]">
            {q.notes || "Sin desglose de cotizador"}
          </p>
        )}
        {q.status === "DRAFT" ||
        q.status === "SENT" ||
        q.status === "APPROVED" ? (
          <Button
            variant="primary"
            className="w-full"
            title="Aprueba la cotización (WON) y genera viaje borrador TRP en Logística"
            onClick={() => void approveAndConvert(q)}
          >
            APROBAR Y CONVERTIR A VIAJE
          </Button>
        ) : null}
      </div>,
    );
  }

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <PageIntro module="comercial" title="Comercial y contratos" />
      <HowToBox
        steps={[
          "Use el cotizador: ruta + tipo de unidad → precio sugerido con margen.",
          "Guarde la cotización y ábrala en el inspector para aprobar.",
          "APROBAR Y CONVERTIR genera viaje borrador TRP en Logística.",
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
          title="Razón social del cliente"
        />
        <input
          placeholder="NIT (ej. 900123456-1)"
          className="field"
          value={nit}
          onChange={(e) => setNit(e.target.value)}
          required
          title="NIT sujeto a chequeo SARLAFT"
        />
        <select
          className="field"
          value={segment}
          onChange={(e) => setSegment(e.target.value as typeof segment)}
          title="Segmento comercial"
        >
          <option value="B2B">Empresa</option>
          <option value="ESCOLAR">Colegio</option>
          <option value="TURISMO">Turismo</option>
        </select>
        <Button type="submit" variant="primary" title="Registrar cliente">
          Crear cliente
        </Button>
      </form>

      <section className="fsg-panel space-y-4 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold tracking-tight">
              Cotizador inteligente
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Algoritmo: (km × costo/km + peajes + conductor) / (1 − margen)
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            loading={calcBusy}
            title="Recalcular tarifa sugerida"
            onClick={() => void runCalculate()}
          >
            Recalcular
          </Button>
        </div>

        <form
          onSubmit={(e) => void saveQuoteFromCalc(e)}
          className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-4"
        >
          <select
            className="field"
            value={calcForm.customerId}
            onChange={(e) =>
              setCalcForm({ ...calcForm, customerId: e.target.value })
            }
            required
            title="Cliente de la cotización"
          >
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            className="field"
            placeholder="Origen"
            value={calcForm.origen}
            onChange={(e) =>
              setCalcForm({ ...calcForm, origen: e.target.value })
            }
            required
            title="Origen de la ruta"
          />
          <input
            className="field"
            placeholder="Destino"
            value={calcForm.destino}
            onChange={(e) =>
              setCalcForm({ ...calcForm, destino: e.target.value })
            }
            required
            title="Destino de la ruta"
          />
          <select
            className="field"
            value={calcForm.tipoVehiculo}
            onChange={(e) =>
              setCalcForm({
                ...calcForm,
                tipoVehiculo: e.target.value as QuoteVehicleType,
              })
            }
            title="Tipo de unidad — costo/km y pago conductor"
          >
            {(Object.keys(QUOTE_VEHICLE_COSTS) as QuoteVehicleType[]).map(
              (k) => (
                <option key={k} value={k}>
                  {QUOTE_VEHICLE_COSTS[k].label}
                </option>
              ),
            )}
          </select>
          <input
            className="field font-data"
            type="number"
            min={1}
            placeholder="Distancia km"
            value={calcForm.distanciaKm}
            onChange={(e) =>
              setCalcForm({ ...calcForm, distanciaKm: e.target.value })
            }
            required
            title="Distancia estimada (km)"
          />
          <input
            className="field font-data"
            type="number"
            min={0}
            placeholder="Cantidad peajes"
            value={calcForm.cantidadPeajes}
            onChange={(e) =>
              setCalcForm({ ...calcForm, cantidadPeajes: e.target.value })
            }
            title="Peajes estimados en la ruta"
          />
          <input
            className="field font-data"
            type="number"
            min={1}
            max={80}
            placeholder="Margen %"
            value={calcForm.margenDeseado}
            onChange={(e) =>
              setCalcForm({ ...calcForm, margenDeseado: e.target.value })
            }
            title={MARGIN_TIP}
          />
          <Button
            type="submit"
            variant="primary"
            title="Guarda cotización DRAFT con precio sugerido y desglose"
          >
            Guardar cotización
          </Button>
        </form>

        {calcError ? (
          <p className="text-sm text-[var(--accent-alert)]">{calcError}</p>
        ) : null}

        {breakdown ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tooltip
              content="Costo de distancia: km × costo/km del tipo de unidad"
              side="top"
            >
              <div className="w-full rounded-lg border border-[var(--border-subtle)] p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-secondary)]">
                  Costo estimado ruta
                </p>
                <p className="mt-1 font-data text-xl font-bold text-[var(--text-primary)]">
                  {money(breakdown.costoDistancia)}
                </p>
              </div>
            </Tooltip>
            <Tooltip
              content={`Peajes aprox.: ${breakdown.cantidadPeajes} × ${money(breakdown.costoPromedioPeaje)}`}
              side="top"
            >
              <div className="w-full rounded-lg border border-[var(--border-subtle)] p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-secondary)]">
                  Peajes aproximados
                </p>
                <p className="mt-1 font-data text-xl font-bold text-[var(--text-primary)]">
                  {money(breakdown.costoPeajes)}
                </p>
              </div>
            </Tooltip>
            <Tooltip content={MARGIN_TIP} side="top">
              <div className="w-full rounded-lg border border-[var(--border-subtle)] border-l-[3px] border-l-[var(--accent-metric)] p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-secondary)]">
                  Utilidad bruta est.
                </p>
                <p className="mt-1 font-data text-xl font-bold text-[var(--accent-metric)]">
                  {money(breakdown.utilidadBruta)}
                </p>
              </div>
            </Tooltip>
            <Tooltip content={MARGIN_TIP} side="top">
              <div className="w-full rounded-lg border border-[var(--border-subtle)] border-l-[3px] border-l-[var(--accent-primary)] p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-secondary)]">
                  Precio final sugerido
                </p>
                <p className="mt-1 font-data text-xl font-extrabold text-[var(--accent-primary)]">
                  {money(breakdown.precioSugerido)}
                </p>
              </div>
            </Tooltip>
          </div>
        ) : (
          <p className="text-sm text-[var(--text-secondary)]">
            Ajuste ruta y distancia para ver el desglose en tiempo real…
          </p>
        )}
      </section>

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
        <div
          id="clientes"
          className="fsg-panel data-shell overflow-hidden lg:col-span-1 scroll-mt-24"
        >
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
              <tr
                key={q.id}
                className="cursor-pointer border-t border-[var(--brand-line)] hover:bg-[color-mix(in_srgb,var(--accent-primary)_6%,transparent)]"
                onClick={() => openQuoteInspector(q)}
                title="Abrir desglose en el inspector"
              >
                <td className="px-4 py-2.5 font-data text-xs">{q.code}</td>
                <td className="px-4 py-2.5">{q.customer.name}</td>
                <td className="px-4 py-2.5 font-data text-xs">
                  {money(Number(q.amount))}
                </td>
                <td className="px-4 py-2.5">
                  <Badge
                    tone={
                      q.status === "WON" || q.status === "APPROVED"
                        ? "emerald"
                        : q.status === "REJECTED"
                          ? "rose"
                          : "info"
                    }
                    title={
                      q.status === "WON" || q.status === "APPROVED"
                        ? "Aprobada — viaje borrador puede estar en Logística"
                        : `Estado ${q.status}`
                    }
                  >
                    {q.status}
                  </Badge>
                </td>
                <td
                  className="px-4 py-2.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex flex-wrap gap-1">
                    <Button
                      variant="ghost"
                      title="Ver desglose y aprobar en inspector"
                      onClick={() => openQuoteInspector(q)}
                    >
                      Detalle
                    </Button>
                    {q.status === "DRAFT" || q.status === "SENT" ? (
                      <Button
                        variant="primary"
                        title="WON: aprueba y genera viaje TRP en Logística"
                        onClick={() => void approveAndConvert(q)}
                      >
                        Aprobar → Viaje
                      </Button>
                    ) : null}
                    {q.status === "DRAFT" ? (
                      <Button
                        variant="ghost"
                        title="Marcar como enviada al cliente"
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
                    {q.status === "DRAFT" || q.status === "SENT" ? (
                      <Button
                        variant="ghost"
                        title="Rechazar cotización"
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
                    ) : null}
                    {q.status === "APPROVED" ||
                    q.status === "SENT" ||
                    q.status === "DRAFT" ||
                    q.status === "WON" ? (
                      <Button
                        variant="ghost"
                        title="También puede generar contrato operativo"
                        onClick={async () => {
                          await api(`/comercial/quotes/${q.id}/to-contract`, {
                            method: "POST",
                          });
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
