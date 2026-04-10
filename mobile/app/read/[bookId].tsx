import { View, Text, StyleSheet, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ReaderScreen() {
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>
          {bookId}
        </Text>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.closeButton}>✕</Text>
        </Pressable>
      </View>

      <View style={styles.content}>
        <Text style={styles.placeholder}>
          Reader will render EPUB content here
        </Text>
      </View>

      <View style={styles.footer}>
        <Text style={styles.pageIndicator}>1 of 1</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  title: {
    fontSize: 13,
    color: "#8E8E93",
    flex: 1,
    textAlign: "center",
  },
  closeButton: {
    fontSize: 18,
    color: "#8E8E93",
    paddingLeft: 16,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  placeholder: {
    fontSize: 17,
    color: "#8E8E93",
    textAlign: "center",
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  pageIndicator: {
    fontSize: 12,
    color: "#8E8E93",
  },
});
