"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { api } from "@/lib/api";
import { HowToBox, PageIntro } from "@/components/page-intro";

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
    <div className="space-y-8">
      <PageIntro module="taller" title="Almacén del taller" />
      <HowToBox
        steps={[
          "Busque por QR/SKU y despache al mecánico en un toque.",
          "El costo se imputa al centro de costos de la placa.",
          "Stock se descuenta en tiempo real (antifraude QR).",
        ]}
      />

      {error && (
        <p className="font-mono text-sm text-[var(--fl-critical)]">{error}</p>
      )}
      {msg && (
        <p className="font-mono text-sm text-[var(--fl-accent)]">{msg}</p>
      )}

      <section id="despacho" className="space-y-3 rounded-xl border border-[var(--fl-border)] bg-[var(--fl-surface)] p-5">
        <h2 className="text-lg font-semibold text-[var(--fl-text)]">
          Despacho rápido POS
        </h2>
        <div className="flex flex-wrap gap-2">
          <select
            value={workOrderId}
            onChange={(e) => setWorkOrderId(e.target.value)}
            className="rounded-lg border border-[var(--fl-border)] bg-[var(--fl-canvas)] px-3 py-2 font-mono text-sm"
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
            className="min-w-[200px] flex-1 rounded-lg border border-[var(--fl-border)] bg-[var(--fl-canvas)] px-3 py-2 font-mono text-sm"
          />
          <Button disabled={busy} onClick={() => void despachar()}>
            Despachar
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-[var(--fl-text)]">
            Inventario
          </h2>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar QR / SKU…"
            className="rounded-lg border border-[var(--fl-border)] bg-[var(--fl-surface)] px-3 py-2 font-mono text-sm"
          />
        </div>
        <ul className="grid gap-2 md:grid-cols-2">
          {filtered.map((i) => (
            <li
              key={i.id}
              className="flex cursor-pointer items-center justify-between rounded-lg border border-[var(--fl-border)] bg-[var(--fl-surface)] px-4 py-3"
              onClick={() => setPartQr(i.qrCode)}
            >
              <div>
                <p className="font-mono text-sm text-[var(--fl-text)]">
                  {i.sku} · {i.name}
                </p>
                <p className="font-mono text-[10px] text-[var(--fl-subtext)]">
                  {i.qrCode}
                </p>
              </div>
              <div className="text-right">
                <Badge tone={i.quantity <= 4 ? "rose" : "emerald"}>
                  {i.quantity} und
                </Badge>
                <p className="mt-1 font-mono text-[10px] text-[var(--fl-amber)]">
                  {i.unitCost.toLocaleString("es-CO")}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
