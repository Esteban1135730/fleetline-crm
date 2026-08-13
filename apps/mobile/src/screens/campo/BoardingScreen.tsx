import { useState } from "react";
import { Alert, ScrollView } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { z } from "zod";
import type { RootStackParamList } from "../../navigation/types";
import { captureGps } from "../../gps/useGps";
import { useNetwork } from "../../offline/useNetwork";
import { enqueueOrSend, newClientEventId } from "../../offline/syncEngine";
import {
  Card,
  Field,
  Label,
  PrimaryButton,
  Sub,
  Title,
  ToastBar,
} from "../../components/ui";

type Props = NativeStackScreenProps<RootStackParamList, "Boarding">;

const Schema = z
  .object({
    tripId: z.string().min(1),
    passengerDocument: z.string().optional(),
    passengerName: z.string().optional(),
  })
  .refine((v) => v.passengerDocument || v.passengerName, {
    message: "Documento o nombre del pasajero requerido",
  });

export default function BoardingScreen({ navigation }: Props) {
  const { online } = useNetwork();
  const [tripId, setTripId] = useState("");
  const [document, setDocument] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  async function submit() {
    const parsed = Schema.safeParse({
      tripId: tripId.trim(),
      passengerDocument: document.trim() || undefined,
      passengerName: name.trim() || undefined,
    });
    if (!parsed.success) {
      Alert.alert("Validación", parsed.error.issues[0]?.message ?? "Inválido");
      return;
    }
    setLoading(true);
    try {
      const clientEventId = await newClientEventId();
      const gps = await captureGps().catch(() => null);
      const body = {
        ...parsed.data,
        clientEventId,
        offline: !online,
        capturedAt: new Date().toISOString(),
        lat: gps?.lat,
        lng: gps?.lng,
      };
      const r = await enqueueOrSend(
        online,
        "abordaje",
        `/api/v1/operaciones/campo/abordaje-manual`,
        "POST",
        body,
      );
      setToast(
        r.offline
          ? "Abordaje en cola — sync al recuperar red"
          : "Abordaje sincronizado",
      );
      setDocument("");
      setName("");
      setTimeout(() => navigation.goBack(), 900);
    } catch (err) {
      Alert.alert("Abordaje", err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#0A0D14" }}
      contentContainerStyle={{ padding: 16 }}
    >
      <Title>Abordaje manual</Title>
      <Sub>Offline-first · clientEventId dedupe en servidor</Sub>
      <Card>
        <Label>Trip ID</Label>
        <Field value={tripId} onChangeText={setTripId} />
        <Label>Documento</Label>
        <Field value={document} onChangeText={setDocument} keyboardType="number-pad" />
        <Label>Nombre</Label>
        <Field value={name} onChangeText={setName} />
        <PrimaryButton
          label="Registrar abordaje"
          loading={loading}
          onPress={() => void submit()}
        />
      </Card>
      <ToastBar message={toast} />
    </ScrollView>
  );
}
