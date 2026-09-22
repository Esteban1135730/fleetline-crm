import type { ReactNode } from "react";

type NexaTableProps = {
  columns: string[];
  children: ReactNode;
  className?: string;
};

/** Tabla densa — cristal esmerilado, thead flotante, filas extruidas. */
export function NexaTable({ columns, children, className = "" }: NexaTableProps) {
  return (
    <div
      className={`data-shell frosted-glass max-h-[min(70vh,40rem)] overflow-auto rounded-lg ${className}`}
    >
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-brand-surface-elevated/60 backdrop-blur-md">
          <tr className="border-b border-brand-border/50">
            {columns.map((col) => (
              <th
                key={col}
                className="panel-header-mono px-3 py-2.5 text-left"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">{children}</tbody>
      </table>
    </div>
  );
}

type NexaRowProps = {
  children: ReactNode;
  onClick?: () => void;
  active?: boolean;
};

export function NexaRow({ children, onClick, active }: NexaRowProps) {
  return (
    <tr
      onClick={onClick}
      className={`border-l-2 border-l-transparent transition-all duration-[250ms] ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-px hover:border-l-brand-primary hover:bg-brand-surface-hover/80 ${
        onClick ? "cursor-pointer" : ""
      } ${active ? "border-l-brand-primary bg-brand-surface-hover/80" : ""}`}
    >
      {children}
    </tr>
  );
}

export function NexaCell({
  children,
  mono = false,
  className = "",
}: {
  children: ReactNode;
  mono?: boolean;
  className?: string;
}) {
  if (mono) {
    return (
      <td className={`px-3 py-2.5 ${className}`}>
        <span className="lcd-pill font-data tabular-nums kpi-depth text-brand-text-primary">
          {children}
        </span>
      </td>
    );
  }

  return (
    <td className={`px-3 py-2.5 font-sans text-brand-text-primary ${className}`}>
      {children}
    </td>
  );
}
