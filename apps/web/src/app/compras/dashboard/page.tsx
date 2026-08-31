"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { api } from "@/lib/api";
import { statusEs } from "@fsg/shared";
import { BentoPanel } from "@/components/nexa/bento-panel";

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

function urgencyTone(u: Urgency): "danger" | "warning" | "success" {
  if (u === "CRITICAL") return "danger";
  if (u === "LOW_STOCK") return "warning";
  return "success";
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
      setError((e as Error).message || "SeÃ±al perdida â€” reintentando conexiÃ³n");
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
          title: title || "ReposiciÃ³n stock crÃ­tico Taller",
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
        setMsg(`${res.message} Â· ${emit.message}`);
      }
      await load();
    } catch (e) {
      setError((e as Error).message || "LicitaciÃ³n automÃ¡tica fallida");
    } finally {
      setBusy(false);
      void reqId;
    }
  }

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-border pb-4">
        <div>
          <p className="font-data text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-primary">
            Compras
          </p>
          <h1 className="font-sans text-2xl font-semibold tracking-tight text-brand-text-primary md:text-3xl">
            Centro de proveedores
          </h1>
        </div>
        <Button
          type="button"
          variant="primary"
          disabled={busy}
          onClick={() => void runSmartBidding()}
        >
          {busy ? "Procesando…" : "Pujar y emitir orden"}
        </Button>
      </header>

      {error ? (
        <p className="rounded-lg border border-brand-danger/35 bg-brand-danger/10 px-4 py-3 text-sm">
          {error}
        </p>
      ) : null}
      {msg ? (
        <p className="rounded-lg border border-brand-success/35 bg-brand-success/10 px-4 py-3 text-sm">
          {msg}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {dash ? (
          <Badge tone="warning">
            Tope CFO {money(dash.savings.cfoThreshold)}
          </Badge>
        ) : null}
        {dash ? (
          <Badge tone="danger">Stock crítico {dash.savings.criticalStockCount}</Badge>
        ) : null}
      </div>

      <BentoPanel id="requisiciones" title="Bandeja de requisiciones" subtitle="Prioridad por urgencia">
        <ul className="divide-y divide-brand-border">
          {(dash?.inbox ?? []).length === 0 ? (
            <li className="px-5 py-8 text-sm text-brand-text-secondary">
              Sin requisiciones abiertas — dispare la licitación desde Taller
            </li>
          ) : (
            dash!.inbox.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
              >
                <div>
                  <p className="font-data text-xs text-brand-primary">
                    {item.code}
                    {item.sku ? ` · ${item.sku}` : ""}
                  </p>
                  <p className="text-sm text-brand-text-primary">{item.title}</p>
                  <p className="text-xs text-brand-text-secondary">
                    Cant. {item.quantity} · {statusEs(item.status)}
                  </p>
                </div>
                <Badge tone={urgencyTone(item.urgency)}>{item.label}</Badge>
              </li>
            ))
          )}
        </ul>
      </BentoPanel>

      <section id="ordenes">
        <p className="mb-3 px-1 font-data text-[10px] uppercase tracking-[0.14em] text-brand-text-secondary">
          Tablero OC · Cotizando → Emitida → Tránsito → Recibido
        </p>
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
                sub: "RequisiciÃ³n",
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
              sub: `${statusEs(o.status)} Â· ${o.supplier?.name || "â€”"}`,
            }))}
          />
          <KanbanCol
            title="En TrÃ¡nsito"
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

      <BentoPanel id="ahorros" title="Ahorros y proveedores" subtitle="Directorio homologado">
        <p className="mb-4 font-data text-2xl text-brand-primary">
          {money(dash?.savings.totalSavings ?? 0)}
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {(dash?.savings.suppliers ?? []).map((s) => (
            <article
              key={s.id}
              className="rounded-lg border border-[var(--brand-border)] bg-[var(--brand-canvas)] p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-[var(--brand-text-primary)]">
                  {s.name}
                </p>
                <Badge tone="warning">â˜… {s.rating.toFixed(1)}</Badge>
              </div>
              <p className="mt-1 font-mono text-xs text-[var(--brand-text-secondary)]">
                NIT {s.nit}
              </p>
              <p className="mt-2 font-mono text-sm text-[var(--brand-text-primary)]">
                Ahorro {money(s.totalSavings)}
              </p>
              {s.tags?.length ? (
                <p className="mt-1 text-xs text-[var(--brand-text-secondary)]">
                  {s.tags.slice(0, 4).join(" Â· ")}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      </BentoPanel>
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
    <div className="nexa-panel min-h-[240px] p-3">
      <p className="mb-3 px-1 text-xs font-medium uppercase tracking-wider text-[var(--brand-text-secondary)]">
        {props.title} Â· {props.items.length}
      </p>
      <div className="space-y-2">
        {props.items.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-[var(--brand-text-secondary)]">
            VacÃ­o
          </p>
        ) : (
          props.items.map((card) => (
            <article
              key={card.id}
              className="rounded-lg border border-[var(--brand-border)] bg-[var(--brand-canvas)] p-3"
            >
              <p className="font-mono text-xs text-[var(--brand-primary)]">
                {card.code}
              </p>
              <p className="mt-1 line-clamp-2 text-sm text-[var(--brand-text-primary)]">
                {card.title}
              </p>
              <p className="mt-1 font-mono text-xs text-[var(--brand-text-secondary)]">
                {card.meta}
                {card.sub ? ` Â· ${card.sub}` : ""}
              </p>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
