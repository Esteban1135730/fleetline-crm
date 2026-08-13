import { Component, type ErrorInfo, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { palette } from "../theme";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Mobile crash", error, info.componentStack);
  }

  render() {
    const c = palette("dark");
    if (this.state.error) {
      return (
        <View
          style={{
            flex: 1,
            backgroundColor: c.canvas,
            justifyContent: "center",
            padding: 24,
          }}
        >
          <Text style={{ color: c.critical, fontWeight: "700", fontSize: 18 }}>
            Fallo de interfaz
          </Text>
          <Text style={{ color: c.subtext, marginTop: 8 }}>
            {this.state.error.message}
          </Text>
          <Pressable
            onPress={() => this.setState({ error: null })}
            style={{
              marginTop: 20,
              backgroundColor: c.brand,
              padding: 14,
              borderRadius: 10,
            }}
          >
            <Text style={{ textAlign: "center", fontWeight: "700" }}>
              Reintentar
            </Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}
