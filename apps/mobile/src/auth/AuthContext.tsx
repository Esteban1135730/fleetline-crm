import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { setApiHandlers } from "../api/client";
import { fetchMe, login as apiLogin } from "../api/endpoints";
import {
  clearSession,
  getStoredUser,
  getToken,
  isTokenExpired,
} from "./session";
import type { AuthUser } from "../types";

type AuthContextValue = {
  user: AuthUser | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  const logout = useCallback(async () => {
    await clearSession();
    setUser(null);
  }, []);

  useEffect(() => {
    setApiHandlers({
      onUnauthorized: () => {
        void logout();
      },
    });
  }, [logout]);

  useEffect(() => {
    void (async () => {
      const token = await getToken();
      if (!token || isTokenExpired(token)) {
        await clearSession();
        setUser(null);
        setReady(true);
        return;
      }
      const stored = await getStoredUser();
      setUser(stored);
      try {
        const me = await fetchMe();
        setUser(me);
      } catch {
        /* offline: usar sesión cacheada */
      }
      setReady(true);
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { user: u } = await apiLogin(email, password);
    setUser(u);
    return u;
  }, []);

  const refreshUser = useCallback(async () => {
    const me = await fetchMe();
    setUser(me);
  }, []);

  const value = useMemo(
    () => ({ user, ready, login, logout, refreshUser }),
    [user, ready, login, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth fuera de AuthProvider");
  return ctx;
}
