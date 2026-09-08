"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { GuidedTour } from "@/components/nexa/guided-tour";
import {
  getShellTour,
  buildModuleTour,
  tourIdForPath,
  type TourDefinition,
} from "@/lib/tour-definitions";
import {
  isTourAutoEnabled,
  isTourSeen,
  markTourSeen,
  resetAllTours,
  resetTour,
  setTourAutoEnabled,
} from "@/lib/tour-storage";
import { useAuth } from "@/lib/auth-context";
import { useShell } from "@/lib/shell-context";

type TourContextValue = {
  active: TourDefinition | null;
  startShellTour: () => void;
  startModuleTour: (pathname?: string) => void;
  startTourForCurrent: () => void;
  replayAll: () => void;
  stopTour: () => void;
  autoEnabled: boolean;
  setAutoEnabled: (v: boolean) => void;
};

const TourContext = createContext<TourContextValue | null>(null);

export function TourProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const { helpOpen, setHelpOpen } = useShell();
  const [active, setActive] = useState<TourDefinition | null>(null);
  const [autoEnabled, setAutoEnabledState] = useState(true);
  const [bootDone, setBootDone] = useState(false);

  useEffect(() => {
    setAutoEnabledState(isTourAutoEnabled());
  }, []);

  const stopTour = useCallback(() => setActive(null), []);

  const startShellTour = useCallback(() => {
    setHelpOpen(false);
    setActive(getShellTour());
  }, [setHelpOpen]);

  const startModuleTour = useCallback(
    (path?: string) => {
      setHelpOpen(false);
      setActive(buildModuleTour(path || pathname));
    },
    [pathname, setHelpOpen],
  );

  const startTourForCurrent = useCallback(() => {
    startModuleTour(pathname);
  }, [pathname, startModuleTour]);

  const replayAll = useCallback(() => {
    resetAllTours();
    setHelpOpen(false);
    setActive(getShellTour());
  }, [setHelpOpen]);

  const setAutoEnabled = useCallback((v: boolean) => {
    setTourAutoEnabled(v);
    setAutoEnabledState(v);
  }, []);

  const onClose = useCallback(
    (completed: boolean) => {
      if (active) {
        // Marcar visto al completar o al omitir (no insistir en la misma sesión)
        markTourSeen(active.id);
        if (active.id === "shell" && completed && autoEnabled) {
          // Tras shell, ofrecer módulo actual
          const moduleId = tourIdForPath(pathname);
          if (!isTourSeen(moduleId)) {
            setActive(null);
            window.setTimeout(() => {
              setActive(buildModuleTour(pathname));
            }, 280);
            return;
          }
        }
      }
      setActive(null);
    },
    [active, autoEnabled, pathname],
  );

  // Auto-start: shell una vez, luego tour del módulo al entrar
  useEffect(() => {
    if (loading || !user || active || helpOpen) return;
    if (pathname === "/login") return;
    if (user.mustChangePassword) return;
    if (!bootDone) {
      setBootDone(true);
      if (!isTourAutoEnabled()) return;
      if (!isTourSeen("shell")) {
        const t = window.setTimeout(() => setActive(getShellTour()), 600);
        return () => window.clearTimeout(t);
      }
    }
    if (!isTourAutoEnabled()) return;
    const moduleId = tourIdForPath(pathname);
    if (moduleId === "login") return;
    if (isTourSeen("shell") && !isTourSeen(moduleId)) {
      const t = window.setTimeout(() => {
        setActive(buildModuleTour(pathname));
      }, 500);
      return () => window.clearTimeout(t);
    }
  }, [loading, user, pathname, active, helpOpen, bootDone]);

  // Cerrar tour si cambian de ruta a mitad
  useEffect(() => {
    if (!active) return;
    if (active.id === "shell") return;
    const currentId = tourIdForPath(pathname);
    if (active.id !== currentId) setActive(null);
  }, [pathname, active]);

  const value = useMemo<TourContextValue>(
    () => ({
      active,
      startShellTour,
      startModuleTour,
      startTourForCurrent,
      replayAll,
      stopTour,
      autoEnabled,
      setAutoEnabled,
    }),
    [
      active,
      startShellTour,
      startModuleTour,
      startTourForCurrent,
      replayAll,
      stopTour,
      autoEnabled,
      setAutoEnabled,
    ],
  );

  return (
    <TourContext.Provider value={value}>
      {children}
      {active ? <GuidedTour tour={active} onClose={onClose} /> : null}
    </TourContext.Provider>
  );
}

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) {
    throw new Error("useTour debe usarse dentro de TourProvider");
  }
  return ctx;
}

/** Hook seguro fuera del provider (páginas públicas) */
export function useTourOptional() {
  return useContext(TourContext);
}

export function requestModuleTourReplay(pathname: string) {
  resetTour(tourIdForPath(pathname));
}
