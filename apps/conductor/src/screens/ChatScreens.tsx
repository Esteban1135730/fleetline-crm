import { useCallback, useState } from "react";
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
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../App";
import {
  fetchSupportChat,
  fetchTripChat,
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
};

function ChatView({
  title,
  load,
  send,
}: {
  title: string;
  load: () => Promise<Msg[]>;
  send: (body: string) => Promise<unknown>;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const refresh = useCallback(async () => {
    const rows = await load();
    setMessages(rows);
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void refresh().catch(() => setMessages([]));
    }, [refresh]),
  );

  async function onSend() {
    if (!text.trim()) return;
    setSending(true);
    try {
      await send(text.trim());
      setText("");
      await refresh();
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={80}
    >
      <Text style={styles.title}>{title}</Text>
      <FlatList
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        renderItem={({ item }) => (
          <View style={styles.bubble}>
            <Text style={styles.meta}>
              {item.authorName} · {item.authorRole}
            </Text>
            <Text style={styles.body}>{item.body}</Text>
            <Text style={styles.time}>
              {new Date(item.serverTime).toLocaleTimeString("es-CO", {
                hour12: false,
              })}
            </Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>Sin mensajes. Escribe el primero.</Text>
        }
      />
      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Mensaje…"
          placeholderTextColor="#64748B"
        />
        <Pressable
          style={styles.send}
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
      title={`Chat viaje ${code}`}
      load={() => fetchTripChat(tripId)}
      send={(body) => postTripChat(tripId, body)}
    />
  );
}

export function SupportChatScreen(_props: SupportProps) {
  return (
    <ChatView
      title="Soporte técnico general"
      load={() => fetchSupportChat()}
      send={(body) => postSupportChat(body)}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0D14" },
  title: {
    paddingHorizontal: 16,
    paddingTop: 12,
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "600",
  },
  bubble: {
    backgroundColor: "#121722",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  meta: { color: "#10B981", fontSize: 11, fontWeight: "700", marginBottom: 4 },
  body: { color: "#F8FAFC", fontSize: 15 },
  time: { color: "#64748B", fontSize: 10, marginTop: 6, fontFamily: "monospace" },
  empty: { color: "#64748B", textAlign: "center", marginTop: 40 },
  composer: {
    flexDirection: "row",
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.07)",
  },
  input: {
    flex: 1,
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
  },
  sendText: { color: "#04110c", fontWeight: "800" },
});
