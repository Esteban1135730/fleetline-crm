import { useCallback, useState } from "react";
import {
  ActivityIndicator,
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
import * as Sharing from "expo-sharing";
import type { RootStackParamList } from "../../App";
import {
  downloadFuecPdfToCache,
  fetchMyFuec,
  type FuecListItem,
} from "../api";

type Props = NativeStackScreenProps<RootStackParamList, "FuecList">;

export default function FuecListScreen(_props: Props) {
  const [items, setItems] = useState<FuecListItem[]>([]);
  const [driverName, setDriverName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await fetchMyFuec();
      setItems(data.items);
      setDriverName(data.driver?.name ?? null);
    } catch (e) {
      Alert.alert(
        "FUEC",
        e instanceof Error ? e.message : "No se pudieron cargar extractos",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function sharePdf(item: FuecListItem) {
    setBusyId(item.id);
    try {
      const uri = await downloadFuecPdfToCache(item.id, item.number);
      const can = await Sharing.isAvailableAsync();
      if (!can) {
        Alert.alert("PDF listo", `Archivo guardado:\n${uri}`);
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: `FUEC ${item.number}`,
        UTI: "com.adobe.pdf",
      });
    } catch (e) {
      Alert.alert(
        "Error",
        e instanceof Error ? e.message : "No se pudo exportar el PDF",
      );
    } finally {
      setBusyId(null);
    }
  }

  if (loading && items.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#10B981" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {driverName ? (
        <Text style={styles.sub}>Conductor: {driverName}</Text>
      ) : (
        <Text style={styles.warn}>
          Sin conductor vinculado — no hay FUEC asignados.
        </Text>
      )}
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load(true);
            }}
            tintColor="#10B981"
          />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            No tienes extractos FUEC vigentes. Solicita emisión en Contratos FUEC
            (CRM Jurídico).
          </Text>
        }
        renderItem={({ item }) => {
          const busy = busyId === item.id;
          return (
            <View style={styles.card}>
              <Text style={styles.number}>{item.number}</Text>
              <Text style={styles.route}>{item.route}</Text>
              <Text style={styles.meta}>
                {item.contractor}
                {item.vehicle?.plate ? ` · ${item.vehicle.plate}` : ""}
              </Text>
              <Text style={styles.meta}>
                Vence {item.validTo.slice(0, 10)} · {item.status}
              </Text>
              <Pressable
                style={[styles.btn, busy && styles.btnBusy]}
                disabled={busy}
                onPress={() => void sharePdf(item)}
              >
                {busy ? (
                  <ActivityIndicator color="#0A0D14" />
                ) : (
                  <Text style={styles.btnText}>Exportar / imprimir PDF</Text>
                )}
              </Pressable>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0D14", padding: 16 },
  center: {
    flex: 1,
    backgroundColor: "#0A0D14",
    alignItems: "center",
    justifyContent: "center",
  },
  sub: { color: "#94A3B8", marginBottom: 12, fontSize: 13 },
  warn: { color: "#FFB800", marginBottom: 12, fontSize: 13 },
  empty: { color: "#94A3B8", textAlign: "center", marginTop: 40, lineHeight: 20 },
  card: {
    backgroundColor: "#121722",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  number: {
    color: "#FF2A5F",
    fontFamily: "monospace",
    fontSize: 13,
    fontWeight: "700",
  },
  route: { color: "#F8FAFC", fontSize: 15, fontWeight: "600", marginTop: 6 },
  meta: { color: "#94A3B8", fontSize: 12, marginTop: 4 },
  btn: {
    marginTop: 12,
    backgroundColor: "#10B981",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  btnBusy: { opacity: 0.7 },
  btnText: { color: "#0A0D14", fontWeight: "800", fontSize: 13 },
});
