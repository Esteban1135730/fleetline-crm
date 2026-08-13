import { useState } from "react";
import { Alert, ScrollView } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { z } from "zod";
import type { RootStackParamList } from "../../navigation/types";
import { captureGps } from "../../gps/useGps";
import { useNetwork } from "../../offline/useNetwork";
import { enqueueOrSend } from "../../offline/syncEngine";
import {
  Card,
  Field,
  Label,
  PrimaryButton,
  Sub,
  Title,
  ToastBar,
} from "../../components/ui";

type Props = NativeStackScreenProps<RootStackParamList, "GateCheck">;

const Schema = z
  .object({
    plate: z.string().min(3).optional(),
    qrPayload: z.string().min(2).optional(),
  })
  .refine((v) => v.plate || v.qrPayload, {
    message: "Placa o QR requerido",
  });

export default function GateCheckScreen({ navigation }: Props) {
  const { online } = useNetwork();
  const [plate, setPlate] = useState("");
  const [qr, setQr] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  async function submit(kind: "CHECK_IN" | "CHECK_OUT") {
    const parsed = Schema.safeParse({
      plate: plate.trim() || undefined,
      qrPayload: qr.trim() || undefined,
    });
    if (!parsed.success) {
      Alert.alert("Validación", parsed.error.issues[0]?.message ?? "Datos");
      return;
    }
    setLoading(true);
    try {
      const gps = await captureGps().catch(() => null);
      await enqueueOrSend(
        online,
        "lpr_check",
        `/api/v1/patio/talanquera/lpr-check`,
        "POST",
        {
          ...parsed.data,
          gateId: "MOBILE_GATE",
          at: new Date().toISOString(),
        },
      );
      await enqueueOrSend(
        online,
        "yard_access",
        `/api/v1/patio/access-log`,
        "POST",
        {
          kind,
          plate: parsed.data.plate,
          lat: gps?.lat,
          lng: gps?.lng,
        },
      );
      setToast(`${kind} registrado`);
      setTimeout(() => navigation.goBack(), 800);
    } catch (err) {
      Alert.alert("Patio", err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#0A0D14" }}
      contentContainerStyle={{ padding: 16 }}
    >
      <Title>Talanquera</Title>
      <Sub>Escaneo placa / QR · registro de ingreso o salida</Sub>
      <Card>
        <Label>Placa</Label>
        <Field
          value={plate}
          onChangeText={setPlate}
          autoCapitalize="characters"
          placeholder="ABC123"
        />
        <Label>Payload QR</Label>
        <Field value={qr} onChangeText={setQr} placeholder="viaje|placa|…" />
        <PrimaryButton
          label="Registrar ENTRADA"
          loading={loading}
          onPress={() => void submit("CHECK_IN")}
        />
        <PrimaryButton
          label="Registrar SALIDA"
          loading={loading}
          onPress={() => void submit("CHECK_OUT")}
        />
      </Card>
      <ToastBar message={toast} />
    </ScrollView>
  );
}
