import { useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as ImagePicker from "expo-image-picker";
import type { RootStackParamList } from "../../navigation/types";
import {
  finalizarServicio,
  iniciarServicio,
} from "../../api/endpoints";
import { captureGps } from "../../gps/useGps";
import {
  Card,
  Mono,
  PrimaryButton,
  Sub,
  Title,
  ToastBar,
} from "../../components/ui";

type Props = NativeStackScreenProps<RootStackParamList, "TripDetail">;

export default function TripDetailScreen({ route, navigation }: Props) {
  const { trip } = route.params;
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  async function start() {
    setLoading(true);
    try {
      const gps = await captureGps();
      const res = await iniciarServicio(trip.id, {
        lat: gps.lat,
        lng: gps.lng,
      });
      setToast(`Servicio ${(res as { status?: string }).status ?? "INICIADO"}`);
    } catch (err) {
      Alert.alert("Control", err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function finish() {
    setLoading(true);
    try {
      const gps = await captureGps();
      await finalizarServicio(trip.id, { lat: gps.lat, lng: gps.lng });
      setToast("Servicio finalizado");
      navigation.navigate("Pod", { trip });
    } catch (err) {
      Alert.alert("Control", err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#0A0D14" }}
      contentContainerStyle={{ padding: 16 }}
    >
      <Title>Manifiesto</Title>
      <Sub>Origen, destino, unidad y control de tiempos.</Sub>
      <Card>
        <Mono>{trip.code}</Mono>
        <View style={{ height: 8 }} />
        <Sub>
          {trip.origin} → {trip.destination}
        </Sub>
        <Sub>
          Estado: {trip.status}
          {trip.vehicle?.plate ? ` · Placa ${trip.vehicle.plate}` : ""}
        </Sub>
        {trip.departAt ? <Sub>Salida: {trip.departAt}</Sub> : null}
        <PrimaryButton
          label="Iniciar servicio"
          loading={loading}
          onPress={() => void start()}
        />
        <PrimaryButton
          label="Finalizar servicio"
          loading={loading}
          onPress={() => void finish()}
        />
        <PrimaryButton
          label="Novedad / incidente"
          onPress={() => navigation.navigate("Incident", { trip })}
        />
        <PrimaryButton
          label="Adjuntar evidencia"
          onPress={() =>
            void ImagePicker.launchCameraAsync({ quality: 0.5 })
          }
        />
      </Card>
      <ToastBar message={toast} />
    </ScrollView>
  );
}
