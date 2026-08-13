import * as SecureStore from "expo-secure-store";
import type { AuthUser } from "../types";

const TOKEN_KEY = "fleetline_access_token";
const REFRESH_KEY = "fleetline_refresh_token";
const USER_KEY = "fleetline_user_json";

let memoryToken: string | null = null;
let memoryRefresh: string | null = null;
let memoryUser: AuthUser | null = null;

export async function getToken(): Promise<string | null> {
  if (memoryToken) return memoryToken;
  try {
    memoryToken = await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    memoryToken = null;
  }
  return memoryToken;
}

export async function getRefreshToken(): Promise<string | null> {
  if (memoryRefresh) return memoryRefresh;
  try {
    memoryRefresh = await SecureStore.getItemAsync(REFRESH_KEY);
  } catch {
    memoryRefresh = null;
  }
  return memoryRefresh ?? (await getToken());
}

export async function setSession(
  accessToken: string,
  user: AuthUser,
  refreshToken?: string,
): Promise<void> {
  memoryToken = accessToken;
  memoryRefresh = refreshToken ?? accessToken;
  memoryUser = user;
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, accessToken);
    await SecureStore.setItemAsync(REFRESH_KEY, memoryRefresh);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
  } catch {
    /* memoria basta en Expo Go */
  }
}

export async function clearSession(): Promise<void> {
  memoryToken = null;
  memoryRefresh = null;
  memoryUser = null;
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
  } catch {
    /* ignore */
  }
}

export async function getStoredUser(): Promise<AuthUser | null> {
  if (memoryUser) return memoryUser;
  try {
    const raw = await SecureStore.getItemAsync(USER_KEY);
    if (!raw) return null;
    memoryUser = JSON.parse(raw) as AuthUser;
    return memoryUser;
  } catch {
    return null;
  }
}

function decodeJwtPayload(part: string): string {
  const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  if (typeof globalThis.atob === "function") {
    return globalThis.atob(pad);
  }
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";
  for (let i = 0; i < pad.length; i += 4) {
    const enc1 = chars.indexOf(pad[i]!);
    const enc2 = chars.indexOf(pad[i + 1]!);
    const enc3 = pad[i + 2] === "=" ? -1 : chars.indexOf(pad[i + 2]!);
    const enc4 = pad[i + 3] === "=" ? -1 : chars.indexOf(pad[i + 3]!);
    const bitmap =
      (enc1 << 18) | (enc2 << 12) | ((enc3 < 0 ? 0 : enc3) << 6) | (enc4 < 0 ? 0 : enc4);
    output += String.fromCharCode((bitmap >> 16) & 255);
    if (enc3 >= 0) output += String.fromCharCode((bitmap >> 8) & 255);
    if (enc4 >= 0) output += String.fromCharCode(bitmap & 255);
  }
  return output;
}

/** Decodifica payload JWT sin verificar firma (solo lectura de exp). */
export function readJwtExp(token: string): number | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = JSON.parse(decodeJwtPayload(part)) as { exp?: number };
    return typeof json.exp === "number" ? json.exp : null;
  } catch {
    return null;
  }
}

export function isTokenExpired(token: string, skewSec = 30): boolean {
  const exp = readJwtExp(token);
  if (!exp) return false;
  return Date.now() / 1000 >= exp - skewSec;
}

export function tokenExpiresSoon(token: string, withinSec = 3600): boolean {
  const exp = readJwtExp(token);
  if (!exp) return false;
  return exp - Date.now() / 1000 <= withinSec;
}
