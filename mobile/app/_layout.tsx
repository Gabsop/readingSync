import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SQLiteProvider } from "expo-sqlite";
import { Suspense } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { DB_NAME, initializeDatabase } from "../db";

function LoadingFallback() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" />
    </View>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.container}>
      <Suspense fallback={<LoadingFallback />}>
        <SQLiteProvider
          databaseName={DB_NAME}
          onInit={initializeDatabase}
          useSuspense
        >
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
          </Stack>
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
