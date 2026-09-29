import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { io, type Socket } from "socket.io-client";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../App";
import {
  API_URL,
  fetchSupportChat,
  fetchTripChat,
  getStoredUser,
  getToken,
  postSupportChat,
  postTripChat,
} from "../api";

type TripProps = NativeStackScreenProps<RootStackParamList, "TripChat">;
type SupportProps = NativeStackScreenProps<RootStackParamList, "SupportChat">;

type Msg = {
  id: string;
  authorName: string;
  authorRole: string;
  body: string;
  serverTime: string;
  createdAt?: string;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  const mark = parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
  return mark || "·";
}

function clock(iso?: string) {
  const d = new Date(iso || Date.now());
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function roleLabel(role: string) {
  return role.replace(/_/g, " ").toLowerCase();
}

function ChatView({
  title,
  hint,
  mode,
  tripId,
  load,
  send,
}: {
  title: string;
  hint: string;
  mode: "trip" | "support";
  tripId?: string;
  load: () => Promise<Msg[]>;
  send: (body: string) => Promise<Msg | unknown>;
}) {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [live, setLive] = useState(false);
  const [meName, setMeName] = useState("");
  const listRef = useRef<FlatList<Msg>>(null);
  const socketRef = useRef<Socket | null>(null);
  const canSend = text.trim().length > 0 && !sending;

  const refresh = useCallback(async () => {
    const rows = await load();
    setMessages(rows);
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void refresh().catch(() => setMessages([]));
      void getStoredUser().then((u) => setMeName(u?.name || ""));
    }, [refresh]),
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const token = await getToken();
      if (!token || cancelled) return;
      const socket = io(`${API_URL}/logistics`, {
        auth: { token },
        transports: ["websocket", "polling"],
      });
      socketRef.current = socket;
      socket.on("connect", () => setLive(true));
      socket.on("disconnect", () => setLive(false));
      if (mode === "trip" && tripId) socket.emit("joinTrip", { tripId });
      socket.emit("joinUser");

      socket.on(
        "chat.trip",
        (payload: { tripId?: string; message?: Msg }) => {
          if (mode !== "trip" || !payload?.message) return;
          if (payload.tripId && tripId && payload.tripId !== tripId) return;
          setMessages((prev) =>
            prev.some((m) => m.id === payload.message!.id)
              ? prev
              : [...prev, payload.message!],
          );
        },
      );
      socket.on("chat.support", (payload: { message?: Msg }) => {
        if (mode !== "support" || !payload?.message) return;
        setMessages((prev) =>
          prev.some((m) => m.id === payload.message!.id)
            ? prev
            : [...prev, payload.message!],
        );
      });
    })();

    return () => {
      cancelled = true;
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [mode, tripId]);

  useEffect(() => {
    if (messages.length) {
      listRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages.length]);

  async function onSend() {
    if (!canSend) return;
    setSending(true);
    try {
      const body = text.trim();
      setText("");
      const msg = (await send(body)) as Msg;
      if (msg?.id) {
        setMessages((prev) =>
          prev.some((m) => m.id === msg.id) ? prev : [...prev, msg],
        );
      } else {
        await refresh();
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons
          name={live ? "radio-outline" : "cloud-offline-outline"}
          size={18}
          color={live ? "#00E5FF" : "#8B9BB4"}
        />
        <View style={styles.headerCopy}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.hint}>
            {live ? "En línea" : "Sin enlace"} · {hint}
          </Text>
        </View>
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        style={styles.listFlex}
        contentContainerStyle={[
          styles.list,
          messages.length === 0 && styles.listEmpty,
        ]}
        onContentSizeChange={() =>
          listRef.current?.scrollToEnd({ animated: false })
        }
        renderItem={({ item }) => {
          const mine = Boolean(meName) && item.authorName === meName;
          return (
            <View style={[styles.row, mine ? styles.rowMine : styles.rowOther]}>
              {mine ? null : (
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initials(item.authorName)}</Text>
                </View>
              )}
              <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
                {mine ? null : (
                  <Text style={styles.meta} numberOfLines={1}>
                    {item.authorName}
                    <Text style={styles.role}>  {roleLabel(item.authorRole)}</Text>
                  </Text>
                )}
                <Text style={[styles.body, mine && styles.bodyMine]}>{item.body}</Text>
                <Text style={[styles.time, mine && styles.timeMine]}>
                  {clock(item.serverTime || item.createdAt)}
                </Text>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="chatbubbles-outline" size={36} color="#00E5FF" />
            <Text style={styles.emptyTitle}>Canal en silencio</Text>
            <Text style={styles.emptyBody}>El primer mensaje abre el hilo.</Text>
          </View>
        }
      />

      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Escribe al canal"
          placeholderTextColor="#8B9BB4"
          multiline
        />
        <Pressable
          style={[styles.send, !canSend && styles.sendOff]}
          disabled={!canSend}
          onPress={() => void onSend()}
          accessibilityLabel="Enviar"
        >
          <Ionicons name="send" size={18} color="#050B14" />
        </Pressable>
      </View>
    </View>
  );
}

export function TripChatScreen({ route }: TripProps) {
  const { tripId, code } = route.params;
  return (
    <ChatView
      title={code}
      hint="viaje"
      mode="trip"
      tripId={tripId}
      load={() => fetchTripChat(tripId)}
      send={(body) => postTripChat(tripId, body)}
    />
  );
}

export function SupportChatScreen(_props: SupportProps) {
  return (
    <ChatView
      title="Soporte"
      hint="flota"
      mode="support"
      load={() => fetchSupportChat()}
      send={(body) => postSupportChat(body)}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#050B14" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1C3A5E",
  },
  headerCopy: { flex: 1 },
  title: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  hint: { marginTop: 2, color: "#8B9BB4", fontSize: 12 },
  listFlex: { flex: 1 },
  list: { paddingHorizontal: 14, paddingTop: 16, paddingBottom: 12, gap: 12 },
  listEmpty: { flexGrow: 1, justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "flex-end", gap: 8, maxWidth: "100%" },
  rowMine: { justifyContent: "flex-end" },
  rowOther: { justifyContent: "flex-start" },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,229,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(0,229,255,0.35)",
  },
  avatarText: { color: "#00E5FF", fontSize: 11, fontWeight: "700" },
  bubble: {
    maxWidth: "78%",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 7,
    borderWidth: 1,
  },
  bubbleMine: {
    backgroundColor: "rgba(0,229,255,0.16)",
    borderColor: "rgba(0,229,255,0.4)",
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: "rgba(11,19,37,0.92)",
    borderColor: "#1C3A5E",
    borderBottomLeftRadius: 4,
  },
  meta: { color: "#FFFFFF", fontSize: 12, fontWeight: "700", marginBottom: 3 },
  role: { color: "#8B9BB4", fontWeight: "500" },
  body: { color: "#FFFFFF", fontSize: 15, lineHeight: 21 },
  bodyMine: { color: "#F4FEFF" },
  time: {
    marginTop: 4,
    color: "#8B9BB4",
    fontSize: 10,
    fontVariant: ["tabular-nums"],
    alignSelf: "flex-end",
  },
  timeMine: { color: "rgba(0,229,255,0.85)" },
  empty: { alignItems: "center", paddingHorizontal: 32 },
  emptyTitle: {
    marginTop: 14,
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  emptyBody: { marginTop: 4, color: "#8B9BB4", fontSize: 13 },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#1C3A5E",
    backgroundColor: "#050B14",
  },
  input: {
    flex: 1,
    maxHeight: 88,
    minHeight: 44,
    backgroundColor: "rgba(11,19,37,0.92)",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#1C3A5E",
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: "#FFFFFF",
    fontSize: 15,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#00E5FF",
    alignItems: "center",
    justifyContent: "center",
  },
  sendOff: { opacity: 0.35 },
});
