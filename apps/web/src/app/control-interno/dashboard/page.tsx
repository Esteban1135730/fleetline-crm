"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { api } from "@/lib/api";
import { HowToBox, PageIntro } from "@/components/page-intro";

type TrailItem = {
 id: string;
 at: string;
 action: string;
 entity: string;
 entityId?: string | null;
 user?: { name?: string; email?: string } | null;
 ipAddress?: string | null;
 immutable?: boolean;
};

type Finding = {
 id: string;
 code: string;
 title: string;
 status: string;
 category: string;
 severity: string;
 createdAt: string;
};

type AiFlag = {
 kind: string;
 id: string;
 label: string;
 detail: string;
 severity: "CRITICAL" | "WARN";
 at: string;
};

type HeatRow = {
 plate: string;
 gallonsPaid: number;
 kmGps: number;
 deviationPct: number;
 heatLevel: string;
 anomalyScore: number;
};

type Dash = {
 auditTrail: { trail: TrailItem[]; immutable: boolean };
 findings: Finding[];
 aiFlags: AiFlag[];
 findingStats: { open: number; inDischarge: number; closed: number };
 overridesToday: number;
 fuelHeat: Array<{
 plate: string;
 heatLevel: string;
 deviationPct: number;
 anomalyScore: number;
 }>;
};

const STATUS_LABEL: Record<string, string> = {
 OPEN: "Abierta",
 IN_DISCHARGE: "En Descargos",
 CLOSED_IMPROVEMENT_PLAN: "Cerrada con Plan de Mejora",
};

