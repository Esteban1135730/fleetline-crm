import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { getToken, type Trip } from "./src/api";
import LoginScreen from "./src/screens/LoginScreen";
import TripsScreen from "./src/screens/TripsScreen";
import PreoperationalScreen from "./src/screens/PreoperationalScreen";

export type RootStackParamList = {
  Login: undefined;
  Trips: undefined;
  Preoperational: { trip: Trip };
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
        <ActivityIndicator size="large" color="#10B981" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: "#0A0D14" },
          headerTintColor: "#F8FAFC",
          headerTitleStyle: { fontWeight: "600" },
        }}
      >
        {!authed ? (
          <Stack.Screen name="Login" options={{ title: "Fleetline Conductor" }}>
            {(props) => (
              <LoginScreen
                {...props}
                onLoggedIn={() => setAuthed(true)}
              />
            )}
          </Stack.Screen>
        ) : (
          <>
            <Stack.Screen name="Trips" options={{ title: "Mis viajes" }}>
              {(props) => (
                <TripsScreen
                  {...props}
                  onLogout={() => setAuthed(false)}
                />
              )}
            </Stack.Screen>
            <Stack.Screen
              name="Preoperational"
              component={PreoperationalScreen}
              options={{ title: "Preoperacional" }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
