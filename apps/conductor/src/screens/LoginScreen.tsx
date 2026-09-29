import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../App";
import { KeyboardForm } from "../components/KeyboardForm";
import { PasswordField } from "../components/PasswordField";
import { login } from "../api";

type Props = NativeStackScreenProps<RootStackParamList, "Login"> & {
  onLoggedIn: () => void;
};

export default function LoginScreen({ onLoggedIn }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!email.trim() || !password) {
      Alert.alert("Datos incompletos", "Ingresa correo y clave.");
      return;
    }
    setLoading(true);
    try {
      await login(email.trim(), password);
      onLoggedIn();
    } catch (err) {
      Alert.alert(
        "Uplink rechazado",
        err instanceof Error ? err.message : "No se pudo autenticar",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardForm center contentStyle={styles.container}>
      <Text style={styles.kicker}>NEXA · FLOTA</Text>
      <Text style={styles.title}>Conductor</Text>
      <Text style={styles.subtitle}>Autenticación de turno</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Correo</Text>
        <TextInput
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          placeholder="conductor@inretrans.com"
          placeholderTextColor="#8B9BB4"
        />

        <Text style={styles.label}>Clave</Text>
        <PasswordField
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          onSubmitEditing={() => void handleLogin()}
        />

        <Pressable
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={() => void handleLogin()}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#050B14" />
          ) : (
            <Text style={styles.buttonText}>Entrar</Text>
          )}
        </Pressable>
      </View>
    </KeyboardForm>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 24,
  },
  kicker: {
    color: "#00E5FF",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.6,
    marginBottom: 8,
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: -0.4,
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 28,
    fontSize: 14,
    color: "#8B9BB4",
  },
  card: {
    backgroundColor: "rgba(11, 19, 37, 0.92)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1C3A5E",
    padding: 20,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: "#8B9BB4",
    marginBottom: 6,
    letterSpacing: 0.4,
  },
  input: {
    borderWidth: 1,
    borderColor: "#1C3A5E",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 16,
    fontSize: 16,
    color: "#FFFFFF",
    backgroundColor: "#050B14",
  },
  button: {
    alignSelf: "flex-end",
    backgroundColor: "#00E5FF",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 28,
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: "#050B14",
    fontSize: 15,
    fontWeight: "700",
  },
});
