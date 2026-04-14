import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SQLiteProvider, useSQLiteContext } from "expo-sqlite";
import { Suspense, useEffect } from "react";
import { ActivityIndicator, StyleSheet, useColorScheme, View } from "react-native";
import { DB_NAME, initializeDatabase } from "../db";
import {
  registerAppStateSync,
  unregisterAppStateSync,
} from "../lib/sync-engine";
import { registerBackgroundSync } from "../lib/background-sync";
import { useThemeStore } from "../lib/theme-store";

function LoadingFallback() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" />
    </View>
  );
}

function SyncProvider({ children }: { children: React.ReactNode }) {
  const db = useSQLiteContext();

  useEffect(() => {
    useThemeStore.getState().load();
    registerAppStateSync(db);
    registerBackgroundSync().catch(() => {});

    return () => {
      unregisterAppStateSync();
    };
  }, [db]);

  return <>{children}</>;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const bg = colorScheme === "dark" ? "#000000" : "#FFFFFF";

  return (
    <GestureHandlerRootView style={[styles.container, { backgroundColor: bg }]}>
      <Suspense fallback={<LoadingFallback />}>
        <SQLiteProvider
          databaseName={DB_NAME}
          onInit={initializeDatabase}
          useSuspense
        >
          <SyncProvider>
            <StatusBar style="auto" />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="login" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen
                name="read/[bookId]"
                options={{
                  animation: "slide_from_right",
                  gestureEnabled: false,
                }}
              />
              <Stack.Screen
                name="curl-demo"
                options={{
                  animation: "slide_from_right",
                }}
              />
            </Stack>
          </SyncProvider>
        </SQLiteProvider>
      </Suspense>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
