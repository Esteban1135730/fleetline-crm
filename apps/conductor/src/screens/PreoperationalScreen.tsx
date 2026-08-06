import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../App";
import {
  getCurrentGps,
  iniciarServicio,
  submitPreoperational,
  type PreoperationalPayload,
} from "../api";

type Props = NativeStackScreenProps<RootStackParamList, "Preoperational">;

const ITEMS: {
  key: keyof Omit<PreoperationalPayload, "observaciones">;
  label: string;
}[] = [
  { key: "frenos", label: "Frenos" },
  { key: "luces", label: "Luces" },
  { key: "llantas", label: "Llantas" },
  { key: "kitCarretera", label: "Kit de carretera" },
  { key: "nivelAceite", label: "Nivel de aceite" },
];

const EMPTY: PreoperationalPayload = {
  frenos: false,
  luces: false,
  llantas: false,
  kitCarretera: false,
  nivelAceite: false,
  observaciones: "",
};

export default function PreoperationalScreen({ navigation, route }: Props) {
  const { trip } = route.params;
  const alreadySigned = !!trip.preoperationalAt;
  const [checklist, setChecklist] = useState<PreoperationalPayload>(EMPTY);
  const [signed, setSigned] = useState(alreadySigned);
  const [busy, setBusy] = useState(false);

  const allApto = useMemo(
    () => ITEMS.every((i) => checklist[i.key] === true),
    [checklist],
  );

  function setItem(
    key: keyof Omit<PreoperationalPayload, "observaciones">,
    value: boolean,
  ) {
    setChecklist((c) => ({ ...c, [key]: value }));
  }

  async function firmar() {
    if (!allApto) {
      Alert.alert(
        "Inspección incompleta",
        "Marque APTO en frenos, luces, llantas, kit y aceite antes de firmar.",
      );
      return;
    }
    setBusy(true);
    try {
      await submitPreoperational(trip.id, {
        ...checklist,
        observaciones: checklist.observaciones?.trim() || undefined,
      });
      setSigned(true);
      Alert.alert(
        "Preoperacional sellado",
        "Inspección aprobada. Ya puede iniciar ruta y transmitir GPS.",
      );
    } catch (err) {
      Alert.alert(
        "Uplink",
        err instanceof Error ? err.message : "No se pudo enviar el checklist",
      );
    } finally {
      setBusy(false);
    }
  }

  async function iniciarRuta() {
    if (!signed && !trip.preoperationalAt) {
      Alert.alert(
        "Bloqueo",
        "Imposible iniciar viaje: Se requiere inspección preoperacional aprobada.",
      );
      return;
    }
    setBusy(true);
    try {
      const gps = await getCurrentGps();
      const res = await iniciarServicio(trip.id, gps);
      if (res.status === "PENDIENTE_APROBACION_SUPERVISOR") {
        Alert.alert(
          "Pendiente supervisor",
          res.gate?.violations?.map((v) => v.detail).join("\n") ||
            "Fuera de tolerancia — esperando aprobación",
        );
      }
      navigation.navigate("Trips");
    } catch (err) {
      Alert.alert(
        "Ruta",
        err instanceof Error ? err.message : "No se pudo iniciar la ruta",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.eyebrow}>INSPECCIÓN PREOPERACIONAL</Text>
      <Text style={styles.title}>{trip.code}</Text>
      <Text style={styles.route}>
        {trip.origin} → {trip.destination}
      </Text>
      {trip.vehicle?.plate ? (
        <Text style={styles.plate}>Unidad {trip.vehicle.plate}</Text>
      ) : null}

      <Text style={styles.hint}>
        Marque APTO solo si el ítem está en condición nominal. NO APTO bloquea
        el envío.
      </Text>

      {ITEMS.map((item) => {
        const apto = checklist[item.key];
        return (
          <View key={item.key} style={styles.itemCard}>
            <Text style={styles.itemLabel}>{item.label}</Text>
            <View style={styles.toggleRow}>
              <Pressable
                style={[styles.toggle, apto ? styles.toggleApto : null]}
                onPress={() => setItem(item.key, true)}
                disabled={signed || busy}
                accessibilityLabel={`${item.label} APTO`}
              >
                <Text
                  style={[
                    styles.toggleText,
                    apto ? styles.toggleTextOn : null,
                  ]}
                >
                  APTO
                </Text>
              </Pressable>
              <Pressable
                style={[styles.toggle, !apto ? styles.toggleNo : null]}
                onPress={() => setItem(item.key, false)}
                disabled={signed || busy}
                accessibilityLabel={`${item.label} NO APTO`}
              >
                <Text
                  style={[
                    styles.toggleText,
                    !apto ? styles.toggleTextNo : null,
                  ]}
                >
                  NO APTO
                </Text>
              </Pressable>
            </View>
          </View>
        );
      })}

      <Text style={styles.obsLabel}>Observaciones (opcional)</Text>
      <TextInput
        style={styles.obsInput}
        multiline
        editable={!signed && !busy}
        value={checklist.observaciones || ""}
        onChangeText={(t) =>
          setChecklist((c) => ({ ...c, observaciones: t }))
        }
        placeholder="Hallazgos menores, ruido, desgaste…"
        placeholderTextColor="#64748B"
      />

      {!signed ? (
        <Pressable
          style={[
            styles.primaryBtn,
            (!allApto || busy) && styles.primaryBtnDisabled,
          ]}
          disabled={!allApto || busy}
          onPress={() => void firmar()}
        >
          {busy ? (
            <ActivityIndicator color="#F8FAFC" />
          ) : (
            <Text style={styles.primaryBtnText}>
              FIRMAR Y ENVIAR PREOPERACIONAL
            </Text>
          )}
        </Pressable>
      ) : (
        <View style={styles.signedBox}>
          <Text style={styles.signedText}>
            Preoperacional aprobado — GPS se habilita al iniciar ruta
          </Text>
          <Pressable
            style={[styles.startBtn, busy && styles.primaryBtnDisabled]}
            disabled={busy}
            onPress={() => void iniciarRuta()}
          >
            {busy ? (
              <ActivityIndicator color="#F8FAFC" />
            ) : (
              <Text style={styles.primaryBtnText}>INICIAR RUTA</Text>
            )}
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A0D14" },
  content: { padding: 20, paddingBottom: 48 },
  eyebrow: {
    fontFamily: "monospace",
    fontSize: 10,
    letterSpacing: 1.6,
    color: "#10B981",
    fontWeight: "700",
  },
  title: {
    marginTop: 8,
    fontSize: 24,
    fontWeight: "800",
    color: "#F8FAFC",
  },
  route: { marginTop: 6, fontSize: 15, color: "#94A3B8" },
  plate: {
    marginTop: 4,
    fontFamily: "monospace",
    fontSize: 13,
    color: "#10B981",
  },
  hint: {
    marginTop: 16,
    marginBottom: 12,
    fontSize: 13,
    lineHeight: 18,
    color: "#94A3B8",
  },
  itemCard: {
    marginBottom: 10,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    backgroundColor: "#121722",
  },
  itemLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#F8FAFC",
    marginBottom: 10,
  },
  toggleRow: { flexDirection: "row", gap: 8 },
  toggle: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    backgroundColor: "#0A0D14",
  },
  toggleApto: {
    borderColor: "#10B981",
    backgroundColor: "rgba(16,185,129,0.15)",
  },
  toggleNo: {
    borderColor: "#FF2A5F",
    backgroundColor: "rgba(255,42,95,0.12)",
  },
  toggleText: { fontSize: 13, fontWeight: "700", color: "#94A3B8" },
  toggleTextOn: { color: "#10B981" },
  toggleTextNo: { color: "#FF2A5F" },
  obsLabel: {
    marginTop: 8,
    marginBottom: 6,
    fontSize: 12,
    fontWeight: "600",
    color: "#94A3B8",
  },
  obsInput: {
    minHeight: 88,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    backgroundColor: "#121722",
    color: "#F8FAFC",
    padding: 12,
    textAlignVertical: "top",
    marginBottom: 20,
  },
  primaryBtn: {
    backgroundColor: "#10B981",
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryBtnDisabled: { opacity: 0.45 },
  primaryBtnText: {
    color: "#F8FAFC",
    fontWeight: "800",
    fontSize: 14,
    letterSpacing: 0.4,
  },
  signedBox: { gap: 12 },
  signedText: {
    fontSize: 13,
    color: "#10B981",
    fontWeight: "600",
    textAlign: "center",
  },
  startBtn: {
    backgroundColor: "#0D9488",
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
  },
});
