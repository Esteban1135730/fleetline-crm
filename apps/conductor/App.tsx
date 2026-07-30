import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { getToken } from "./src/api";
import LoginScreen from "./src/screens/LoginScreen";
import TripsScreen from "./src/screens/TripsScreen";

export type RootStackParamList = {
  Login: undefined;
  Trips: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    getToken()
      .then((token) => setAuthed(!!token))
      .finally(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#1e3a5f" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: "#1e3a5f" },
          headerTintColor: "#fff",
          headerTitleStyle: { fontWeight: "600" },
        }}
      >
        {!authed ? (
          <Stack.Screen name="Login" options={{ title: "FSG Conductor" }}>
            {(props) => (
              <LoginScreen
                {...props}
                onLoggedIn={() => setAuthed(true)}
              />
            )}
          </Stack.Screen>
        ) : (
          <Stack.Screen name="Trips" options={{ title: "Mis viajes" }}>
            {(props) => (
              <TripsScreen
                {...props}
                onLogout={() => setAuthed(false)}
              />
            )}
          </Stack.Screen>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
