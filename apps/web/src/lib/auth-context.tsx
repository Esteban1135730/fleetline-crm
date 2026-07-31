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
import { ROLE_VIEWS, type Role } from "@fsg/shared";
import {
  api,
  clearSession,
  getStoredUser,
  setSession,
  type AuthUser,
} from "@/lib/api";

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (data: {
    organizationName: string;
    nit: string;
    adminName: string;
    adminEmail: string;
    adminPassword: string;
  }) => Promise<AuthUser>;
  logout: () => void;
  /** Primera ruta permitida según el rol del usuario */
  homePath: string;
  canAccess: (view: string) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function homePathForRole(role: Role): string {
  const views = ROLE_VIEWS[role] || [];
  const map: Record<string, string> = {
    dashboard: "/dashboard",
    logistica: "/logistica",
    finanzas: "/finanzas",
    rrhh: "/rrhh",
    atencion: "/atencion",
    sistemas: "/sistemas",
    usuarios: "/usuarios",
    comercial: "/comercial",
    taller: "/taller",
  };
  for (const preferred of [
    "dashboard",
    "logistica",
    "finanzas",
    "rrhh",
    "atencion",
    "sistemas",
    "comercial",
    "taller",
  ]) {
    if (views.includes(preferred as never)) return map[preferred];
  }
  const first = views[0];
  return first ? `/${first}` : "/login";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const stored = getStoredUser();
    if (!stored) {
      setLoading(false);
      return;
    }

    const safety = window.setTimeout(() => {
      if (!cancelled) {
        clearSession();
        setUser(null);
        setLoading(false);
      }
    }, 15_000);

    api<AuthUser>("/auth/me")
      .then((me) => {
        if (cancelled) return;
        setUser(me);
        localStorage.setItem("fsg_user", JSON.stringify(me));
      })
      .catch(() => {
        if (cancelled) return;
        clearSession();
        setUser(null);
      })
      .finally(() => {
        window.clearTimeout(safety);
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      window.clearTimeout(safety);
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<{ accessToken: string; user: AuthUser }>(
      "/auth/login",
      {
        method: "POST",
        body: JSON.stringify({ email: email.toLowerCase().trim(), password }),
      },
    );
    setSession(res.accessToken, res.user);
    setUser(res.user);
    return res.user;
  }, []);

  const register = useCallback(
    async (data: {
      organizationName: string;
      nit: string;
      adminName: string;
      adminEmail: string;
      adminPassword: string;
    }) => {
      const res = await api<{ accessToken: string; user: AuthUser }>(
        "/auth/register",
        {
          method: "POST",
          body: JSON.stringify(data),
        },
      );
      setSession(res.accessToken, res.user);
      setUser(res.user);
      return res.user;
    },
    [],
  );

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  const homePath = user ? homePathForRole(user.role) : "/login";

  const canAccess = useCallback(
    (view: string) => {
      if (!user) return false;
      if (view === "cuenta") return true;
      return (ROLE_VIEWS[user.role] || []).includes(view as never);
    },
    [user],
  );

  const value = useMemo(
    () => ({ user, loading, login, register, logout, homePath, canAccess }),
    [user, loading, login, register, logout, homePath, canAccess],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
