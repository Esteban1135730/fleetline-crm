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

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const stored = localStorage.getItem(SIDEBAR_KEY);
    if (stored === "1" || stored === "0") {
      setSidebarCollapsedState(stored === "1");
    } else {
      setSidebarCollapsedState(!mq.matches);
    }
  }, []);

  const setSidebarCollapsed = useCallback((v: boolean) => {
    setSidebarCollapsedState(v);
    localStorage.setItem(SIDEBAR_KEY, v ? "1" : "0");
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(!sidebarCollapsed);
  }, [sidebarCollapsed, setSidebarCollapsed]);

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
