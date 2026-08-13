import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import type { SyncQueueItem, SyncOpType } from "../types";
import { apiFetch } from "../api/client";
import { syncOfflineBoardings } from "../api/endpoints";

const QUEUE_KEY = "fleetline_sync_queue_v1";

export async function newClientEventId(): Promise<string> {
  if (typeof Crypto.randomUUID === "function") {
    return Crypto.randomUUID();
  }
  const bytes = await Crypto.getRandomBytesAsync(16);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export async function readQueue(): Promise<SyncQueueItem[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SyncQueueItem[];
  } catch {
    return [];
  }
}

async function writeQueue(items: SyncQueueItem[]) {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

export async function enqueue(
  type: SyncOpType,
  path: string,
  method: "POST" | "PATCH",
  body: Record<string, unknown>,
): Promise<SyncQueueItem> {
  const item: SyncQueueItem = {
    id: await newClientEventId(),
    type,
    path,
    method,
    body,
    createdAt: new Date().toISOString(),
    retries: 0,
  };
  const q = await readQueue();
  q.push(item);
  await writeQueue(q);
  return item;
}

export type SyncResult = {
  pending: number;
  synced: number;
  failed: number;
};

type Listener = (pending: number) => void;
const listeners = new Set<Listener>();

export function subscribeQueue(listener: Listener) {
  listeners.add(listener);
  void readQueue().then((q) => listener(q.length));
  return () => {
    listeners.delete(listener);
  };
}

async function notify() {
  const q = await readQueue();
  listeners.forEach((l) => l(q.length));
}

/**
 * Motor de sincronización — Last-Write-Wins vía orden FIFO.
 * Abordajes usan endpoint batch nativo del backend.
 */
export async function flushSyncQueue(): Promise<SyncResult> {
  const q = await readQueue();
  if (!q.length) return { pending: 0, synced: 0, failed: 0 };

  const abordajes = q.filter((i) => i.type === "abordaje");
  const rest = q.filter((i) => i.type !== "abordaje");

  let synced = 0;
  let failed = 0;
  const remaining: SyncQueueItem[] = [];

  if (abordajes.length) {
    try {
      await syncOfflineBoardings(
        abordajes.map((a) => ({
          ...a.body,
          clientEventId: String(a.body.clientEventId ?? a.id),
          capturedAt: a.body.capturedAt ?? a.createdAt,
        })),
      );
      synced += abordajes.length;
    } catch (err) {
      failed += abordajes.length;
      for (const a of abordajes) {
        remaining.push({
          ...a,
          retries: a.retries + 1,
          lastError: err instanceof Error ? err.message : "sync fail",
        });
      }
    }
  }

  for (const item of rest) {
    try {
      await apiFetch(item.path, {
        method: item.method,
        body: JSON.stringify(item.body),
      });
      synced += 1;
    } catch (err) {
      failed += 1;
      remaining.push({
        ...item,
        retries: item.retries + 1,
        lastError: err instanceof Error ? err.message : "sync fail",
      });
    }
  }

  await writeQueue(remaining);
  await notify();
  return { pending: remaining.length, synced, failed };
}

export async function enqueueOrSend(
  online: boolean,
  type: SyncOpType,
  path: string,
  method: "POST" | "PATCH",
  body: Record<string, unknown>,
): Promise<{ offline: boolean; result?: unknown }> {
  if (!online) {
    await enqueue(type, path, method, body);
    await notify();
    return { offline: true };
  }
  try {
    const result = await apiFetch(path, {
      method,
      body: JSON.stringify(body),
    });
    return { offline: false, result };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("Sin uplink") || msg.includes("Network")) {
      await enqueue(type, path, method, body);
      await notify();
      return { offline: true };
    }
    throw err;
  }
}
