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

const CRISIS_KEY = "nexa-crisis-active";

type ShellCtx = {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
  toggleSidebar: () => void;
  inspectorOpen: boolean;
  inspectorTitle: string;
  /** Slot UI del inspector (any evita conflicto de @types/react duplicados en monorepo). */
  inspectorContent: any;
  openInspector: (title: string, content: ReactNode) => void;
  closeInspector: () => void;
  helpOpen: boolean;
  setHelpOpen: (v: boolean) => void;
  toggleHelp: () => void;
  commandOpen: boolean;
  setCommandOpen: (v: boolean) => void;
  systemStatus: "NOMINAL" | "ALERT" | "OFFLINE";
  setSystemStatus: (s: "NOMINAL" | "ALERT" | "OFFLINE") => void;
  /** PRE-01: protocolo de crisis persiste al cambiar de área */
  crisisActive: boolean;
  crisisCode: string | null;
  setCrisisActive: (active: boolean, code?: string | null) => void;
};

const ShellContext = createContext<ShellCtx | null>(null);
const SIDEBAR_KEY = "flt-sidebar-collapsed";

export function ShellProvider({ children }: { children: ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsedState] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorTitle, setInspectorTitle] = useState("");
  const [inspectorContent, setInspectorContent] = useState<any>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [systemStatus, setSystemStatus] = useState<
    "NOMINAL" | "ALERT" | "OFFLINE"
  >("NOMINAL");
  const [crisisActive, setCrisisActiveState] = useState(false);
  const [crisisCode, setCrisisCode] = useState<string | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const stored = localStorage.getItem(SIDEBAR_KEY);
    if (stored === "1" || stored === "0") {
      setSidebarCollapsedState(stored === "1");
    } else {
      setSidebarCollapsedState(!mq.matches);
    }
    try {
      const raw = sessionStorage.getItem(CRISIS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { active?: boolean; code?: string };
        if (parsed.active) {
          setCrisisActiveState(true);
          setCrisisCode(parsed.code ?? null);
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  const setSidebarCollapsed = useCallback((v: boolean) => {
    setSidebarCollapsedState(v);
    localStorage.setItem(SIDEBAR_KEY, v ? "1" : "0");
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(!sidebarCollapsed);
  }, [sidebarCollapsed, setSidebarCollapsed]);

  const setCrisisActive = useCallback(
    (active: boolean, code?: string | null) => {
      setCrisisActiveState(active);
      const nextCode = active ? code ?? null : null;
      setCrisisCode(nextCode);
      if (active) {
        sessionStorage.setItem(
          CRISIS_KEY,
          JSON.stringify({ active: true, code: nextCode }),
        );
      } else {
        sessionStorage.removeItem(CRISIS_KEY);
      }
    },
    [],
  );

  const openInspector = useCallback((title: string, content: ReactNode) => {
    setInspectorTitle(title);
    setInspectorContent(content);
    setInspectorOpen(true);
    setHelpOpen(false);
  }, []);

  const closeInspector = useCallback(() => {
    setInspectorOpen(false);
    setInspectorContent(null);
    setInspectorTitle("");
  }, []);

  const toggleHelp = useCallback(() => {
    setHelpOpen((v) => {
      const next = !v;
      if (next) setInspectorOpen(false);
      return next;
    });
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen(true);
      }
      if (isMod && e.key === "/") {
        e.preventDefault();
        setHelpOpen((v) => !v);
      }
      if (e.key === "Escape") {
        setCommandOpen(false);
        setInspectorOpen(false);
        setHelpOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = useMemo(
    () => ({
      sidebarCollapsed,
      setSidebarCollapsed,
      toggleSidebar,
      inspectorOpen,
      inspectorTitle,
      inspectorContent,
      openInspector,
      closeInspector,
      helpOpen,
      setHelpOpen,
      toggleHelp,
      commandOpen,
      setCommandOpen,
      systemStatus,
      setSystemStatus,
      crisisActive,
      crisisCode,
      setCrisisActive,
    }),
    [
      sidebarCollapsed,
      setSidebarCollapsed,
      toggleSidebar,
      inspectorOpen,
      inspectorTitle,
      inspectorContent,
      openInspector,
      closeInspector,
      helpOpen,
      toggleHelp,
      commandOpen,
      systemStatus,
      crisisActive,
      crisisCode,
      setCrisisActive,
    ],
  );

  return (
    <ShellContext.Provider value={value}>{children}</ShellContext.Provider>
  );
}

export function useShell() {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used within ShellProvider");
  return ctx;
}
