import { ActivityIndicator, View } from "react-native";
import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuth } from "../auth/AuthContext";
import { homeRouteForRole } from "../auth/roles";
import type { RootStackParamList } from "./types";
import LoginScreen from "../screens/LoginScreen";
import ConductorHome from "../screens/conductor/ConductorHome";
import TripDetailScreen from "../screens/conductor/TripDetailScreen";
import PreoperationalScreen from "../screens/conductor/PreoperationalScreen";
import IncidentScreen from "../screens/conductor/IncidentScreen";
import PodScreen from "../screens/conductor/PodScreen";
import MechanicHome from "../screens/mecanico/MechanicHome";
import WorkOrderDetailScreen from "../screens/mecanico/WorkOrderDetailScreen";
import PatioHome from "../screens/patio/PatioHome";
import GateCheckScreen from "../screens/patio/GateCheckScreen";
import YardInspectionScreen from "../screens/patio/YardInspectionScreen";
import CampoHome from "../screens/campo/CampoHome";
import FieldAuditScreen from "../screens/campo/FieldAuditScreen";
import BoardingScreen from "../screens/campo/BoardingScreen";
import UnsupportedHome from "../screens/UnsupportedHome";

const Stack = createNativeStackNavigator<RootStackParamList>();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: "#0A0D14",
    card: "#0A0D14",
    text: "#F8FAFC",
    border: "rgba(255,255,255,0.07)",
    primary: "#10B981",
  },
};

export function RootNavigator() {
  const { user, ready } = useAuth();

  if (!ready) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#0A0D14",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator size="large" color="#10B981" />
      </View>
    );
  }

  const start = user ? homeRouteForRole(user.role) : "Login";

  return (
    <NavigationContainer key={user?.id ?? "guest"} theme={navTheme}>
      <Stack.Navigator
        initialRouteName={start}
        screenOptions={{
          headerStyle: { backgroundColor: "#0A0D14" },
          headerTintColor: "#F8FAFC",
          headerTitleStyle: { fontWeight: "600" },
          contentStyle: { backgroundColor: "#0A0D14" },
        }}
      >
        {!user ? (
          <Stack.Screen
            name="Login"
            component={LoginScreen}
            options={{ headerShown: false }}
          />
        ) : (
          <>
            <Stack.Screen
              name="ConductorHome"
              component={ConductorHome}
              options={{ title: "Conductor" }}
            />
            <Stack.Screen
              name="TripDetail"
              component={TripDetailScreen}
              options={{ title: "Viaje" }}
            />
            <Stack.Screen
              name="Preoperational"
              component={PreoperationalScreen}
              options={{ title: "Preoperacional" }}
            />
            <Stack.Screen
              name="Incident"
              component={IncidentScreen}
              options={{ title: "Novedad" }}
            />
            <Stack.Screen
              name="Pod"
              component={PodScreen}
              options={{ title: "POD" }}
            />
            <Stack.Screen
              name="MechanicHome"
              component={MechanicHome}
              options={{ title: "Taller" }}
            />
            <Stack.Screen
              name="WorkOrderDetail"
              component={WorkOrderDetailScreen}
              options={{ title: "OT" }}
            />
            <Stack.Screen
              name="PatioHome"
              component={PatioHome}
              options={{ title: "Patio" }}
            />
            <Stack.Screen
              name="GateCheck"
              component={GateCheckScreen}
              options={{ title: "Talanquera" }}
            />
            <Stack.Screen
              name="YardInspection"
              component={YardInspectionScreen}
              options={{ title: "Inspección" }}
            />
            <Stack.Screen
              name="CampoHome"
              component={CampoHome}
              options={{ title: "Campo" }}
            />
            <Stack.Screen
              name="FieldAudit"
              component={FieldAuditScreen}
              options={{ title: "Auditoría" }}
            />
            <Stack.Screen
              name="Boarding"
              component={BoardingScreen}
              options={{ title: "Abordaje" }}
            />
            <Stack.Screen
              name="UnsupportedHome"
              component={UnsupportedHome}
              options={{ title: "Fleetline OS" }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
