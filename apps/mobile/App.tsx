import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "./src/auth/AuthContext";
import { AppErrorBoundary } from "./src/components/AppErrorBoundary";
import { RootNavigator } from "./src/navigation/RootNavigator";

export default function App() {
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <StatusBar style="light" />
        <RootNavigator />
      </AuthProvider>
    </AppErrorBoundary>
  );
}
