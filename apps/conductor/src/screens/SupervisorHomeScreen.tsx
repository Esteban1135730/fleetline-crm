import { useCallback, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../App";
import {
  clearToken,
  fetchPendingDeviations,
  resolveDeviation,
} from "../api";

type Props = NativeStackScreenProps<RootStackParamList, "SupervisorHome"> & {
  onLogout: () => void;
};

export default function SupervisorHomeScreen({ navigation, onLogout }: Props) {
  const [rows, setRows] = useState<
    Array<{
      id: string;
      tripId: string;
      action: string;
      reasonDetail: string;
      trip: { code: string; origin: string; destination: string };
    }>
  >([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchPendingDeviations();
      setRows(data);
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Uplink fallido");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function decide(
    tripId: string,
    decision: "ACEPTAR" | "CANCELAR",
  ) {
    try {
      await resolveDeviation(tripId, decision);
      await load();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "No se pudo resolver");
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Desviaciones pendientes</Text>
        <Pressable
          onPress={async () => {
            await clearToken();
            onLogout();
          }}
        >
          <Text style={styles.logout}>Salir</Text>
        </Pressable>
      </View>
      <Pressable
        style={styles.support}
        onPress={() => navigation.navigate("SupportChat")}
      >
        <Text style={styles.supportText}>Chat soporte general</Text>
      </Pressable>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            tintColor="#10B981"
          />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>Sin desviaciones pendientes.</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.code}>
              {item.trip.code} · {item.action}
            </Text>
            <Text style={styles.route}>
              {item.trip.origin} → {item.trip.destination}
            </Text>
            <Text style={styles.reason}>{item.reasonDetail}</Text>
            <View style={styles.actions}>
              <Pressable
                style={[styles.btn, styles.accept]}
                onPress={() => void decide(item.tripId, "ACEPTAR")}
              >
                <Text style={styles.btnText}>ACEPTAR</Text>
              </Pressable>
              <Pressable
                style={[styles.btn, styles.cancel]}
                onPress={() => void decide(item.tripId, "CANCELAR")}
              >
                <Text style={styles.btnText}>CANCELAR</Text>
              </Pressable>
              <Pressable
                style={[styles.btn, styles.chat]}
                onPress={() =>
                  navigation.navigate("TripChat", {
                    tripId: item.tripId,
                    code: item.trip.code,
                  })
                }
              >
                <Text style={styles.btnText}>Chat</Text>
              </Pressable>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0D14" },
  header: {
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: { color: "#F8FAFC", fontSize: 18, fontWeight: "700" },
  logout: { color: "#94A3B8", fontWeight: "600" },
  support: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 8,
    backgroundColor: "rgba(16,185,129,0.15)",
  },
  supportText: { color: "#10B981", fontWeight: "700", textAlign: "center" },
  empty: { color: "#64748B", textAlign: "center", marginTop: 40 },
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    borderRadius: 10,
    backgroundColor: "#121722",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  code: { color: "#F8FAFC", fontWeight: "700", fontSize: 16 },
  route: { color: "#94A3B8", marginTop: 4 },
  reason: { color: "#FFB800", marginTop: 8, fontSize: 13 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  btn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 },
  accept: { backgroundColor: "#10B981" },
  cancel: { backgroundColor: "#FF2A5F" },
  chat: { backgroundColor: "#1e293b" },
  btnText: { color: "#F8FAFC", fontWeight: "800" },
});
