import { Component, type ErrorInfo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("App crash", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.box}>
          <Text style={styles.title}>Fallo de runtime</Text>
          <Text style={styles.msg}>{this.state.error.message}</Text>
          <Pressable
            style={styles.btn}
            onPress={() => this.setState({ error: null })}
          >
            <Text style={styles.btnText}>Reintentar</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  box: {
    flex: 1,
    backgroundColor: "#0A0D14",
    justifyContent: "center",
    padding: 24,
  },
  title: { color: "#FF2A5F", fontSize: 18, fontWeight: "800", marginBottom: 8 },
  msg: { color: "#F8FAFC", marginBottom: 16 },
  btn: {
    backgroundColor: "#10B981",
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  btnText: { color: "#04110c", fontWeight: "800" },
});
