type SkeletonProps = {
  className?: string;
};

/** Bloque de carga — reserva el espacio del contenido para evitar saltos de layout. */
export function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div
      aria-hidden
      className={`animate-pulse rounded-md bg-[var(--brand-surface-elevated)] ${className}`}
    />
  );
}

/** Tarjetas con la misma silueta que `KpiCard`; se ubican dentro del grid existente. */
export function SkeletonKpis({ count = 4 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          role="status"
          aria-label="Cargando indicador"
          className="nexa-panel frosted-glass relative w-full min-w-0 overflow-hidden p-4"
        >
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-3 h-9 w-32" />
          <div className="panel-divider mt-3 border-t pt-3">
            <Skeleton className="h-3 w-36" />
          </div>
        </div>
      ))}
    </>
  );
}

/** Filas de carga para tablas y listas. */
export function SkeletonRows({
  rows = 5,
  className = "",
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-label="Cargando datos"
      className={`space-y-2 ${className}`}
    >
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-lg border border-[var(--brand-border)] px-3 py-3"
        >
          <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-2.5 w-3/5" />
          </div>
          <Skeleton className="h-6 w-16 shrink-0" />
        </div>
      ))}
    </div>
  );
}
