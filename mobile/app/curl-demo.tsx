/**
 * Standalone page curl demo using the forked page-flipper.
 */

import { StyleSheet, View, Text, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import PageFlipper from "../lib/page-flipper";

const PAGES = [
  { bg: "#FFFDF5", title: "Chapter 1", body: "It was a bright cold day in April, and the clocks were striking thirteen. Winston Smith, his chin nuzzled into his breast in an effort to escape the vile wind, slipped quickly through the glass doors of Victory Mansions, though not quickly enough to prevent a swirl of gritty dust from entering along with him." },
  { bg: "#F5F0E8", title: "Chapter 2", body: "The hallway smelt of boiled cabbage and old rag mats. At one end of it a coloured poster, too large for indoor display, had been tacked to the wall. It depicted simply an enormous face, more than a metre wide: the face of a man of about forty-five, with a heavy black moustache and ruggedly handsome features." },
  { bg: "#FFFDF5", title: "Chapter 3", body: "Behind Winston's back the voice from the telescreen was still babbling away about pig-iron and the overfulfilment of the Ninth Three-Year Plan. The telescreen received and transmitted simultaneously. Any sound that Winston made, above the level of a very low whisper, would be picked up by it." },
  { bg: "#F5F0E8", title: "Chapter 4", body: "The flat was seven flights up, and Winston, who was thirty-nine and had a varicose ulcer above his right ankle, went slowly, resting several times on the way. On each landing, opposite the lift-shaft, the poster with the enormous face gazed from the wall." },
  { bg: "#FFFDF5", title: "Chapter 5", body: "It was one of those pictures which are so contrived that the eyes follow you about when you move. BIG BROTHER IS WATCHING YOU, the caption beneath it ran." },
];

export default function CurlDemo() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.backButton} onPress={() => router.back()}>
          ← Back
        </Text>
        <Text style={styles.headerTitle}>Page Curl Demo</Text>
        <View style={{ width: 50 }} />
      </View>

      <PageFlipper
        data={PAGES}
        pageSize={{ width, height: height - 120 }}
        portrait
        renderPage={(page) => (
          <View style={[styles.page, { backgroundColor: page.bg }]}>
            <Text style={styles.pageTitle}>{page.title}</Text>
            <Text style={styles.pageBody}>{page.body}</Text>
            <Text style={styles.pageFooter}>Swipe to turn page</Text>
          </View>
        )}
        pressable
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1C1C1E",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    color: "#007AFF",
    fontSize: 16,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "600",
  },
  page: {
    flex: 1,
    padding: 32,
    justifyContent: "flex-start",
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1C1C1E",
    marginBottom: 24,
  },
  pageBody: {
    fontSize: 18,
    lineHeight: 28,
    color: "#3A3A3C",
    textAlign: "justify",
  },
  pageFooter: {
    position: "absolute",
    bottom: 32,
    left: 32,
    fontSize: 14,
    color: "#8E8E93",
  },
});
