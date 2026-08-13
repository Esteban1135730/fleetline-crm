import { useRef, useState } from "react";
import {
  Alert,
  PanResponder,
  ScrollView,
  View,
  Text,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as ImagePicker from "expo-image-picker";
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

type Props = NativeStackScreenProps<RootStackParamList, "Pod">;

/** Captura de trazo simplificada (marker de firma) para POD offline-capable. */
export default function PodScreen({ route, navigation }: Props) {
  const { trip } = route.params;
  const { online } = useNetwork();
  const [receiver, setReceiver] = useState("");
  const [strokes, setStrokes] = useState(0);
  const [photoRef, setPhoto] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const drawing = useRef(false);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        drawing.current = true;
        setStrokes((s) => s + 1);
      },
      onPanResponderMove: () => {
        if (drawing.current) setStrokes((s) => s + 1);
      },
      onPanResponderRelease: () => {
        drawing.current = false;
      },
    }),
  ).current;

  async function submit() {
    if (!receiver.trim() || strokes < 3) {
      Alert.alert("POD incompleto", "Nombre del receptor y firma requeridos.");
      return;
    }
    if (!photoRef) {
      Alert.alert("Evidencia", "Capture foto del manifiesto firmado.");
      return;
    }
    setLoading(true);
    try {
      const gps = await captureGps().catch(() => null);
      const body = {
        category: "POD",
        notes: `POD · receptor=${receiver.trim()} · strokes=${strokes}`,
        photoUrl: photoRef,
        lat: gps?.lat,
        lng: gps?.lng,
        signatureStrokes: strokes,
        receiverName: receiver.trim(),
      };
      const r = await enqueueOrSend(
        online,
        "pod",
        `/api/v1/servicios/${trip.id}/incidentes`,
        "POST",
        body,
      );
      setToast(r.offline ? "POD en cola offline" : "POD registrado");
      setTimeout(() => navigation.navigate("ConductorHome"), 900);
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
      <Title>Proof of Delivery</Title>
      <Sub>Firma digital + foto de remesa · {trip.code}</Sub>
      <Card>
        <Label>Receptor</Label>
        <Field
          value={receiver}
          onChangeText={setReceiver}
          placeholder="Nombre quien recibe"
        />
        <Label>Firma en pantalla</Label>
        <View
          {...pan.panHandlers}
          style={{
            height: 160,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.15)",
            backgroundColor: "#0A0D14",
            marginBottom: 8,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Text style={{ color: "#64748B" }}>
            {strokes > 0 ? `Trazos: ${strokes}` : "Firme aquí"}
          </Text>
        </View>
        <PrimaryButton label="Limpiar firma" onPress={() => setStrokes(0)} />
        <PrimaryButton
          label={photoRef ? "Foto capturada" : "Foto manifiesto"}
          onPress={() =>
            void ImagePicker.launchCameraAsync({ quality: 0.6 }).then((r) => {
              if (!r.canceled && r.assets[0]) setPhoto(r.assets[0].uri);
            })
          }
        />
        <PrimaryButton
          label="Cerrar entrega"
          loading={loading}
          onPress={() => void submit()}
        />
      </Card>
      <ToastBar message={toast} />
    </ScrollView>
  );
}
