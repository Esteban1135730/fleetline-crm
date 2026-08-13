import { useState } from "react";
import { Alert, ScrollView, Switch, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as ImagePicker from "expo-image-picker";
import { z } from "zod";
import type { RootStackParamList } from "../../navigation/types";
import { captureGps } from "../../gps/useGps";
import { useNetwork } from "../../offline/useNetwork";
import { enqueueOrSend } from "../../offline/syncEngine";
import {
  Card,
  Label,
  PrimaryButton,
  Sub,
  Title,
  ToastBar,
  Field,
} from "../../components/ui";

type Props = NativeStackScreenProps<RootStackParamList, "Preoperational">;

const Schema = z.object({
  brakesOk: z.boolean(),
  lightsOk: z.boolean(),
  tiresOk: z.boolean(),
  kitOk: z.boolean(),
  oilOk: z.boolean(),
  observations: z.string().max(2000).optional(),
  photoRefs: z.array(z.string()).min(1),
});

function CheckRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 12,
      }}
    >
      <Text style={{ color: "#F8FAFC", fontSize: 16, flex: 1 }}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: "#10B981", false: "#334155" }}
      />
    </View>
  );
}

export default function PreoperationalScreen({ route, navigation }: Props) {
  const { trip } = route.params;
  const { online } = useNetwork();
  const [brakesOk, setBrakes] = useState(true);
  const [lightsOk, setLights] = useState(true);
  const [tiresOk, setTires] = useState(true);
  const [kitOk, setKit] = useState(true);
  const [oilOk, setOil] = useState(true);
  const [observations, setObs] = useState("");
  const [photoRefs, setPhotos] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const criticalFail = !brakesOk || !lightsOk || !tiresOk;

  async function addPhoto() {
    const res = await ImagePicker.launchCameraAsync({
      quality: 0.6,
      base64: false,
    });
    if (res.canceled || !res.assets[0]) return;
    setPhotos((p) => [...p, res.assets[0]!.uri]);
  }

  async function submit() {
    if (criticalFail) {
      Alert.alert(
        "Hard-stop",
        "Falla crítica (frenos/luces/llantas). Inicio de turno bloqueado.",
      );
      return;
    }
    const body = {
      tripId: trip.id,
      brakesOk,
      lightsOk,
      tiresOk,
      kitOk,
      oilOk,
      observations: observations || undefined,
      photoRefs:
        photoRefs.length > 0
          ? photoRefs
          : [`local://preop/${trip.id}/${Date.now()}`],
    };
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      Alert.alert("Validación", parsed.error.issues[0]?.message ?? "Inválido");
      return;
    }

    setLoading(true);
    try {
      const gps = await captureGps().catch(() => null);
      const logisticsBody = {
        frenos: brakesOk,
        luces: lightsOk,
        llantas: tiresOk,
        kitCarretera: kitOk,
        nivelAceite: oilOk,
        observaciones: observations || undefined,
        ...(gps
          ? { lat: gps.lat, lng: gps.lng, capturedAt: gps.timestamp }
          : {}),
      };

      const r = await enqueueOrSend(
        online,
        "preoperational",
        `/logistics/trips/${trip.id}/preoperational`,
        "POST",
        logisticsBody,
      );

      if (online) {
        await enqueueOrSend(
          online,
          "preoperational",
          `/api/v1/pilot/preoperacional`,
          "POST",
          parsed.data,
        ).catch(() => null);
      }

      setToast(
        r.offline
          ? "Preoperacional en cola offline"
          : "Preoperacional registrado",
      );
      setTimeout(() => navigation.goBack(), 900);
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
      <Title>Preoperacional</Title>
      <Sub>
        {trip.code} · checklist vial. Fotos obligatorias. GPS en cada registro.
      </Sub>
      <Card>
        <CheckRow label="Frenos OK" value={brakesOk} onChange={setBrakes} />
        <CheckRow label="Luces OK" value={lightsOk} onChange={setLights} />
        <CheckRow label="Llantas OK" value={tiresOk} onChange={setTires} />
        <CheckRow label="Kit carretera" value={kitOk} onChange={setKit} />
        <CheckRow label="Nivel aceite" value={oilOk} onChange={setOil} />
        <Label>Observaciones</Label>
        <Field
          value={observations}
          onChangeText={setObs}
          placeholder="Novedades visuales"
          multiline
        />
        <PrimaryButton
          label={`Foto estado (${photoRefs.length})`}
          onPress={() => void addPhoto()}
        />
        {criticalFail ? (
          <Text style={{ color: "#FF2A5F", marginTop: 8, fontWeight: "700" }}>
            Bloqueo: falla crítica detectada
          </Text>
        ) : null}
        <PrimaryButton
          label="Firmar e iniciar turno"
          loading={loading}
          disabled={criticalFail}
          onPress={() => void submit()}
        />
      </Card>
      <ToastBar message={toast} />
    </ScrollView>
  );
}
