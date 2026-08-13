import { useEffect, useState } from "react";
import { Alert, ScrollView, Text } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as ImagePicker from "expo-image-picker";
import type { RootStackParamList } from "../../navigation/types";
import { useNetwork } from "../../offline/useNetwork";
import { enqueueOrSend } from "../../offline/syncEngine";
import {
  Card,
  Field,
  Label,
  Mono,
  PrimaryButton,
  Sub,
  Title,
  ToastBar,
} from "../../components/ui";

type Props = NativeStackScreenProps<RootStackParamList, "WorkOrderDetail">;

export default function WorkOrderDetailScreen({ route }: Props) {
  const { order } = route.params;
  const { online } = useNetwork();
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [partQr, setPartQr] = useState("");
  const [photoBefore, setBefore] = useState<string | undefined>();
  const [photoAfter, setAfter] = useState<string | undefined>();
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  async function track(action: "START" | "STOP") {
    setLoading(true);
    try {
      await enqueueOrSend(
        online,
        "time_tracking",
        `/api/v1/taller/mecanico/time-tracking`,
        "POST",
        {
          workOrderId: order.id,
          action,
          taskLabel: "MANO_DE_OBRA",
        },
      );
      if (action === "START") {
        setRunning(true);
        setToast("Cronómetro iniciado");
      } else {
        setRunning(false);
        setToast("Cronómetro detenido");
      }
    } catch (err) {
      Alert.alert("Tiempo", err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function requestPart() {
    if (!partQr.trim()) {
      Alert.alert("Repuesto", "Ingrese QR / SKU de pieza");
      return;
    }
    setLoading(true);
    try {
      await enqueueOrSend(
        online,
        "finding",
        `/api/v1/taller/almacen/despachar-qr`,
        "POST",
        {
          workOrderId: order.id,
          partQr: partQr.trim(),
          quantity: 1,
          photoOldRef: photoBefore,
          photoNewRef: photoAfter,
        },
      );
      setToast("Solicitud de repuesto enviada");
    } catch (err) {
      Alert.alert("Almacén", err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function saveEvidence() {
    if (!photoBefore || !photoAfter) {
      Alert.alert("Evidencia", "Fotos Antes y Después obligatorias.");
      return;
    }
    setLoading(true);
    try {
      await enqueueOrSend(
        online,
        "finding",
        `/api/v1/taller/mecanico/hallazgo`,
        "POST",
        {
          workOrderId: order.id,
          photoRef: photoAfter,
          notes: `Antes=${photoBefore} · Después=${photoAfter}`,
        },
      );
      setToast("Evidencia técnica registrada");
    } catch (err) {
      Alert.alert("Hallazgo", err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#0A0D14" }}
      contentContainerStyle={{ padding: 16 }}
    >
      <Title>Ejecución OT</Title>
      <Sub>{order.description}</Sub>
      <Card>
        <Mono>{order.code}</Mono>
        <Text style={{ color: "#FFB800", marginTop: 8, fontFamily: "monospace", fontSize: 28 }}>
          {mm}:{ss}
        </Text>
        {!running ? (
          <PrimaryButton
            label="Iniciar trabajo"
            loading={loading}
            onPress={() => void track("START")}
          />
        ) : (
          <PrimaryButton
            label="Pausar / Finalizar"
            loading={loading}
            onPress={() => void track("STOP")}
          />
        )}
      </Card>
      <Card>
        <Label>Solicitud repuesto (QR)</Label>
        <Field value={partQr} onChangeText={setPartQr} placeholder="QR pieza" />
        <PrimaryButton label="Solicitar a almacén" onPress={() => void requestPart()} />
      </Card>
      <Card>
        <PrimaryButton
          label={photoBefore ? "Antes OK" : "Foto Antes"}
          onPress={() =>
            void ImagePicker.launchCameraAsync({ quality: 0.55 }).then((r) => {
              if (!r.canceled && r.assets[0]) setBefore(r.assets[0].uri);
            })
          }
        />
        <PrimaryButton
          label={photoAfter ? "Después OK" : "Foto Después"}
          onPress={() =>
            void ImagePicker.launchCameraAsync({ quality: 0.55 }).then((r) => {
              if (!r.canceled && r.assets[0]) setAfter(r.assets[0].uri);
            })
          }
        />
        <PrimaryButton
          label="Guardar evidencia"
          loading={loading}
          onPress={() => void saveEvidence()}
        />
      </Card>
      <ToastBar message={toast} />
    </ScrollView>
  );
}
