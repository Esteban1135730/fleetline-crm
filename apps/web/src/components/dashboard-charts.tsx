"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { darkTheme, lightTheme } from "@/lib/brand";
import { useTheme } from "@/lib/theme";

const TRIP_LABEL: Record<string, string> = {
  PENDING: "Pendiente",
  ASSIGNED: "Asignado",
  IN_TRANSIT: "En ruta",
  COMPLETED: "Terminado",
  CANCELLED: "Cancelado",
  INCIDENT: "Novedad",
};

const FLEET_LABEL: Record<string, string> = {
  AVAILABLE: "Disponible",
  IN_SERVICE: "En servicio",
  MAINTENANCE: "En taller",
  OUT_OF_SERVICE: "Fuera de servicio",
};

const SEG_LABEL: Record<string, string> = {
  B2B: "Empresas",
  ESCOLAR: "Colegios",
  TURISMO: "Turismo",
};

/** Colores fijos por significado (viajes / flota) */
const TRIP_COLOR: Record<string, "emerald" | "amber" | "info" | "signal" | "primary" | "muted"> = {
  COMPLETED: "emerald",
  ASSIGNED: "amber",
  PENDING: "amber",
  IN_TRANSIT: "info",
  INCIDENT: "signal",
  CANCELLED: "muted",
};

const FLEET_COLOR: Record<string, "emerald" | "info" | "amber" | "signal"> = {
  AVAILABLE: "emerald",
  IN_SERVICE: "info",
  MAINTENANCE: "amber",
  OUT_OF_SERVICE: "signal",
};

