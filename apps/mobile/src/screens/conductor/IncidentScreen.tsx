import { useState } from "react";
import { Alert, Pressable, ScrollView, Text } from "react-native";
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

type Props = NativeStackScreenProps<RootStackParamList, "Incident">;

const CATEGORIES = [
  { id: "STOP", label: "Parada" },
  { id: "TOLL", label: "Peaje" },
  { id: "FUEL", label: "Combustible" },
  { id: "MECHANICAL", label: "Falla mecánica" },
  { id: "INCIDENT", label: "Incidente en vía" },
  { id: "OTHER", label: "Otro" },
] as const;

const Schema = z.object({
  category: z.string().min(1),
  notes: z.string().max(2000).optional(),
});

export default function IncidentScreen({ route, navigation }: Props) {
  const { trip } = route.params;
  const { online } = useNetwork();
  const [category, setCategory] = useState<string>("STOP");
  const [notes, setNotes] = useState("");
  const [photoUrl, setPhoto] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  async function submit() {
    const parsed = Schema.safeParse({ category, notes: notes || undefined });
    if (!parsed.success) {
      Alert.alert("Validación", "Seleccione categoría");
      return;
    }
    setLoading(true);
    try {
      const gps = await captureGps().catch(() => null);
      const body = {
        category,
        notes: notes || undefined,
        photoUrl,
        lat: gps?.lat,
        lng: gps?.lng,
        capturedAt: gps?.timestamp ?? new Date().toISOString(),
      };
      const r = await enqueueOrSend(
        online,
        "incident",
        `/api/v1/servicios/${trip.id}/incidentes`,
        "POST",
        body,
      );
      setToast(r.offline ? "Novedad en cola offline" : "Novedad registrada");
      setTimeout(() => navigation.goBack(), 800);
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Fallo");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#0A0D14" }}
      contentContainerStyle={{ padding: 16 }}
    >
      <Title>Novedad en ruta</Title>
      <Sub>{trip.code} · GPS + foto opcionales</Sub>
      <Card>
        {CATEGORIES.map((cat) => (
          <Pressable
            key={cat.id}
            onPress={() => setCategory(cat.id)}
            style={{
              padding: 14,
              borderRadius: 10,
              marginBottom: 8,
              backgroundColor: category === cat.id ? "#10B98133" : "#0A0D14",
              borderWidth: 1,
              borderColor:
                category === cat.id ? "#10B981" : "rgba(255,255,255,0.07)",
            }}
          >
            <Text style={{ color: "#F8FAFC", fontWeight: "600" }}>
              {cat.label}
            </Text>
          </Pressable>
        ))}
        <Label>Detalle</Label>
        <Field
          value={notes}
          onChangeText={setNotes}
          placeholder="Descripción operativa"
          multiline
        />
        <PrimaryButton
          label={photoUrl ? "Foto adjuntada" : "Adjuntar foto"}
          onPress={() =>
            void ImagePicker.launchCameraAsync({ quality: 0.55 }).then((r) => {
              if (!r.canceled && r.assets[0]) setPhoto(r.assets[0].uri);
            })
          }
        />
        <PrimaryButton
          label="Enviar novedad"
          loading={loading}
          onPress={() => void submit()}
        />
      </Card>
      <ToastBar message={toast} />
    </ScrollView>
  );
}
