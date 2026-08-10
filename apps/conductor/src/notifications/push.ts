import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { apiFetch } from "../api";

type NotificationsModule = typeof import("expo-notifications");
type DeviceModule = typeof import("expo-device");

let notifications: NotificationsModule | null = null;
let device: DeviceModule | null = null;

/** Expo Go (storeClient): push remoto Android removido desde SDK 53 */
function isExpoGo() {
  return (
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
    Constants.appOwnership === "expo"
  );
}

/** Push remoto solo en development/production builds, no en Expo Go Android */
function canUseRemotePush() {
  if (isExpoGo() && Platform.OS === "android") return false;
  return true;
}

async function loadModules() {
  if (!notifications) {
    try {
      notifications = await import("expo-notifications");
    } catch {
      notifications = null;
    }
  }
  if (!device) {
    try {
      device = await import("expo-device");
    } catch {
      device = null;
    }
  }
  return { notifications, device };
}

export async function ensureNotificationHandler() {
  const { notifications: n } = await loadModules();
  if (!n) return;
  n.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

/**
 * Remote push (Expo → FCM/APNs) + registro de token en API.
 * En Expo Go Android se omite a propósito (SDK 53+).
 */
export async function registerForPushAsync(): Promise<string | null> {
  if (!canUseRemotePush()) {
    if (__DEV__) {
      console.info(
        "[INRETRANS] Push remoto omitido en Expo Go (Android). Usa un development build para FCM.",
      );
    }
    return null;
  }

  const { notifications: n, device: d } = await loadModules();
  if (!n || !d) return null;
  if (!d.isDevice) return null;

  const { status: existing } = await n.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== "granted") {
    const { status } = await n.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") return null;

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  try {
    const tokenData = await n.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    const token = tokenData.data;
    await apiFetch("/api/v1/notificaciones/device-token", {
      method: "POST",
      body: JSON.stringify({
        token,
        platform: "EXPO",
      }),
    }).catch(() => undefined);
    return token;
  } catch (err) {
    if (__DEV__) {
      console.warn(
        "[INRETRANS] No se pudo registrar push remoto:",
        err instanceof Error ? err.message : err,
      );
    }
    return null;
  }
}

/** Badge en icono de la app (iOS / Android launchers compatibles) */
export async function setAppBadge(count: number) {
  const { notifications: n } = await loadModules();
  if (!n) return;
  try {
    await n.setBadgeCountAsync(Math.max(0, count));
  } catch {
    /* Android sin launcher badge */
  }
}

/** Notificación local — no requiere servidor ni red */
export async function scheduleLocalReminder(input: {
  title: string;
  body: string;
  seconds?: number;
  data?: Record<string, unknown>;
}): Promise<string | null> {
  const { notifications: n } = await loadModules();
  if (!n) return null;
  try {
    const id = await n.scheduleNotificationAsync({
      content: {
        title: input.title,
        body: input.body,
        data: input.data ?? {},
        sound: true,
      },
      trigger: {
        type: n.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: Math.max(1, input.seconds ?? 1),
        repeats: false,
      },
    });
    return id;
  } catch {
    // Fallback trigger legacy (Expo Go / versiones mixtas)
    try {
      const id = await n.scheduleNotificationAsync({
        content: {
          title: input.title,
          body: input.body,
          data: input.data ?? {},
        },
        trigger: {
          seconds: Math.max(1, input.seconds ?? 1),
          channelId: Platform.OS === "android" ? "default" : undefined,
        } as never,
      });
      return id;
    } catch {
      return null;
    }
  }
}

/** Recordatorio local de salida de viaje (15 min antes o en 30s si ya pasó) */
export async function scheduleTripLocalReminder(trip: {
  id: string;
  code: string;
  departAt?: string | null;
  origin?: string;
}) {
  if (!trip.departAt) return null;
  const depart = new Date(trip.departAt).getTime();
  const fireAt = depart - 15 * 60 * 1000;
  const seconds = Math.max(30, Math.floor((fireAt - Date.now()) / 1000));
  if (seconds > 7 * 24 * 3600) return null;
  return scheduleLocalReminder({
    title: `Salida · ${trip.code}`,
    body: trip.origin
      ? `Recordatorio local — origen ${trip.origin}`
      : "Recordatorio local de despacho",
    seconds,
    data: { tripId: trip.id, kind: "REMINDER", channel: "LOCAL" },
  });
}