function ChartCard({
  title,
  subtitle,
  accent = "primary",
  children,
}: {
  title: string;
  subtitle?: string;
  accent?: "primary" | "emerald" | "amber" | "signal" | "info";
  children: React.ReactNode;
}) {
  const border = {
    primary: "border-t-[var(--brand-primary)]",
    emerald: "border-t-[var(--brand-emerald)]",
    amber: "border-t-[var(--brand-amber)]",
    signal: "border-t-[var(--brand-signal)]",
    info: "border-t-[var(--brand-info)]",
  }[accent];

  return (
    <div className={`fsg-panel flex h-[320px] flex-col border-t-4 ${border} p-4`}>
      <div className="mb-3">
        <h3 className="font-display text-sm font-bold tracking-tight text-[var(--brand-ink)]">
          {title}
        </h3>
        {subtitle ? (
          <p className="mt-0.5 text-[11px] text-[var(--brand-muted)]">{subtitle}</p>
        ) : null}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

export type ChartsPayload = {
  revenueByMonth: {
    month: string;
    cobrado: number;
    porCobrar: number;
    gastos: number;
  }[];
  tripsByStatus: { status: string; count: number }[];
  fleetByStatus: { status: string; count: number }[];
  customersBySegment: { segment: string; count: number }[];
  npsByMonth: { month: string; nps: number | null }[];
};

export function DashboardCharts({ data }: { data: ChartsPayload }) {
  const { mode } = useTheme();
  const t = mode === "dark" ? darkTheme : lightTheme;

  const pick = (key: string) => {
    const map: Record<string, string> = {
      emerald: t.emerald,
      amber: t.amber,
      signal: t.signal,
      primary: t.primary,
      info: t.info,
      muted: t.muted,
      lime: t.lime,
    };
    return map[key] || t.primary;
  };

  const tipStyle = {
    borderRadius: 12,
    border: `1px solid ${mode === "dark" ? "#212D42" : "#E2E8F0"}`,
    background: t.surface,
    color: t.ink,
    fontSize: 12,
  };

  const trips = data.tripsByStatus.map((row) => ({
    name: TRIP_LABEL[row.status] || row.status,
    value: row.count,
    fill: pick(TRIP_COLOR[row.status] || "primary"),
  }));

  const fleet = data.fleetByStatus.map((row) => ({
    name: FLEET_LABEL[row.status] || row.status,
    value: row.count,
    fill: pick(FLEET_COLOR[row.status] || "primary"),
  }));

  const segments = data.customersBySegment.map((c, i) => ({
    name: SEG_LABEL[c.segment] || c.segment,
    value: c.count,
    fill: [t.primary, t.info, t.amber][i % 3],
  }));

  const nps = data.npsByMonth.map((n) => ({
    month: n.month,
    nps: n.nps ?? 0,
  }));

  const pieColors = useMemo(
    () => [t.emerald, t.info, t.amber, t.signal, t.primary, t.lime],
    [t],
  );

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <ChartCard
        title="Dinero de los últimos 6 meses"
        subtitle="Turquesa = cobrado · Dorado = por cobrar · Magenta = gastos"
        accent="emerald"
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data.revenueByMonth}>
            <defs>
              <linearGradient id="gCobrado" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={t.primary} stopOpacity={0.4} />
                <stop offset="100%" stopColor={t.primary} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={mode === "dark" ? "#212D42" : "#E2E8F0"} />
            <XAxis dataKey="month" tick={{ fill: t.muted, fontSize: 11 }} />
            <YAxis
              tick={{ fill: t.muted, fontSize: 11 }}
              label={{
                value: "Millones COP",
                angle: -90,
                position: "insideLeft",
                style: { fill: t.muted, fontSize: 10 },
              }}
            />
            <Tooltip
              contentStyle={tipStyle}
              formatter={(value: number, name: string) => [
                `$${value}M`,
                name,
              ]}
            />
            <Legend />
            <Area
              type="monotone"
              dataKey="cobrado"
              name="Cobrado (turquesa)"
              stroke={t.primary}
              fill="url(#gCobrado)"
              strokeWidth={2.5}
            />
            <Area
              type="monotone"
              dataKey="porCobrar"
              name="Por cobrar (dorado)"
              stroke={t.amber}
              fill="transparent"
              strokeWidth={2.5}
            />
            <Area
              type="monotone"
              dataKey="gastos"
              name="Gastos (magenta)"
              stroke={t.signal}
              fill="transparent"
              strokeWidth={2.5}
              strokeDasharray="5 4"
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Viajes por estado"
        subtitle="Turquesa OK · Índigo en ruta · Dorado pendiente · Magenta novedad"
        accent="info"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={trips}>
            <CartesianGrid strokeDasharray="3 3" stroke={t.line} />
            <XAxis dataKey="name" tick={{ fill: t.muted, fontSize: 10 }} />
            <YAxis allowDecimals={false} tick={{ fill: t.muted, fontSize: 11 }} />
            <Tooltip contentStyle={tipStyle} />
            <Bar dataKey="value" name="Cantidad de viajes" radius={[3, 3, 0, 0]}>
              {trips.map((row, i) => (
                <Cell key={i} fill={row.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Estado de la flota"
        subtitle="Turquesa libre · Índigo en servicio · Dorado taller · Magenta fuera"
        accent="amber"
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={fleet}
              dataKey="value"
              nameKey="name"
              innerRadius={52}
              outerRadius={88}
              paddingAngle={3}
            >
              {fleet.map((row, i) => (
                <Cell key={i} fill={row.fill || pieColors[i % pieColors.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={tipStyle} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Satisfacción del cliente (NPS)"
        subtitle="Promedio mensual · escala de 0 a 5"
        accent="emerald"
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={nps}>
            <CartesianGrid strokeDasharray="3 3" stroke={t.line} />
            <XAxis dataKey="month" tick={{ fill: t.muted, fontSize: 11 }} />
            <YAxis domain={[0, 5]} tick={{ fill: t.muted, fontSize: 11 }} />
            <Tooltip contentStyle={tipStyle} />
            <Line
              type="monotone"
              dataKey="nps"
              name="Puntaje NPS"
              stroke={t.primary}
              strokeWidth={3}
              dot={{ r: 5, fill: t.amber, stroke: t.primary, strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Clientes por segmento"
        subtitle="Turquesa · Índigo · Dorado por segmento"
        accent="primary"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={segments} layout="vertical" margin={{ left: 12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={t.line} />
            <XAxis
              type="number"
              allowDecimals={false}
              tick={{ fill: t.muted, fontSize: 11 }}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={84}
              tick={{ fill: t.ink, fontSize: 11 }}
            />
            <Tooltip contentStyle={tipStyle} />
            <Bar dataKey="value" name="Clientes" radius={[0, 3, 3, 0]}>
              {segments.map((row, i) => (
                <Cell key={i} fill={row.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
