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
import { io, type Socket } from "socket.io-client";
import { api, API_URL, getTokenPublic } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export type AppNotification = {
  id: string;
  kind: string;
  title: string;
  body: string;
  href?: string | null;
  payload?: unknown;
  createdAt: string;
  readAt?: string | null;
  channels?: string[];
};

type ToastItem = AppNotification & { toastId: string };

type Ctx = {
  items: AppNotification[];
  unread: number;
  toasts: ToastItem[];
  loading: boolean;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  dismissToast: (toastId: string) => void;
  enableWebPush: () => Promise<{ ok: boolean; message: string }>;
  webPushSupported: boolean;
};

const NotificationsContext = createContext<Ctx | null>(null);

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setItems([]);
      setUnread(0);
      return;
    }
    setLoading(true);
    try {
      const [list, count] = await Promise.all([
        api<AppNotification[]>("/notificaciones?take=50"),
        api<{ count: number }>("/notificaciones/unread-count"),
      ]);
      setItems(list);
      setUnread(count.count);
    } catch {
      /* sesión / uplink */
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!user) return;
    const token = getTokenPublic();
    if (!token) return;

    const socket: Socket = io(`${API_URL}/logistics`, {
      auth: { token },
      transports: ["websocket", "polling"],
    });
    socket.emit("joinUser");
    socket.on(
      "notification",
      (payload: { notification?: AppNotification }) => {
        const n = payload?.notification;
        if (!n?.id) return;
        setItems((prev) => [n, ...prev.filter((x) => x.id !== n.id)].slice(0, 50));
        setUnread((c) => c + 1);
        const toastId = `${n.id}-${Date.now()}`;
        setToasts((t) => [{ ...n, toastId }, ...t].slice(0, 4));
        window.setTimeout(() => {
          setToasts((t) => t.filter((x) => x.toastId !== toastId));
        }, 7000);
      },
    );

    const poll = window.setInterval(() => void refresh(), 60_000);
    return () => {
      window.clearInterval(poll);
      socket.disconnect();
    };
  }, [user, refresh]);

  const markRead = useCallback(async (id: string) => {
    await api(`/notificaciones/${id}/read`, { method: "PATCH", body: "{}" });
    setItems((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, readAt: new Date().toISOString() } : n,
      ),
    );
    setUnread((c) => Math.max(0, c - 1));
  }, []);

  const markAllRead = useCallback(async () => {
    await api("/notificaciones/read-all", { method: "POST", body: "{}" });
    setItems((prev) =>
      prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })),
    );
    setUnread(0);
  }, []);

  const dismissToast = useCallback((toastId: string) => {
    setToasts((t) => t.filter((x) => x.toastId !== toastId));
  }, []);

  const enableWebPush = useCallback(async () => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return { ok: false, message: "Este navegador no soporta Service Worker" };
    }
    if (!("PushManager" in window)) {
      return { ok: false, message: "Este navegador no soporta Web Push" };
    }
    try {
      const { publicKey } = await api<{ publicKey: string | null }>(
        "/notificaciones/vapid-public-key",
      );
      if (!publicKey) {
        return {
          ok: false,
          message:
            "Web Push listo en cliente — configura VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY en el API",
        };
      }
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        return { ok: false, message: "Permiso de notificaciones denegado" };
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const json = sub.toJSON();
      await api("/notificaciones/web-push/subscribe", {
        method: "POST",
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
          userAgent: navigator.userAgent,
        }),
      });
      return { ok: true, message: "Web Push activado" };
    } catch (e) {
      return {
        ok: false,
        message: e instanceof Error ? e.message : "No se pudo activar Web Push",
      };
    }
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      items,
      unread,
      toasts,
      loading,
      refresh,
      markRead,
      markAllRead,
      dismissToast,
      enableWebPush,
      webPushSupported:
        typeof window !== "undefined" &&
        "Notification" in window &&
        "PushManager" in window,
    }),
    [
      items,
      unread,
      toasts,
      loading,
      refresh,
      markRead,
      markAllRead,
      dismissToast,
      enableWebPush,
    ],
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error("useNotifications requiere NotificationsProvider");
  }
  return ctx;
}
