import { View, Text, StyleSheet } from "react-native";

export default function ReadingNowScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>Nothing to read yet</Text>
        <Text style={styles.emptySubtitle}>
          Open a book from your library to start reading
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "600",
    color: "#000",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    color: "#8E8E93",
    textAlign: "center",
  },
});
