import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { z } from "zod";
import { useAuth } from "../auth/AuthContext";
import { getApiUrl } from "../api/client";
import { Field, Label, PrimaryButton, Title, Sub } from "../components/ui";
import { palette } from "../theme";

const LoginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(4, "Clave requerida"),
});

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState("conductor@inretrans.com");
  const [password, setPassword] = useState("Inretrans2026*");
  const [loading, setLoading] = useState(false);
  const c = palette("dark");

  async function handleLogin() {
    const parsed = LoginSchema.safeParse({
      email: email.trim(),
      password,
    });
    if (!parsed.success) {
      Alert.alert("Validación", parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    setLoading(true);
    try {
      await login(parsed.data.email, parsed.data.password);
    } catch (err) {
      Alert.alert(
        "Autenticación fallida",
        err instanceof Error ? err.message : "Error",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.canvas }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.wrap}>
        <Text style={styles.brand}>FLEETLINE</Text>
        <Title>Autenticar</Title>
        <Sub>
          Tenant detectado desde JWT · menú según rol operativo (Conductor,
          Mecánico, Patio, Campo).
        </Sub>

        <View style={styles.card}>
          <Label>Email</Label>
          <Field
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            placeholder="rol@inretrans.com"
          />
          <Label>Clave</Label>
          <Field
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
          />
          <PrimaryButton
            label="Entrar a flota"
            loading={loading}
            onPress={() => void handleLogin()}
          />
        </View>
        <Text style={styles.api}>API · {getApiUrl()}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 20, paddingTop: 64 },
  brand: {
    color: "#10B981",
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 2,
    marginBottom: 8,
  },
  card: {
    backgroundColor: "#121722",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    padding: 16,
  },
  api: {
    marginTop: 16,
    color: "#64748B",
    fontSize: 11,
    fontFamily: "monospace",
  },
});
