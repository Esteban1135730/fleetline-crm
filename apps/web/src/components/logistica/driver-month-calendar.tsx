"use client";

import { useMemo } from "react";
import { Button } from "@fsg/ui";
import { colombianHolidayName } from "@/components/logistica/co-holidays";
import {
  NOVELTY_KINDS,
  type CalendarPayload,
} from "@/components/logistica/logistica-shared";

const WEEKDAYS = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"] as const;

const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

function noveltyLabel(kind: string) {
  return NOVELTY_KINDS.find((k) => k.value === kind)?.label ?? kind;
}

function chipClass(kind: "holiday" | "trip" | "novelty" | string) {
  switch (kind) {
    case "holiday":
      return "bg-[var(--brand-amber)] text-[#1a1200]";
    case "trip":
    case "ASSIGNED":
      return "bg-[var(--brand-primary)]/20 text-[var(--brand-primary)]";
    case "INCAPACITY":
      return "bg-[var(--brand-signal)]/20 text-[var(--brand-signal)]";
    case "VACATION_PAID":
      return "bg-[var(--brand-amber)]/25 text-[var(--brand-amber)]";
    case "REST":
      return "bg-slate-500/20 text-[var(--brand-muted)]";
    case "UNJUSTIFIED_ABSENCE":
      return "bg-[var(--brand-signal)]/35 text-[var(--brand-signal)]";
    case "AVAILABLE_NO_CONTRACT":
      return "bg-cyan-500/15 text-cyan-400";
    default:
      return "bg-[var(--brand-primary)]/15 text-[var(--brand-primary)]";
  }
}

type DayCell = {
  key: string;
  year: number;
  month: number;
  day: number;
  inMonth: boolean;
  isToday: boolean;
};

function buildGrid(year: number, month: number): DayCell[] {
  const first = new Date(year, month - 1, 1);
  const startPad = first.getDay(); // 0 = domingo
  const daysInMonth = new Date(year, month, 0).getDate();
  const prevDays = new Date(year, month - 1, 0).getDate();
  const cells: DayCell[] = [];
  const today = new Date();

  for (let i = 0; i < startPad; i++) {
    const day = prevDays - startPad + 1 + i;
    const m = month === 1 ? 12 : month - 1;
    const y = month === 1 ? year - 1 : year;
    cells.push({
      key: `p-${y}-${m}-${day}`,
      year: y,
      month: m,
      day,
      inMonth: false,
      isToday: false,
    });
  }

  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({
      key: `c-${year}-${month}-${day}`,
      year,
      month,
      day,
      inMonth: true,
      isToday:
        today.getFullYear() === year &&
        today.getMonth() + 1 === month &&
        today.getDate() === day,
    });
  }

  let next = 1;
  while (cells.length % 7 !== 0 || cells.length < 42) {
    const m = month === 12 ? 1 : month + 1;
    const y = month === 12 ? year + 1 : year;
    cells.push({
      key: `n-${y}-${m}-${next}`,
      year: y,
      month: m,
      day: next,
      inMonth: false,
      isToday: false,
    });
    next += 1;
    if (cells.length >= 42) break;
  }

  return cells;
}

function sameLocalDay(iso: string, y: number, m: number, d: number) {
  const dt = new Date(iso);
  return (
    dt.getFullYear() === y && dt.getMonth() + 1 === m && dt.getDate() === d
  );
}

function coversDay(
  fromIso: string,
  toIso: string,
  y: number,
  m: number,
  d: number,
) {
  const dayStart = new Date(y, m - 1, d, 0, 0, 0, 0);
  const dayEnd = new Date(y, m - 1, d, 23, 59, 59, 999);
  return new Date(fromIso) <= dayEnd && new Date(toIso) >= dayStart;
}

