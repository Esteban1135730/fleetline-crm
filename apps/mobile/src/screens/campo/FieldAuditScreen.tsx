import { useState } from "react";
import { Alert, ScrollView } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as ImagePicker from "expo-image-picker";
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

type Props = NativeStackScreenProps<RootStackParamList, "FieldAudit">;

const Schema = z.object({
  notes: z.string().min(3, "Detalle mínimo 3 caracteres"),
  plate: z.string().optional(),
  tripId: z.string().optional(),
});

export default function FieldAuditScreen({ navigation }: Props) {
  const { online } = useNetwork();
  const [notes, setNotes] = useState("");
  const [plate, setPlate] = useState("");
  const [tripId, setTripId] = useState("");
  const [photoRef, setPhoto] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  async function submit() {
    const parsed = Schema.safeParse({
      notes: notes.trim(),
      plate: plate.trim() || undefined,
      tripId: tripId.trim() || undefined,
    });
    if (!parsed.success) {
      Alert.alert("Validación", parsed.error.issues[0]?.message ?? "Inválido");
      return;
    }
    setLoading(true);
    try {
      const gps = await captureGps().catch(() => null);
      await enqueueOrSend(
        online,
        "falla_sitio",
        `/api/v1/operaciones/campo/falla-sitio`,
        "POST",
        {
          ...parsed.data,
          photoRef,
          requestReplacement: true,
          lat: gps?.lat,
          lng: gps?.lng,
        },
      );
      setToast(
        online ? "Auditoría enviada" : "Auditoría en cola offline",
      );
      setTimeout(() => navigation.goBack(), 800);
    } catch (err) {
      Alert.alert("Campo", err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#0A0D14" }}
      contentContainerStyle={{ padding: 16 }}
    >
      <Title>Auditoría móvil</Title>
      <Sub>Verificación QHSE / seguridad en carretera</Sub>
      <Card>
        <Label>Placa (opcional)</Label>
        <Field
          value={plate}
          onChangeText={setPlate}
          autoCapitalize="characters"
        />
        <Label>Trip ID (opcional)</Label>
        <Field value={tripId} onChangeText={setTripId} />
        <Label>Hallazgo</Label>
        <Field
          value={notes}
          onChangeText={setNotes}
          multiline
          placeholder="Cumplimiento normativo, EPP, señalización…"
        />
        <PrimaryButton
          label={photoRef ? "Evidencia OK" : "Foto evidencia"}
          onPress={() =>
            void ImagePicker.launchCameraAsync({ quality: 0.55 }).then((r) => {
              if (!r.canceled && r.assets[0]) setPhoto(r.assets[0].uri);
            })
          }
        />
        <PrimaryButton
          label="Registrar auditoría"
          loading={loading}
          onPress={() => void submit()}
        />
      </Card>
      <ToastBar message={toast} />
    </ScrollView>
  );
}
