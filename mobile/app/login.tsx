import { View, Text, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

export default function LoginScreen() {
  const router = useRouter();

  const handleGoogleSignIn = () => {
    // TODO: Implement Google OAuth with expo-auth-session + better-auth
    router.replace("/(tabs)/library");
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.appName}>ReadingSync</Text>
          <Text style={styles.tagline}>Pick up where you left off</Text>
        </View>

        <View style={styles.actions}>
          <Pressable style={styles.googleButton} onPress={handleGoogleSignIn}>
            <Text style={styles.googleButtonText}>Continue with Google</Text>
          </Pressable>
        </View>

        <Text style={styles.legal}>
          By continuing, you agree to our Terms of Service and Privacy Policy
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  header: {
    alignItems: "center",
    marginBottom: 64,
  },
  appName: {
    fontSize: 34,
    fontWeight: "700",
    color: "#000",
    marginBottom: 8,
  },
  tagline: {
    fontSize: 17,
    color: "#8E8E93",
  },
  actions: {
    width: "100%",
    marginBottom: 32,
  },
  googleButton: {
    backgroundColor: "#007AFF",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  googleButtonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "600",
  },
  legal: {
    fontSize: 12,
    color: "#8E8E93",
    textAlign: "center",
    position: "absolute",
    bottom: 32,
    paddingHorizontal: 32,
  },
});
