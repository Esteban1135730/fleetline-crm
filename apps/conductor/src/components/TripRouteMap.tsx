import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  origin: string;
  destination: string;
  originLat?: number | null;
  originLng?: number | null;
  destLat?: number | null;
  destLng?: number | null;
  polylineJson?: string | null;
  height?: number;
};

let WebViewComp: React.ComponentType<{
  originWhitelist?: string[];
  source: { html: string };
  style?: object;
  scrollEnabled?: boolean;
}> | null = null;

try {
  // Carga diferida: si Expo Go falla con webview, no tumba el runtime
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  WebViewComp = require("react-native-webview").WebView;
} catch {
  WebViewComp = null;
}

function parsePolyline(
  raw?: string | null,
): Array<{ lat: number; lng: number }> {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Array<{ lat: number; lng: number }>;
    return Array.isArray(parsed) ? parsed.filter((p) => p?.lat && p?.lng) : [];
  } catch {
    return [];
  }
}

export function TripRouteMap({
  origin,
  destination,
  originLat,
  originLng,
  destLat,
  destLng,
  polylineJson,
  height = 180,
}: Props) {
  const poly = parsePolyline(polylineJson);
  const hasCoords =
    originLat != null &&
    originLng != null &&
    destLat != null &&
    destLng != null;

  const points =
    poly.length >= 2
      ? poly
      : hasCoords
        ? [
            { lat: originLat!, lng: originLng! },
            { lat: destLat!, lng: destLng! },
          ]
        : [];

  const html =
    points.length >= 2
      ? `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>html,body,#m{margin:0;height:100%;background:#0A0D14} .leaflet-control-attribution{font-size:9px}</style>
</head><body><div id="m"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
const pts = ${JSON.stringify(points.map((p) => [p.lat, p.lng]))};
const map = L.map('m',{zoomControl:false}).setView(pts[0], 12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);
L.polyline(pts,{color:'#10B981',weight:4}).addTo(map);
L.circleMarker(pts[0],{radius:7,color:'#FFB800',fillColor:'#FFB800',fillOpacity:1}).addTo(map);
L.circleMarker(pts[pts.length-1],{radius:7,color:'#FF2A5F',fillColor:'#FF2A5F',fillOpacity:1}).addTo(map);
map.fitBounds(L.latLngBounds(pts),{padding:[24,24]});
</script></body></html>`
      : null;

  function openExternal() {
    if (!hasCoords) return;
    const url = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${originLat}%2C${originLng}%3B${destLat}%2C${destLng}`;
    void Linking.openURL(url);
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.caption} numberOfLines={2}>
        A {origin} → B {destination}
      </Text>
      {html && WebViewComp ? (
        <WebViewComp
          originWhitelist={["*"]}
          source={{ html }}
          style={{ height, borderRadius: 8, overflow: "hidden" }}
          scrollEnabled={false}
        />
      ) : (
        <View style={[styles.fallback, { height: 88 }]}>
          <Text style={styles.fallbackText}>
            {hasCoords
              ? `${originLat!.toFixed(4)}, ${originLng!.toFixed(4)} → ${destLat!.toFixed(4)}, ${destLng!.toFixed(4)}`
              : "Sin coordenadas de ruta. Usa puntos del CRM."}
          </Text>
        </View>
      )}
      {hasCoords ? (
        <Pressable onPress={openExternal} style={styles.linkBtn}>
          <Text style={styles.linkText}>Abrir ruta en mapa</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8, marginBottom: 4 },
  caption: { color: "#94A3B8", fontSize: 12, marginBottom: 6 },
  fallback: {
    backgroundColor: "#0A0D14",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  fallbackText: { color: "#64748B", fontSize: 12, textAlign: "center" },
  linkBtn: { marginTop: 8, alignSelf: "flex-start" },
  linkText: { color: "#10B981", fontWeight: "700", fontSize: 12 },
});
