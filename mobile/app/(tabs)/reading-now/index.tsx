import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useColors } from "../../../lib/colors";
import { TabHeader } from "../../../lib/tab-header";

export default function ReadingNowScreen() {
  const colors = useColors();
  const router = useRouter();

  return (
    <View style={styles.screen}>
      <TabHeader title="Reading Now" />
      <View style={styles.emptyContent}>
        <Ionicons name="book-outline" size={56} color={colors.tertiaryText} />
        <Text style={[styles.emptyTitle, { color: colors.text }]}>
          Nothing to read yet
        </Text>
        <Text style={[styles.emptySubtitle, { color: colors.secondaryText }]}>
          Open a book from your library to start reading
        </Text>
        <Pressable
          style={styles.demoButton}
          onPress={() => router.push("/curl-demo")}
        >
          <Text style={styles.demoButtonText}>Page Curl Demo</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  emptyContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "600",
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    textAlign: "center",
  },
  demoButton: {
    marginTop: 24,
    backgroundColor: "#007AFF",
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  demoButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
