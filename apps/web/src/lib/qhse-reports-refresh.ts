/**
 * Pub/sub ligero para refrescar reportes QHSE tras mutaciones.
 * El proyecto no usa React Query/SWR: el patrón es useState + load().
 */

type Listener = () => void;

const listeners = new Set<Listener>();

export function subscribeQhseReports(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Notifica a pantallas QHSE (listado + dashboard) para recargar consultas. */
export function notifyQhseReportsChanged(): void {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      /* noop — un listener no debe romper a los demás */
    }
  });
}
