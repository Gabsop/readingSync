import { useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";
import * as AuthSession from "expo-auth-session";
import { useAuthStore } from "../lib/auth-store";
import { API_URL } from "../lib/api";
import { useColors } from "../lib/colors";

// Ensure any lingering browser sessions are dismissed on app start
WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const router = useRouter();
  const setToken = useAuthStore((s) => s.setToken);
  const colors = useColors();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    setError(null);

    try {
      const redirectUri = AuthSession.makeRedirectUri({
        scheme: "readingsync",
        path: "auth-callback",
      });

      // mobile-signin (GET) → Google OAuth → mobile-callback → app redirect
      const callbackPath = `/api/auth/mobile-callback?redirect_uri=${encodeURIComponent(redirectUri)}`;
      const signInUrl = `${API_URL}/api/auth/mobile-signin?provider=google&callbackURL=${encodeURIComponent(callbackPath)}`;

      const result = await WebBrowser.openAuthSessionAsync(signInUrl, redirectUri);

      if (result.type === "success") {
        const url = new URL(result.url);
        const token = url.searchParams.get("token");
        const authError = url.searchParams.get("error");

        if (token) {
          await setToken(token);
          router.replace("/(tabs)/library");
          return;
        }

        setError(authError ?? "Sign in failed. Please try again.");
      } else if (result.type === "cancel") {
        // User dismissed the browser — no error needed
      }
    } catch (e) {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.appName, { color: colors.text }]}>ReadingSync</Text>
          <Text style={[styles.tagline, { color: colors.secondaryText }]}>
            Pick up where you left off
          </Text>
        </View>

        <View style={styles.actions}>
          <Pressable
            style={[styles.googleButton, { backgroundColor: colors.tint }, isSigningIn && styles.googleButtonDisabled]}
            onPress={handleGoogleSignIn}
            disabled={isSigningIn}
          >
            {isSigningIn ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            )}
          </Pressable>

          {error && <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>}
        </View>

        <Text style={[styles.legal, { color: colors.secondaryText }]}>
          By continuing, you agree to our Terms of Service and Privacy Policy
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    marginBottom: 8,
  },
  tagline: {
    fontSize: 17,
  },
  actions: {
    width: "100%",
    marginBottom: 32,
  },
  googleButton: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  googleButtonDisabled: {
    opacity: 0.7,
  },
  googleButtonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "600",
  },
  error: {
    fontSize: 14,
    textAlign: "center",
    marginTop: 12,
  },
  legal: {
    fontSize: 12,
    textAlign: "center",
    position: "absolute",
    bottom: 32,
    paddingHorizontal: 32,
  },
});
