"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { api } from "@/lib/api";
import { statusEs } from "@fsg/shared";
import { HowToBox, PageIntro } from "@/components/page-intro";

type Urgency = "CRITICAL" | "LOW_STOCK" | "ADMIN";

type Dash = {
  inbox: Array<{
    id: string;
    code: string;
    title: string;
    urgency: Urgency;
    status: string;
    quantity: number;
    sku?: string | null;
    signal: string;
    label: string;
  }>;
  kanban: {
    cotizando: Array<{
      id: string;
      code: string;
      description?: string | null;
      totalEstimated: number | string;
      status: string;
      supplier?: { name: string } | null;
    }>;
    ocEmitida: Array<{
      id: string;
      code: string;
      description?: string | null;
      totalEstimated: number | string;
      status: string;
      supplier?: { name: string } | null;
    }>;
    enTransito: Array<{
      id: string;
      code: string;
      description?: string | null;
      totalEstimated: number | string;
      status: string;
      supplier?: { name: string } | null;
    }>;
    recibido: Array<{
      id: string;
      code: string;
      description?: string | null;
      totalEstimated: number | string;
      status: string;
      supplier?: { name: string } | null;
    }>;
    cotizandoExtra?: Array<{
      id: string;
      code: string;
      title: string;
      kind: string;
    }>;
  };
  savings: {
    totalSavings: number;
    criticalStockCount: number;
    cfoThreshold: number;
    suppliers: Array<{
      id: string;
      name: string;
      nit: string;
      rating: number;
      totalSavings: number;
      tags: string[];
    }>;
  };
};

function money(n: number | string) {
  const v = typeof n === "string" ? Number(n) : n;
  return `$${Number(v || 0).toLocaleString("es-CO")}`;
}

function urgencyTone(u: Urgency): "rose" | "amber" | "emerald" {
  if (u === "CRITICAL") return "rose";
  if (u === "LOW_STOCK") return "amber";
  return "emerald";
}

