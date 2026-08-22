import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  AppState,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { io, type Socket } from "socket.io-client";
import {
  API_URL,
  getToken,
  apiFetch,
} from "../api";
import {
  registerForPushAsync,
  setAppBadge,
  scheduleLocalReminder,
  ensureNotificationHandler,
} from "./push";

export type MobileNotification = {
  id: string;
  kind: string;
  title: string;
  body: string;
  href?: string | null;
  createdAt: string;
  readAt?: string | null;
};

type Banner = MobileNotification & { key: string };

export function NotificationsLayer({
  children,
  enabled,
}: {
  children: ReactNode;
  enabled: boolean;
}) {
  const [banner, setBanner] = useState<Banner | null>(null);
  const [unread, setUnread] = useState(0);
  const opacity = useRef(new Animated.Value(0)).current;
  const socketRef = useRef<Socket | null>(null);

  const refreshUnread = useCallback(async () => {
    if (!enabled) {
      setUnread(0);
      await setAppBadge(0);
      return;
    }
    try {
      const data = await apiFetch<{ count: number }>(
        "/api/v1/notificaciones/unread-count",
      );
      setUnread(data.count);
      await setAppBadge(data.count);
    } catch {
      /* uplink */
    }
  }, [enabled]);

  const showBanner = useCallback(
    (n: MobileNotification) => {
      const key = `${n.id}-${Date.now()}`;
      setBanner({ ...n, key });
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.delay(5200),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 280,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) setBanner((b) => (b?.key === key ? null : b));
      });
    },
    [opacity],
  );

  useEffect(() => {
    if (!enabled) return;
    void ensureNotificationHandler();
    void registerForPushAsync();
    void refreshUnread();

    let cancelled = false;
    void (async () => {
      const token = await getToken();
      if (!token || cancelled) return;
      const socket = io(`${API_URL}/logistics`, {
        auth: { token },
        transports: ["websocket", "polling"],
      });
      socketRef.current = socket;
      socket.emit("joinUser");
      socket.on(
        "notification",
        (payload: { notification?: MobileNotification }) => {
          const n = payload?.notification;
          if (!n?.id) return;
          showBanner(n);
          setUnread((c) => {
            const next = c + 1;
            void setAppBadge(next);
            return next;
          });
          if (AppState.currentState !== "active") {
            void scheduleLocalReminder({
              title: n.title,
              body: n.body,
              data: { notificationId: n.id, kind: n.kind },
              seconds: 1,
            });
          }
        },
      );
    })();

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshUnread();
    });
    const poll = setInterval(() => void refreshUnread(), 60_000);

    return () => {
      cancelled = true;
      sub.remove();
      clearInterval(poll);
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [enabled, refreshUnread, showBanner]);

  return (
    <View style={styles.root}>
      {children}
      {/* Banner inferior: no tapa header ni botones de navegación */}
      {banner ? (
        <Animated.View style={[styles.banner, { opacity }]}>
          <Pressable
            onPress={() => {
              setBanner(null);
              opacity.setValue(0);
            }}
          >
            <View style={styles.bannerTop}>
              <Text style={styles.bannerKind}>{banner.kind}</Text>
              {unread > 0 ? (
                <Text style={styles.badgeInline}>
                  {unread > 99 ? "99+" : unread}
                </Text>
              ) : null}
            </View>
            <Text style={styles.bannerTitle}>{banner.title}</Text>
            <Text style={styles.bannerBody}>{banner.body}</Text>
          </Pressable>
        </Animated.View>
      ) : unread > 0 ? (
        <View style={styles.badgeDock} pointerEvents="none">
          <Text style={styles.badgeText}>
            {unread > 99 ? "99+" : unread} alertas
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  badgeDock: {
    position: "absolute",
    bottom: 24,
    alignSelf: "center",
    zIndex: 40,
    backgroundColor: "#FF2A5F",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  badgeInline: {
    color: "#FF2A5F",
    fontSize: 11,
    fontWeight: "800",
  },
  banner: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 28,
    zIndex: 50,
    backgroundColor: "#121722",
    borderColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    elevation: 8,
  },
  bannerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  bannerKind: {
    color: "#10B981",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  bannerTitle: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "700",
  },
  bannerBody: {
    color: "#94A3B8",
    fontSize: 12,
    marginTop: 4,
  },
});
