import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
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

function ChatView({
  title,
  mode,
  tripId,
  load,
  send,
}: {
  title: string;
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
    if (!text.trim()) return;
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
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
    >
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <View style={[styles.livePill, live ? styles.liveOn : styles.liveOff]}>
          <Text style={styles.liveText}>{live ? "EN VIVO" : "OFFLINE"}</Text>
        </View>
      </View>
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 8, gap: 10 }}
        onContentSizeChange={() =>
          listRef.current?.scrollToEnd({ animated: false })
        }
        renderItem={({ item }) => {
          const mine = meName && item.authorName === meName;
          return (
            <View
              style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}
            >
              {!mine ? (
                <Text style={styles.meta}>
                  {item.authorName} · {item.authorRole}
                </Text>
              ) : null}
              <Text style={styles.body}>{item.body}</Text>
              <Text style={styles.time}>
                {new Date(item.serverTime || item.createdAt || Date.now()).toLocaleTimeString(
                  "es-CO",
                  { hour12: false },
                )}
              </Text>
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.empty}>Sin mensajes. Escribe el primero.</Text>
        }
      />
      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Mensaje…"
          placeholderTextColor="#64748B"
          multiline
        />
        <Pressable
          style={[styles.send, sending && { opacity: 0.6 }]}
          disabled={sending}
          onPress={() => void onSend()}
        >
          <Text style={styles.sendText}>{sending ? "…" : "Enviar"}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

export function TripChatScreen({ route }: TripProps) {
  const { tripId, code } = route.params;
  return (
    <ChatView
      title={`Viaje ${code}`}
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
      title="Soporte flota"
      mode="support"
      load={() => fetchSupportChat()}
      send={(body) => postSupportChat(body)}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0D14" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.07)",
  },
  title: { color: "#94A3B8", fontSize: 13, fontWeight: "600", flex: 1 },
  livePill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  liveOn: { backgroundColor: "rgba(16,185,129,0.2)" },
  liveOff: { backgroundColor: "rgba(148,163,184,0.15)" },
  liveText: {
    color: "#F8FAFC",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  bubble: {
    maxWidth: "88%",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
  },
  bubbleMine: {
    alignSelf: "flex-end",
    backgroundColor: "rgba(16,185,129,0.15)",
    borderColor: "rgba(16,185,129,0.35)",
  },
  bubbleOther: {
    alignSelf: "flex-start",
    backgroundColor: "#121722",
    borderColor: "rgba(255,255,255,0.07)",
  },
  meta: { color: "#10B981", fontSize: 11, fontWeight: "700", marginBottom: 4 },
  body: { color: "#F8FAFC", fontSize: 15, lineHeight: 20 },
  time: {
    color: "#64748B",
    fontSize: 10,
    marginTop: 6,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  empty: { color: "#64748B", textAlign: "center", marginTop: 40 },
  composer: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.07)",
    backgroundColor: "#0A0D14",
  },
  input: {
    flex: 1,
    maxHeight: 100,
    backgroundColor: "#121722",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#F8FAFC",
  },
  send: {
    backgroundColor: "#10B981",
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: "center",
    minHeight: 44,
  },
  sendText: { color: "#04110c", fontWeight: "800" },
});
