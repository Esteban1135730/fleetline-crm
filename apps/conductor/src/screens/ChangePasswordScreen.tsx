import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../App";
import { changePassword } from "../api";

type Props = NativeStackScreenProps<RootStackParamList, "ChangePassword"> & {
  onDone: () => void;
};

export default function ChangePasswordScreen({ onDone }: Props) {
  const [current, setCurrent] = useState("Inretrans2026*");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (next.length < 8) {
      Alert.alert("Clave débil", "La nueva contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (next !== confirm) {
      Alert.alert("No coinciden", "Confirma la nueva contraseña.");
      return;
    }
    if (next === current) {
      Alert.alert("Misma clave", "Elige una contraseña distinta a la genérica.");
      return;
    }
    setLoading(true);
    try {
      await changePassword(current, next);
      Alert.alert("Listo", "Contraseña actualizada. Entrando a operación.");
      onDone();
    } catch (e) {
      Alert.alert(
        "No se pudo cambiar",
        e instanceof Error ? e.message : "Error de uplink",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.title}>Cambiar contraseña</Text>
        <Text style={styles.subtitle}>
          Entraste con la clave genérica de flota. Define una personal para
          seguir en la app.
        </Text>

        <Text style={styles.label}>Actual (genérica)</Text>
        <TextInput
          style={styles.input}
          secureTextEntry
          value={current}
          onChangeText={setCurrent}
        />
        <Text style={styles.label}>Nueva</Text>
        <TextInput
          style={styles.input}
          secureTextEntry
          value={next}
          onChangeText={setNext}
          placeholder="Mínimo 8 caracteres"
          placeholderTextColor="#64748B"
        />
        <Text style={styles.label}>Confirmar</Text>
        <TextInput
          style={styles.input}
          secureTextEntry
          value={confirm}
          onChangeText={setConfirm}
          placeholderTextColor="#64748B"
        />

        <Pressable
          style={[styles.button, loading && styles.disabled]}
          disabled={loading}
          onPress={() => void submit()}
        >
          {loading ? (
            <ActivityIndicator color="#04110c" />
          ) : (
            <Text style={styles.buttonText}>Guardar y continuar</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0A0D14",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    backgroundColor: "#121722",
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  title: { color: "#F8FAFC", fontSize: 22, fontWeight: "800", marginBottom: 8 },
  subtitle: { color: "#94A3B8", fontSize: 13, marginBottom: 16, lineHeight: 18 },
  label: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 6,
    marginTop: 8,
  },
  input: {
    backgroundColor: "#0A0D14",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: "#F8FAFC",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  button: {
    marginTop: 20,
    backgroundColor: "#10B981",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  disabled: { opacity: 0.6 },
  buttonText: { color: "#04110c", fontWeight: "800", fontSize: 15 },
});
