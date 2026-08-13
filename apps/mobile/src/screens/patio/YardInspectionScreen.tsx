import { useState } from "react";
import { Alert, ScrollView, Switch, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as ImagePicker from "expo-image-picker";
import { z } from "zod";
import type { RootStackParamList } from "../../navigation/types";
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

type Props = NativeStackScreenProps<RootStackParamList, "YardInspection">;

const Schema = z.object({
  vehicleId: z.string().min(1),
  fuelLevelPct: z.coerce.number().min(0).max(100).optional(),
  tireCondition: z.string().max(200).optional(),
  visualDamageNotes: z.string().max(2000).optional(),
  criticalSafetyFault: z.boolean(),
  readyForDispatch: z.boolean().optional(),
});

export default function YardInspectionScreen({ navigation }: Props) {
  const { online } = useNetwork();
  const [vehicleId, setVehicleId] = useState("");
  const [fuel, setFuel] = useState("80");
  const [tires, setTires] = useState("OK");
  const [notes, setNotes] = useState("");
  const [critical, setCritical] = useState(false);
  const [ready, setReady] = useState(true);
  const [photos, setPhotos] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  async function submit() {
    const parsed = Schema.safeParse({
      vehicleId: vehicleId.trim(),
      fuelLevelPct: fuel ? Number(fuel) : undefined,
      tireCondition: tires,
      visualDamageNotes: notes || undefined,
      criticalSafetyFault: critical,
      readyForDispatch: ready,
    });
    if (!parsed.success) {
      Alert.alert("Validación", parsed.error.issues[0]?.message ?? "Inválido");
      return;
    }
    setLoading(true);
    try {
      await enqueueOrSend(
        online,
        "yard_inspection",
        `/api/v1/patio/inspections`,
        "POST",
        {
          ...parsed.data,
          phase: "CHECK_IN",
          photoRefs: photos.length ? photos : undefined,
        },
      );
      setToast("Inspección de patio registrada");
      setTimeout(() => navigation.goBack(), 800);
    } catch (err) {
      Alert.alert("Inspección", err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#0A0D14" }}
      contentContainerStyle={{ padding: 16 }}
    >
      <Title>Inspección / lavado</Title>
      <Sub>Estado físico, limpieza y disponibilidad para despacho</Sub>
      <Card>
        <Label>Vehicle ID</Label>
        <Field value={vehicleId} onChangeText={setVehicleId} placeholder="cuid vehículo" />
        <Label>Combustible %</Label>
        <Field value={fuel} onChangeText={setFuel} keyboardType="numeric" />
        <Label>Llantas</Label>
        <Field value={tires} onChangeText={setTires} />
        <Label>Daños visuales</Label>
        <Field value={notes} onChangeText={setNotes} multiline />
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 12 }}>
          <Text style={{ color: "#F8FAFC" }}>Falla crítica</Text>
          <Switch value={critical} onValueChange={setCritical} trackColor={{ true: "#FF2A5F" }} />
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 12 }}>
          <Text style={{ color: "#F8FAFC" }}>Listo para asignación</Text>
          <Switch value={ready} onValueChange={setReady} trackColor={{ true: "#10B981" }} />
        </View>
        <PrimaryButton
          label={`Fotos (${photos.length})`}
          onPress={() =>
            void ImagePicker.launchCameraAsync({ quality: 0.5 }).then((r) => {
              if (!r.canceled && r.assets[0]) {
                setPhotos((p) => [...p, r.assets[0]!.uri]);
              }
            })
          }
        />
        <PrimaryButton
          label="Registrar inspección"
          loading={loading}
          onPress={() => void submit()}
        />
      </Card>
      <ToastBar message={toast} />
    </ScrollView>
  );
}
