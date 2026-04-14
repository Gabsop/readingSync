import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "../../../lib/colors";
import { TabHeader } from "../../../lib/tab-header";

export default function SearchScreen() {
  const colors = useColors();

  return (
    <View style={styles.screen}>
      <TabHeader title="Search" />
      <View style={styles.emptyContent}>
        <Ionicons name="search-outline" size={56} color={colors.tertiaryText} />
        <Text style={[styles.emptyTitle, { color: colors.text }]}>
          Search your library
        </Text>
        <Text style={[styles.emptySubtitle, { color: colors.secondaryText }]}>
          Find books by title or author
        </Text>
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
});