export default function ComprasVendorDashboardPage() {
  const [dash, setDash] = useState<Dash | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const d = await api<Dash>("/api/v1/compras/dashboard");
      setDash(d);
    } catch (e) {
      setError((e as Error).message || "Señal perdida — reintentando conexión");
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 25_000);
    return () => clearInterval(t);
  }, [load]);

  async function runSmartBidding(reqId?: string, title?: string) {
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const res = await api<{
        message: string;
        requisition: { id: string; code: string };
        selected?: { bidId: string; supplierName: string };
      }>("/api/v1/compras/requisiciones/smart-bidding", {
        method: "POST",
        body: JSON.stringify({
          title: title || "Reposición stock crítico Taller",
          urgency: "CRITICAL",
          quantity: 4,
          autoSelect: true,
          productTags: ["REPUESTO", "FRENOS"],
        }),
      });
      setMsg(res.message);
      if (res.selected?.bidId) {
        const emit = await api<{
          message: string;
          requiresCfoApproval: boolean;
        }>("/api/v1/compras/ordenes/emitir", {
          method: "POST",
          body: JSON.stringify({
            requisitionId: res.requisition.id,
            bidId: res.selected.bidId,
          }),
        });
        setMsg(`${res.message} · ${emit.message}`);
      }
      await load();
    } catch (e) {
      setError((e as Error).message || "Licitación automática fallida");
    } finally {
      setBusy(false);
      void reqId;
    }
  }

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-8">
      <PageIntro module="compras" title="Centro de proveedores · Compras inteligentes" />
      <HowToBox
        steps={[
          "Bandeja: Rojo Bus Varado · Amarillo Stock Bajo · Verde Administrativo.",
          "La puja automática envía solicitudes a proveedores homologados y elige la mejor oferta.",
          "OC sobre tope → escalamiento al Director Financiero. Entrada al almacén dispara el cruce triple.",
        ]}
      />

      {error ? (
        <p className="rounded-lg border border-[rgba(255,42,95,0.35)] bg-[rgba(255,42,95,0.08)] px-4 py-3 text-sm">
          {error}
        </p>
      ) : null}
      {msg ? (
        <p className="rounded-lg border border-[rgba(16,185,129,0.35)] bg-[rgba(16,185,129,0.08)] px-4 py-3 text-sm">
          {msg}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="primary"
          disabled={busy}
          onClick={() => void runSmartBidding()}
        >
          {busy ? "Procesando…" : "Pujar y emitir orden"}
        </Button>
        {dash ? (
          <Badge tone="amber">
            Tope de dirección financiera {money(dash.savings.cfoThreshold)}
          </Badge>
        ) : null}
        {dash ? (
          <Badge tone="rose">
            Stock crítico {dash.savings.criticalStockCount}
          </Badge>
        ) : null}
      </div>

      {/* Inbox requisiciones */}
      <section id="requisiciones" className="fsg-panel overflow-hidden">
        <header className="border-b border-[var(--border-subtle)] px-5 py-4">
          <h3 className="font-display text-lg text-[var(--text-primary)]">
            Bandeja de requisiciones
          </h3>
          <p className="text-sm text-[var(--text-secondary)]">
            Prioridad por urgencia · centro de proveedores
          </p>
        </header>
        <ul className="divide-y divide-[var(--border-subtle)]">
          {(dash?.inbox ?? []).length === 0 ? (
            <li className="px-5 py-8 text-sm text-[var(--text-secondary)]">
              Sin requisiciones abiertas — dispare la licitación desde Taller
            </li>
          ) : (
            dash!.inbox.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
              >
                <div>
                  <p className="font-mono text-xs text-[var(--accent-primary)]">
                    {item.code}
                    {item.sku ? ` · ${item.sku}` : ""}
                  </p>
                  <p className="text-sm text-[var(--text-primary)]">
                    {item.title}
                  </p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Cant. {item.quantity} · {statusEs(item.status)}
                  </p>
                </div>
                <Badge tone={urgencyTone(item.urgency)}>{item.label}</Badge>
              </li>
            ))
          )}
        </ul>
      </section>

      {/* Kanban OC */}
      <section id="ordenes">
        <header className="mb-3 px-1">
          <h3 className="font-display text-lg text-[var(--text-primary)]">
            Tablero de órdenes de compra
          </h3>
          <p className="text-sm text-[var(--text-secondary)]">
            Cotizando → OC Emitida → En Tránsito → Recibido
          </p>
        </header>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <KanbanCol
            title="Cotizando"
            items={[
              ...(dash?.kanban.cotizando ?? []).map((o) => ({
                id: o.id,
                code: o.code,
                title: o.description || o.code,
                meta: money(o.totalEstimated),
                sub: o.supplier?.name,
              })),
              ...(dash?.kanban.cotizandoExtra ?? []).map((r) => ({
                id: r.id,
                code: r.code,
                title: r.title,
                meta: "RFQ",
                sub: "Requisición",
              })),
            ]}
          />
          <KanbanCol
            title="OC Emitida"
            items={(dash?.kanban.ocEmitida ?? []).map((o) => ({
              id: o.id,
              code: o.code,
              title: o.description || o.code,
              meta: money(o.totalEstimated),
              sub: `${statusEs(o.status)} · ${o.supplier?.name || "—"}`,
            }))}
          />
          <KanbanCol
            title="En Tránsito"
            items={(dash?.kanban.enTransito ?? []).map((o) => ({
              id: o.id,
              code: o.code,
              title: o.description || o.code,
              meta: money(o.totalEstimated),
              sub: o.supplier?.name,
            }))}
          />
          <KanbanCol
            title="Recibido"
            items={(dash?.kanban.recibido ?? []).map((o) => ({
              id: o.id,
              code: o.code,
              title: o.description || o.code,
              meta: money(o.totalEstimated),
              sub: o.supplier?.name,
            }))}
          />
        </div>
      </section>

      {/* Ahorros */}
      <section id="ahorros" className="fsg-panel p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="font-display text-lg text-[var(--text-primary)]">
              Ahorros & proveedores
            </h3>
            <p className="font-mono text-2xl text-[var(--accent-primary)]">
              {money(dash?.savings.totalSavings ?? 0)}
            </p>
          </div>
          <Badge tone="emerald">Homologados</Badge>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {(dash?.savings.suppliers ?? []).map((s) => (
            <article
              key={s.id}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  {s.name}
                </p>
                <Badge tone="amber">★ {s.rating.toFixed(1)}</Badge>
              </div>
              <p className="mt-1 font-mono text-xs text-[var(--text-secondary)]">
                NIT {s.nit}
              </p>
              <p className="mt-2 font-mono text-sm text-[var(--text-primary)]">
                Ahorro {money(s.totalSavings)}
              </p>
              {s.tags?.length ? (
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  {s.tags.slice(0, 4).join(" · ")}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function KanbanCol(props: {
  title: string;
  items: Array<{
    id: string;
    code: string;
    title: string;
    meta: string;
    sub?: string | null;
  }>;
}) {
  return (
    <div className="fsg-panel min-h-[240px] p-3">
      <p className="mb-3 px-1 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)]">
        {props.title} · {props.items.length}
      </p>
      <div className="space-y-2">
        {props.items.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-[var(--text-secondary)]">
            Vacío
          </p>
        ) : (
          props.items.map((card) => (
            <article
              key={card.id}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-3"
            >
              <p className="font-mono text-xs text-[var(--accent-primary)]">
                {card.code}
              </p>
              <p className="mt-1 line-clamp-2 text-sm text-[var(--text-primary)]">
                {card.title}
              </p>
              <p className="mt-1 font-mono text-xs text-[var(--text-secondary)]">
                {card.meta}
                {card.sub ? ` · ${card.sub}` : ""}
              </p>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
