"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { Package, QrCode, Search } from "lucide-react";
import { api } from "@/lib/api";
import { EmptyState } from "@/components/audit";
import { BentoPanel } from "@/components/nexa/bento-panel";
import { NexaTable, NexaRow, NexaCell } from "@/components/nexa/nexa-table";

type Item = {
  id: string;
  sku: string;
  name: string;
  qrCode: string;
  quantity: number;
  unitCost: number;
  status: string;
};

type Tray = {
  workOrderId: string;
  code: string;
  plate: string;
  mechanic: string | null;
  status: string;
};

type Dash = {
  inventory: Item[];
  dispatchTray: Tray[];
};

export default function AlmacenTallerDashboard() {
  const [dash, setDash] = useState<Dash | null>(null);
  const [query, setQuery] = useState("");
  const [workOrderId, setWorkOrderId] = useState("");
  const [partQr, setPartQr] = useState("QR-PART-FRN-001");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get<Dash>("/api/v1/taller/almacen/dashboard");
      setDash(data);
      if (data.dispatchTray[0] && !workOrderId) {
        setWorkOrderId(data.dispatchTray[0].workOrderId);
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Conexión fallida");
    }
  }, [workOrderId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = (dash?.inventory ?? []).filter(
    (i) =>
      !query ||
      i.sku.toLowerCase().includes(query.toLowerCase()) ||
      i.qrCode.toLowerCase().includes(query.toLowerCase()) ||
      i.name.toLowerCase().includes(query.toLowerCase()),
  );

  async function despachar() {
    if (!workOrderId || !partQr) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.post<{
        message: string;
        costCenterPlate: string;
        costAmount: number;
        stockRemaining: number;
      }>("/api/v1/taller/almacen/despachar-qr", {
        workOrderId,
        partQr,
        quantity: 1,
      });
      setMsg(
        `${res.message} · stock ${res.stockRemaining} · ${res.costCenterPlate}`,
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Despacho fallido");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-border pb-4">
        <div>
          <p className="font-data text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-primary">
            Taller · Almacén
          </p>
          <h1 className="font-sans text-2xl font-semibold tracking-tight text-brand-text-primary md:text-3xl">
            Inventario y despacho QR
          </h1>
        </div>
      </header>

      <div className="rounded-lg border border-brand-warning/40 bg-brand-warning/10 px-4 py-3 font-sans text-sm text-brand-text-primary">
        Hard lock antifraude: el despacho exige{" "}
        <span className="font-semibold">QR/serial</span> de la pieza. Sin
        escaneo válido el API rechaza el movimiento.
      </div>

      {error ? (
        <p className="rounded-lg border border-brand-danger/40 bg-brand-danger/10 px-4 py-3 font-data text-sm text-brand-danger">
          {error}
        </p>
      ) : null}
      {msg ? (
        <p className="rounded-lg border border-brand-primary/40 bg-brand-primary/10 px-4 py-3 font-data text-sm text-brand-primary">
          {msg}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12 lg:gap-4">
        <BentoPanel
          id="despacho"
          title="Despacho rápido POS"
          subtitle="Bandeja OT · escaneo QR"
          icon={<QrCode />}
          className="lg:col-span-5"
        >
          <div className="flex flex-col gap-3">
            <select
              value={workOrderId}
              onChange={(e) => setWorkOrderId(e.target.value)}
              className="field font-data"
            >
              {(dash?.dispatchTray ?? []).map((t) => (
                <option key={t.workOrderId} value={t.workOrderId}>
                  {t.code} · {t.plate} · {t.mechanic ?? "—"}
                </option>
              ))}
            </select>
            <input
              value={partQr}
              onChange={(e) => setPartQr(e.target.value)}
              placeholder="Escanear QR"
              className="field font-data"
            />
            <div className="flex justify-end">
              <Button
                className="w-auto px-4 py-2"
                disabled={busy}
                onClick={() => void despachar()}
              >
                Despachar
              </Button>
            </div>
          </div>
        </BentoPanel>

        <BentoPanel
          title="Inventario"
          subtitle={`${filtered.length} ítems`}
          icon={<Package />}
          className="lg:col-span-7"
          action={
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-brand-text-secondary"
                aria-hidden
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="QR / SKU…"
                className="field w-40 py-1.5 pl-8 pr-2 font-data text-xs sm:w-48"
                aria-label="Buscar inventario"
              />
            </div>
          }
        >
          {!filtered.length ? (
            <EmptyState
              icon={<Package className="h-7 w-7" />}
              title="Sin ítems en vista"
              description="Ajuste la búsqueda o cargue stock al almacén."
            />
          ) : (
            <NexaTable columns={["SKU", "QR", "Stock", "Costo"]}>
              {filtered.map((i) => (
                <NexaRow key={i.id} onClick={() => setPartQr(i.qrCode)}>
                  <NexaCell>
                    <span className="font-data text-xs">{i.sku}</span>
                    <span className="mt-0.5 block font-sans text-[11px] text-brand-text-secondary">
                      {i.name}
                    </span>
                  </NexaCell>
                  <NexaCell mono className="text-[11px] text-brand-text-secondary">
                    {i.qrCode}
                  </NexaCell>
                  <NexaCell>
                    <Badge tone={i.quantity <= 4 ? "danger" : "success"}>
                      {i.quantity} und
                    </Badge>
                  </NexaCell>
                  <NexaCell mono className="text-brand-warning">
                    {i.unitCost.toLocaleString("es-CO")}
                  </NexaCell>
                </NexaRow>
              ))}
            </NexaTable>
          )}
        </BentoPanel>
      </div>
    </div>
  );
}