export default function ControlInternoDashboardPage() {
 const [dash, setDash] = useState<Dash | null>(null);
 const [heat, setHeat] = useState<HeatRow[]>([]);
 const [busy, setBusy] = useState(false);
 const [msg, setMsg] = useState<string | null>(null);
 const [error, setError] = useState<string | null>(null);
 const [title, setTitle] = useState("");

 const load = useCallback(async () => {
 setError(null);
 try {
 const d = await api<Dash>("/api/v1/control-interno/dashboard");
 setDash(d);
 } catch (e) {
 setError((e as Error).message || "Señal perdida — conexión forense");
 }
 }, []);

 const loadFuel = useCallback(async () => {
 try {
 const r = await api<{ heatMap: HeatRow[]; message: string }>(
 "/api/v1/control-interno/combustible/smart-audit?persist=true",
 );
 setHeat(r.heatMap);
 } catch {
 /* soft */
 }
 }, []);

 useEffect(() => {
 void load();
 void loadFuel();
 const t = setInterval(() => void load(), 20_000);
 return () => clearInterval(t);
 }, [load, loadFuel]);

 async function crearHallazgo() {
 if (!title.trim()) return;
 setBusy(true);
 setMsg(null);
 try {
 const res = await api<{ message: string }>(
 "/api/v1/control-interno/hallazgos/crear",
 {
 method: "POST",
 body: JSON.stringify({
 title: title.trim(),
 category: "OPERATIVA",
 severity: "MEDIUM",
 description: "Hallazgo registrado desde control interno",
 }),
 },
 );
 setMsg(res.message);
 setTitle("");
 await load();
 } catch (e) {
 setError((e as Error).message || "No se pudo crear hallazgo");
 } finally {
 setBusy(false);
 }
 }

 async function consolidarOverrides() {
 setBusy(true);
 try {
 const res = await api<{ message: string }>(
 "/api/v1/control-interno/overrides/consolidar-diario",
 { method: "POST", body: "{}" },
 );
 setMsg(res.message);
 await load();
 } catch (e) {
 setError((e as Error).message || "Consolidación fallida");
 } finally {
 setBusy(false);
 }
 }

 return (
 <div className="fade-in mx-auto max-w-[1280px] space-y-5 bg-[var(--bg-canvas)] p-4 text-[var(--text-primary)] md:p-6">
 <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] p-4 shadow-[0_10px_30px_rgba(0,0,0,0.04)] ">
 <PageIntro module="revisoria_fiscal" title="Centro de control interno" />
 <p className="mt-1 text-sm text-[var(--text-secondary)] ">
 Caja negra inmutable · lectura forense · sin mutación operativa
 </p>
 <div className="mt-3 flex flex-wrap gap-2">
 <Badge tone="emerald">Bitácora solo adición</Badge>
 <Badge tone="amber">Excepciones hoy {dash?.overridesToday ?? 0}</Badge>
 <Badge tone="rose">
 Abiertas {dash?.findingStats.open ?? 0}
 </Badge>
 </div>
 </div>

 <HowToBox
 steps={[
 "Caja negra: línea de tiempo de acciones con usuario e IP.",
 "Radar de IA: bloqueos de pagos y anomalías de combustible.",
 "Hallazgos: Abierta → En Descargos → Cerrada con Plan de Mejora.",
 ]}
 />

 {error ? (
 <p className="rounded-xl border border-[#DC2626]/40 bg-[#DC2626]/10 px-4 py-3 text-sm text-[#DC2626]">
 {error}
 </p>
 ) : null}
 {msg ? (
 <p className="rounded-xl border border-[#0D9488]/40 bg-[#0D9488]/10 px-4 py-3 text-sm">
 {msg}
 </p>
 ) : null}

 <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
 {/* Caja Negra */}
 <section
 id="audit-log"
 className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] p-4 "
 >
 <h3 className="font-display text-lg">Caja negra · Rastro de auditoría</h3>
 <p className="text-xs text-[var(--text-secondary)]">
 Inmutable — sin modificar ni borrar desde la API
 </p>
 <ol className="mt-3 max-h-[420px] space-y-2 overflow-y-auto">
 {(dash?.auditTrail.trail ?? []).map((row) => (
 <li
 key={row.id}
 className="rounded-lg border border-[var(--border-subtle)] px-3 py-2 "
 >
 <p className="font-mono text-xs text-[var(--accent-primary)]">
 {new Date(row.at).toLocaleString("es-CO")}
 </p>
 <p className="text-sm font-medium">{row.action}</p>
 <p className="text-xs text-[var(--text-secondary)]">
 {row.entity}
 {row.entityId ? ` · ${row.entityId.slice(0, 8)}` : ""} ·{" "}
 {row.user?.name || "sistema"} · IP{" "}
 {row.ipAddress || "n/a"}
 </p>
 </li>
 ))}
 {(dash?.auditTrail.trail ?? []).length === 0 ? (
 <p className="py-8 text-center text-sm text-[var(--text-secondary)]">
 Sin eventos en la caja negra
 </p>
 ) : null}
 </ol>
 </section>

 {/* Radar anomalías */}
 <section
 id="anomalias"
 className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] p-4 "
 >
 <h3 className="font-display text-lg">Radar de anomalías · Alertas de IA</h3>
 <div className="mt-3 space-y-2">
 {(dash?.aiFlags ?? []).map((f) => (
 <article
 key={`${f.kind}-${f.id}`}
 className={`rounded-lg border px-3 py-3 ${
 f.severity === "CRITICAL"
 ? "border-[#DC2626]/40 bg-[#DC2626]/10"
 : "border-[#D97706]/40 bg-[#D97706]/10"
 }`}
 >
 <div className="flex items-center justify-between">
 <p className="font-mono text-sm">{f.label}</p>
 <Badge tone={f.severity === "CRITICAL" ? "rose" : "amber"}>
 {f.kind}
 </Badge>
 </div>
 <p className="mt-1 text-sm">{f.detail}</p>
 </article>
 ))}
 {(dash?.aiFlags ?? []).length === 0 ? (
 <p className="py-8 text-center text-sm text-[var(--text-secondary)]">
 Sin flags activos
 </p>
 ) : null}
 </div>

 <h4 className="mt-6 font-display text-base">Mapa de calor combustible</h4>
 <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
 {(heat.length ? heat : dash?.fuelHeat ?? []).slice(0, 12).map((h) => (
 <div
 key={h.plate}
 className={`rounded-lg border p-3 font-mono text-xs ${
 h.heatLevel === "RED"
 ? "border-[#DC2626] bg-[#DC2626]/20"
 : h.heatLevel === "AMBER"
 ? "border-[#D97706] bg-[#D97706]/15"
 : "border-[#0D9488]/40 bg-[#0D9488]/10"
 }`}
 >
 <p>{h.plate}</p>
 <p>{h.deviationPct}% · {h.heatLevel}</p>
 </div>
 ))}
 </div>
 <Button
 type="button"
 variant="secondary"
 className="mt-3"
 disabled={busy}
 onClick={() => void loadFuel()}
 >
 Recalcular auditoría
 </Button>
 </section>
 </div>

 {/* Hallazgos */}
 <section
 id="hallazgos"
 className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] p-4 "
 >
 <div className="flex flex-wrap items-center justify-between gap-2">
 <h3 className="font-display text-lg">Gestor de Hallazgos</h3>
 <div className="flex flex-wrap gap-2">
 <Badge tone="rose">Abierta {dash?.findingStats.open ?? 0}</Badge>
 <Badge tone="amber">
 Descargos {dash?.findingStats.inDischarge ?? 0}
 </Badge>
 <Badge tone="emerald">
 Cerrada {dash?.findingStats.closed ?? 0}
 </Badge>
 </div>
 </div>

 <div className="mt-3 flex flex-col gap-2 sm:flex-row">
 <input
 className="field min-h-[48px] flex-1"
 placeholder="Título del hallazgo"
 value={title}
 onChange={(e) => setTitle(e.target.value)}
 />
 <Button
 type="button"
 variant="primary"
 disabled={busy}
 onClick={() => void crearHallazgo()}
 >
 Crear hallazgo
 </Button>
 <Button
 type="button"
 variant="secondary"
 disabled={busy}
 onClick={() => void consolidarOverrides()}
 >
 Consolidar overrides
 </Button>
 </div>

 <ul className="mt-4 space-y-2">
 {(dash?.findings ?? []).map((f) => (
 <li
 key={f.id}
 className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] px-3 py-3 "
 >
 <div>
 <p className="font-mono text-xs text-[#0D9488]">{f.code}</p>
 <p className="text-sm font-medium">{f.title}</p>
 <p className="text-xs text-[var(--text-secondary)]">
 {f.category} · {f.severity}
 </p>
 </div>
 <Badge
 tone={
 f.status === "OPEN"
 ? "rose"
 : f.status === "IN_DISCHARGE"
 ? "amber"
 : "emerald"
 }
 >
 {STATUS_LABEL[f.status] || f.status}
 </Badge>
 </li>
 ))}
 </ul>
 </section>
 </div>
 );
}
