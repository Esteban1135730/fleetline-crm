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
  inspectorContent: ReactNode | null;
  openInspector: (title: string, content: ReactNode) => void;
  closeInspector: () => void;
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
  const [inspectorContent, setInspectorContent] = useState<ReactNode | null>(
    null,
  );
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
  }, []);

  const closeInspector = useCallback(() => {
    setInspectorOpen(false);
    setInspectorContent(null);
    setInspectorTitle("");
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen(true);
      }
      if (e.key === "Escape") {
        setCommandOpen(false);
        setInspectorOpen(false);
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
