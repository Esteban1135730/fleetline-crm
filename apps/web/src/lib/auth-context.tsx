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
import { ROLE_VIEWS, normalizeRole, resolveModuleId, type Role } from "@fsg/shared";
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

export function homePathForRole(role: Role | string): string {
  const key = normalizeRole(String(role));
  /** Cockpit operativo por rol (módulos 1–5 + ops) */
  const ROLE_HOME: Partial<Record<string, string>> = {
    platform_master: "/plataforma",
    org_admin: "/usuarios",
    recepcionista: "/recepcion/dashboard",
    lider_ti: "/ti/dashboard",
    gestor_documental: "/archivo/dashboard",
    auxiliar_contable: "/contabilidad/auxiliar/dashboard",
    gestor_contable: "/contabilidad/gestor/dashboard",
    director_financiero: "/finanzas/cfo/dashboard",
    lider_qhse: "/qhse/dashboard",
    qhse: "/qhse/dashboard",
    lider_compras: "/compras/dashboard",
    compras: "/compras/dashboard",
    director_operativo: "/operaciones/director/dashboard",
    gestor_operativo: "/operaciones/despacho/dashboard",
    coordinador_campo: "/operaciones/campo/dashboard",
    operador_centro_control: "/centro-control/dashboard",
    auditor_control_interno: "/control-interno/dashboard",
    control_interno: "/control-interno/dashboard",
    presidente: "/presidencia/dashboard",
    gestor_vinculaciones: "/vinculaciones/dashboard",
    vinculaciones: "/vinculaciones/dashboard",
    director_comercial: "/comercial/director/dashboard",
    gestor_comercial: "/comercial/gestor/dashboard",
    coordinador_comercial: "/comercial/coordinador/dashboard",
    tesoreria: "/tesoreria",
    centro_control: "/centro-control/dashboard",
    conductor: "/pilot",
    coordinador_patio: "/patio/dashboard",
    auxiliar_patio: "/patio/yard-app",
    sub_gerente: "/subgerencia/dashboard",
    presidencia: "/presidencia/dashboard",
    gerente_general: "/gerencia/dashboard",
    director_juridico: "/juridico/dashboard",
    juridico: "/juridico/dashboard",
    revisor_fiscal: "/revisoria-fiscal/dashboard",
    coordinador_taller: "/taller/coordinador/dashboard",
    auxiliar_almacen_taller: "/taller/almacen/dashboard",
    mecanico: "/taller/mecanico",
  };
  if (ROLE_HOME[key]) return ROLE_HOME[key]!;

  const views = ROLE_VIEWS[key] || [];
  const map: Record<string, string> = {
    plataforma: "/plataforma",
    usuarios: "/usuarios",
    presidencia: "/presidencia",
    gerencia: "/gerencia",
    dashboard: "/dashboard",
    logistica: "/logistica/servicios",
    tesoreria: "/tesoreria",
    rrhh: "/rrhh",
    call_center: "/recepcion/dashboard",
    tecnologia_ti: "/ti/dashboard",
    archivo: "/archivo/dashboard",
    contabilidad: "/contabilidad/gestor/dashboard",
    comercial: "/comercial",
    taller: "/taller",
  };
  for (const preferred of [
    "plataforma",
    "call_center",
    "tecnologia_ti",
    "archivo",
    "contabilidad",
    "tesoreria",
    "logistica",
    "usuarios",
    "presidencia",
    "gerencia",
    "comercial",
    "taller",
    "rrhh",
    "dashboard",
  ]) {
    if (views.includes(preferred as never)) return map[preferred];
  }
  const first = views[0];
  if (!first) return "/login";
  return map[first] || `/${first.replace(/_/g, "-")}`;
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
      const resolved = resolveModuleId(view) || view;
      const key = normalizeRole(user.role);
      return (ROLE_VIEWS[key] || []).includes(resolved as never);
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