export function DriverMonthCalendar({
  calendar,
  driverId,
  driverName,
  year,
  month,
  onPrev,
  onNext,
  onToday,
  onClose,
  onTripClick,
}: {
  calendar: CalendarPayload;
  driverId: string;
  driverName: string;
  year: number;
  month: number;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onClose: () => void;
  onTripClick?: (tripId: string) => void;
}) {
  const cells = useMemo(() => buildGrid(year, month), [year, month]);

  const eventsByKey = useMemo(() => {
    const map = new Map<
      string,
      Array<{ id: string; label: string; kind: string; title?: string }>
    >();

    const push = (
      y: number,
      m: number,
      d: number,
      ev: { id: string; label: string; kind: string; title?: string },
    ) => {
      const k = `${y}-${m}-${d}`;
      const arr = map.get(k) ?? [];
      arr.push(ev);
      map.set(k, arr);
    };

    for (const n of calendar.novelties) {
      if (n.driverId !== driverId) continue;
      for (const cell of cells) {
        if (!cell.inMonth) continue;
        if (!coversDay(n.dateFrom, n.dateTo, cell.year, cell.month, cell.day))
          continue;
        push(cell.year, cell.month, cell.day, {
          id: n.id + cell.key,
          label: noveltyLabel(n.kind),
          kind: n.kind,
        });
      }
    }

    for (const t of calendar.trips) {
      if (t.driverId !== driverId) continue;
      for (const cell of cells) {
        if (!cell.inMonth) continue;
        if (!sameLocalDay(t.departAt, cell.year, cell.month, cell.day))
          continue;
        const time = new Date(t.departAt).toLocaleTimeString("es-CO", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
        const plate = t.vehicle?.plate ? ` · ${t.vehicle.plate}` : "";
        const route =
          t.origin && t.destination
            ? `${t.origin} → ${t.destination}`
            : t.code;
        push(cell.year, cell.month, cell.day, {
          id: t.id,
          label: `${time} ${t.code}${plate}`,
          kind: "trip",
          title: route,
        });
      }
    }

    return map;
  }, [calendar, cells, driverId]);

  return (
    <div
      className="fsg-panel overflow-hidden p-0"
      data-testid="driver-month-calendar"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--brand-line)] px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" onClick={onToday}>
            Hoy
          </Button>
          <Button variant="ghost" onClick={onPrev} aria-label="Mes anterior">
            ←
          </Button>
          <Button variant="ghost" onClick={onNext} aria-label="Mes siguiente">
            →
          </Button>
          <h2 className="ml-1 text-lg font-semibold tracking-tight text-[var(--brand-fg)]">
            {MONTH_NAMES[month - 1]} de {year}
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-md border border-[var(--brand-line)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--brand-muted)]">
            Mes
          </span>
          <span className="text-sm text-[var(--brand-muted)]">
            {driverName}
          </span>
          <Button variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 border-b border-[var(--brand-line)] bg-[var(--brand-surface,#121722)]">
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            className="px-2 py-2 text-center font-data text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--brand-muted)]"
          >
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 auto-rows-[minmax(110px,1fr)]">
        {cells.map((cell) => {
          const key = `${cell.year}-${cell.month}-${cell.day}`;
          const events = eventsByKey.get(key) ?? [];
          const visible = events.slice(0, 4);
          const more = events.length - visible.length;
          const isFestivo =
            cell.inMonth &&
            colombianHolidayName(cell.year, cell.month, cell.day) != null;

          return (
            <div
              key={cell.key}
              className={`min-h-[110px] border-b border-r border-[var(--brand-line)] p-1.5 ${
                isFestivo
                  ? "bg-[var(--brand-amber)]"
                  : cell.inMonth
                    ? "bg-[var(--brand-canvas,#0A0D14)]"
                    : "bg-[var(--brand-surface,#121722)]/50"
              }`}
            >
              <div className="mb-1 flex justify-center">
                <span
                  className={`flex h-7 w-7 items-center justify-center font-data text-xs ${
                    cell.isToday
                      ? "rounded-full bg-[var(--brand-primary)] font-semibold text-[#04110c]"
                      : cell.inMonth
                        ? isFestivo
                          ? "font-semibold text-[#1a1200]"
                          : "text-[var(--brand-fg)]"
                        : "text-[var(--brand-muted)]/50"
                  }`}
                >
                  {cell.day}
                </span>
              </div>
              {isFestivo ? (
                <div className="mb-1 rounded px-1.5 py-0.5 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-[#1a1200]">
                  Festivo
                </div>
              ) : null}
              <div className="space-y-0.5">
                {visible.map((ev) =>
                  ev.kind === "trip" && onTripClick ? (
                    <button
                      key={ev.id}
                      type="button"
                      title={ev.title || ev.label}
                      onClick={() => onTripClick(ev.id)}
                      className={`block w-full truncate rounded px-1.5 py-0.5 text-left text-[10px] font-medium leading-tight transition hover:brightness-125 ${chipClass(ev.kind)}`}
                    >
                      {ev.label}
                    </button>
                  ) : (
                    <div
                      key={ev.id}
                      title={ev.title || ev.label}
                      className={`truncate rounded px-1.5 py-0.5 text-[10px] font-medium leading-tight ${chipClass(ev.kind)}`}
                    >
                      {ev.label}
                    </div>
                  ),
                )}
                {more > 0 ? (
                  <div className="px-1 font-data text-[10px] text-[var(--brand-muted)]">
                    +{more} más
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3 border-t border-[var(--brand-line)] px-4 py-2 text-[10px] text-[var(--brand-muted)]">
        <span className={`rounded px-2 py-0.5 ${chipClass("holiday")}`}>
          Festivo
        </span>
        <span className={`rounded px-2 py-0.5 ${chipClass("trip")}`}>
          Servicio asignado
        </span>
        <span className={`rounded px-2 py-0.5 ${chipClass("INCAPACITY")}`}>
          Incapacidad
        </span>
        <span className={`rounded px-2 py-0.5 ${chipClass("VACATION_PAID")}`}>
          Vacaciones
        </span>
        <span className={`rounded px-2 py-0.5 ${chipClass("REST")}`}>
          Descanso
        </span>
      </div>
    </div>
  );
}
