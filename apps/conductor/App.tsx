import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import {
  getStoredUser,
  getToken,
  normalizeRole,
  type AuthUser,
  type Trip,
} from "./src/api";
import LoginScreen from "./src/screens/LoginScreen";
import TripsScreen from "./src/screens/TripsScreen";
import PreoperationalScreen from "./src/screens/PreoperationalScreen";
import RoleHomeScreen from "./src/screens/RoleHomeScreen";
import SupervisorHomeScreen from "./src/screens/SupervisorHomeScreen";
import ChangePasswordScreen from "./src/screens/ChangePasswordScreen";
import ProfileScreen from "./src/screens/ProfileScreen";
import {
  SupportChatScreen,
  TripChatScreen,
} from "./src/screens/ChatScreens";
import { AppErrorBoundary } from "./src/components/AppErrorBoundary";
import { NotificationsLayer } from "./src/notifications/NotificationsLayer";

export type RootStackParamList = {
  Login: undefined;
  ChangePassword: undefined;
  Profile: undefined;
  RoleHome: undefined;
  Trips: undefined;
  SupervisorHome: undefined;
  Preoperational: { trip: Trip };
  TripChat: { tripId: string; code: string };
  SupportChat: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function initialRouteFor(user: AuthUser | null): keyof RootStackParamList {
  if (!user) return "Login";
  if (user.mustChangePassword) return "ChangePassword";
  const role = normalizeRole(user.role);
  if (role === "conductor") return "Trips";
  if (role === "supervisor" || role === "despacho") return "SupervisorHome";
  return "RoleHome";
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    void (async () => {
      const token = await getToken();
      const stored = token ? await getStoredUser() : null;
      setUser(stored);
      setReady(true);
    })();
  }, []);

  if (!ready) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#0A0D14",
        }}
      >
        <ActivityIndicator size="large" color="#10B981" />
      </View>
    );
  }

  const authed = !!user;
  const mustChange = Boolean(user?.mustChangePassword);
  const start = initialRouteFor(user);

  return (
    <SafeAreaProvider>
      <AppErrorBoundary>
        <NotificationsLayer enabled={authed && !mustChange}>
          <NavigationContainer>
            <StatusBar style="light" />
            <Stack.Navigator
              key={mustChange ? "force-pw" : authed ? "app" : "login"}
              initialRouteName={start}
              screenOptions={{
                headerStyle: { backgroundColor: "#0A0D14" },
                headerTintColor: "#F8FAFC",
                headerTitleStyle: { fontWeight: "600" },
                contentStyle: { backgroundColor: "#0A0D14" },
              }}
            >
              {!authed ? (
                <Stack.Screen name="Login" options={{ title: "INRETRANS OS" }}>
                  {(props) => (
                    <LoginScreen
                      {...props}
                      onLoggedIn={async () => {
                        const u = await getStoredUser();
                        setUser(u);
                      }}
                    />
                  )}
                </Stack.Screen>
              ) : mustChange ? (
                <Stack.Screen
                  name="ChangePassword"
                  options={{ title: "Seguridad", headerBackVisible: false }}
                >
                  {(props) => (
                    <ChangePasswordScreen
                      {...props}
                      onDone={async () => {
                        const u = await getStoredUser();
                        setUser(u);
                      }}
                    />
                  )}
                </Stack.Screen>
              ) : (
                <>
                  <Stack.Screen name="RoleHome" options={{ title: "INRETRANS OS" }}>
                    {(props) => (
                      <RoleHomeScreen
                        {...props}
                        user={user}
                        onLogout={() => setUser(null)}
                      />
                    )}
                  </Stack.Screen>
                  <Stack.Screen name="Trips" options={{ title: "Mis viajes" }}>
                    {(props) => (
                      <TripsScreen
                        {...props}
                        onLogout={() => setUser(null)}
                      />
                    )}
                  </Stack.Screen>
                  <Stack.Screen
                    name="SupervisorHome"
                    options={{ title: "Supervisor" }}
                  >
                    {(props) => (
                      <SupervisorHomeScreen
                        {...props}
                        onLogout={() => setUser(null)}
                      />
                    )}
                  </Stack.Screen>
                  <Stack.Screen
                    name="Profile"
                    options={{ title: "Mi perfil" }}
                  >
                    {(props) => (
                      <ProfileScreen
                        {...props}
                        user={user}
                        onLogout={() => setUser(null)}
                      />
                    )}
                  </Stack.Screen>
                  <Stack.Screen
                    name="ChangePassword"
                    options={{ title: "Cambiar contraseña" }}
                  >
                    {(props) => (
                      <ChangePasswordScreen
                        {...props}
                        onDone={async () => {
                          const u = await getStoredUser();
                          setUser(u);
                          props.navigation.goBack();
                        }}
                      />
                    )}
                  </Stack.Screen>
                  <Stack.Screen
                    name="Preoperational"
                    component={PreoperationalScreen}
                    options={{ title: "Preoperacional" }}
                  />
                  <Stack.Screen
                    name="TripChat"
                    component={TripChatScreen}
                    options={{ title: "Chat del viaje" }}
                  />
                  <Stack.Screen
                    name="SupportChat"
                    component={SupportChatScreen}
                    options={{ title: "Soporte" }}
                  />
                </>
              )}
            </Stack.Navigator>
          </NavigationContainer>
        </NotificationsLayer>
      </AppErrorBoundary>
    </SafeAreaProvider>
  );
}
