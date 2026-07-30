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
import {
  darkTheme,
  lightTheme,
  themeToCssVars,
  type ThemeMode,
} from "@/lib/brand";

const STORAGE_KEY = "flt-theme";

type ThemeCtx = {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  toggle: () => void;
};

const ThemeContext = createContext<ThemeCtx | null>(null);

function applyDomTheme(mode: ThemeMode) {
  const root = document.documentElement;
  root.classList.remove("dark", "light");
  root.classList.add(mode);
  root.dataset.theme = mode;
  const tokens = mode === "dark" ? darkTheme : lightTheme;
  const vars = themeToCssVars(tokens);
  for (const [k, v] of Object.entries(vars)) {
    root.style.setProperty(k, v);
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", tokens.canvas);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("dark");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    const initial: ThemeMode =
      stored === "light" || stored === "dark" ? stored : "dark";
    setModeState(initial);
    applyDomTheme(initial);
  }, []);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    localStorage.setItem(STORAGE_KEY, m);
    applyDomTheme(m);
  }, []);

  const toggle = useCallback(() => {
    setMode(mode === "dark" ? "light" : "dark");
  }, [mode, setMode]);

  const value = useMemo(
    () => ({ mode, setMode, toggle }),
    [mode, setMode, toggle],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { mode, setMode } = useTheme();
  return (
    <div
      className={`theme-toggle ${className}`.trim()}
      role="group"
      aria-label="Modo de visualización"
    >
      <div className="theme-toggle-track">
        <button
          type="button"
          className={`theme-toggle-opt ${mode === "light" ? "is-active" : ""}`}
          onClick={() => setMode("light")}
          aria-pressed={mode === "light"}
          title="Aluminium & Quartz"
        >
          <SunIcon />
          <span className="hidden sm:inline">Claro</span>
        </button>
        <button
          type="button"
          className={`theme-toggle-opt ${mode === "dark" ? "is-active" : ""}`}
          onClick={() => setMode("dark")}
          aria-pressed={mode === "dark"}
          title="Obsidian Telemetry"
        >
          <MoonIcon />
          <span className="hidden sm:inline">Oscuro</span>
        </button>
      </div>
    </div>
  );
}

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="square"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M21 14.5A8.5 8.5 0 0 1 9.5 3 7 7 0 1 0 21 14.5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
