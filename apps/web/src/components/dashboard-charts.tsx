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
import { useThemeColors } from "@/lib/use-theme-colors";

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

type TokenKey =
  | "success"
  | "warning"
  | "danger"
  | "primary"
  | "secondary"
  | "info"
  | "muted";

const TRIP_COLOR: Record<string, TokenKey> = {
  COMPLETED: "success",
  ASSIGNED: "warning",
  PENDING: "warning",
  IN_TRANSIT: "info",
  INCIDENT: "danger",
  CANCELLED: "muted",
};

const FLEET_COLOR: Record<string, TokenKey> = {
  AVAILABLE: "success",
  IN_SERVICE: "info",
  MAINTENANCE: "warning",
  OUT_OF_SERVICE: "danger",
};

function ChartCard({
  title,
  subtitle,
  accent = "primary",
  children,
}: {
  title: string;
  subtitle?: string;
  accent?: TokenKey;
  children: React.ReactNode;
}) {
  const border = {
    primary: "border-t-brand-primary",
    secondary: "border-t-brand-secondary",
    success: "border-t-brand-success",
    warning: "border-t-brand-warning",
    danger: "border-t-brand-danger",
    info: "border-t-brand-info",
    muted: "border-t-brand-info",
  }[accent];

  return (
    <div className={`nexa-panel bento-panel-accent flex h-[320px] flex-col border-t-4 backdrop-blur-md ${border} p-4`}>
      <div className="mb-3">
        <h3 className="font-display text-sm font-bold tracking-tight text-brand-text-primary">
          {title}
        </h3>
        {subtitle ? (
          <p className="mt-0.5 text-[11px] text-brand-text-secondary">{subtitle}</p>
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
  const t = useThemeColors();

  const pick = (key: TokenKey) => {
    const map: Record<TokenKey, string> = {
      success: t.success,
      warning: t.warning,
      danger: t.danger,
      primary: t.primary,
      secondary: t.secondary,
      info: t.info,
      muted: t.chartMuted,
    };
    return map[key] ?? t.primary;
  };

  const tipStyle = {
    borderRadius: 12,
    border: `1px solid ${t.border}`,
    background: t.surface,
    color: t.textPrimary,
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
    fill: [t.primary, t.info, t.warning][i % 3],
  }));

  const nps = data.npsByMonth.map((n) => ({
    month: n.month,
    nps: n.nps ?? 0,
  }));

  const pieColors = useMemo(
    () => [t.success, t.info, t.warning, t.danger, t.primary, t.secondary],
    [t],
  );

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <ChartCard
        title="Dinero de los últimos 6 meses"
        subtitle="Cian = cobrado · Ámbar = por cobrar · Rojo = gastos"
        accent="success"
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data.revenueByMonth}>
            <defs>
              <linearGradient id="gCobrado" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={t.primary} stopOpacity={0.4} />
                <stop offset="100%" stopColor={t.primary} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={t.chartGrid} />
            <XAxis dataKey="month" tick={{ fill: t.textSecondary, fontSize: 11 }} />
            <YAxis
              tick={{ fill: t.textSecondary, fontSize: 11 }}
              label={{
                value: "Millones COP",
                angle: -90,
                position: "insideLeft",
                style: { fill: t.textSecondary, fontSize: 10 },
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
              name="Cobrado"
              stroke={t.primary}
              fill="url(#gCobrado)"
              strokeWidth={2.5}
            />
            <Area
              type="monotone"
              dataKey="porCobrar"
              name="Por cobrar"
              stroke={t.warning}
              fill="transparent"
              strokeWidth={2.5}
            />
            <Area
              type="monotone"
              dataKey="gastos"
              name="Gastos"
              stroke={t.danger}
              fill="transparent"
              strokeWidth={2.5}
              strokeDasharray="5 4"
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Viajes por estado" accent="info">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={trips}>
            <CartesianGrid strokeDasharray="3 3" stroke={t.chartGrid} />
            <XAxis dataKey="name" tick={{ fill: t.textSecondary, fontSize: 10 }} />
            <YAxis allowDecimals={false} tick={{ fill: t.textSecondary, fontSize: 11 }} />
            <Tooltip contentStyle={tipStyle} />
            <Bar dataKey="value" name="Cantidad de viajes" radius={[3, 3, 0, 0]}>
              {trips.map((row, i) => (
                <Cell key={i} fill={row.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Estado de la flota" accent="warning">
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

      <ChartCard title="Satisfacción del cliente" accent="success">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={nps}>
            <CartesianGrid strokeDasharray="3 3" stroke={t.chartGrid} />
            <XAxis dataKey="month" tick={{ fill: t.textSecondary, fontSize: 11 }} />
            <YAxis domain={[0, 5]} tick={{ fill: t.textSecondary, fontSize: 11 }} />
            <Tooltip contentStyle={tipStyle} />
            <Line
              type="monotone"
              dataKey="nps"
              name="Satisfacción"
              stroke={t.primary}
              strokeWidth={3}
              dot={{ r: 5, fill: t.warning, stroke: t.primary, strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Clientes por segmento" accent="primary">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={segments} layout="vertical" margin={{ left: 12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={t.chartGrid} />
            <XAxis
              type="number"
              allowDecimals={false}
              tick={{ fill: t.textSecondary, fontSize: 11 }}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={84}
              tick={{ fill: t.textPrimary, fontSize: 11 }}
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
