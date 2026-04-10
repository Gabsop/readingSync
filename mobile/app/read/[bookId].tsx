import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSQLiteContext } from "expo-sqlite";
import { parseEpub, readChapter } from "../../lib/epub-parser";
import { renderXhtml, resetKeyCounter } from "../../lib/xhtml-renderer";

export default function ReaderScreen() {
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const router = useRouter();
  const db = useSQLiteContext();

  const [chapterContent, setChapterContent] = useState<React.ReactNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentChapter, setCurrentChapter] = useState(0);
  const [totalChapters, setTotalChapters] = useState(0);
  const [bookTitle, setBookTitle] = useState(bookId ?? "");

  useEffect(() => {
    if (!bookId) return;
    loadBook();
  }, [bookId]);

  useEffect(() => {
    if (!bookId || totalChapters === 0) return;
    loadChapter(currentChapter);
  }, [currentChapter, totalChapters]);

  async function loadBook() {
    try {
      setLoading(true);
      setError(null);

      // Look up epub path from local database
      const row = await db.getFirstAsync<{ epub_path: string; title: string }>(
        "SELECT epub_path, title FROM books WHERE id = ?",
        [bookId!],
      );

      if (!row?.epub_path) {
        setError("Book not found or EPUB not downloaded");
        setLoading(false);
        return;
      }

      setBookTitle(row.title || bookId!);
      const epub = await parseEpub(row.epub_path);
      setTotalChapters(epub.spine.length);

      // Render first chapter
      const xhtml = await readChapter(epub, 0);
      resetKeyCounter();
      const rendered = renderXhtml(xhtml, {
        baseFontSize: 17,
        resolveAsset: (href) => {
          // Asset resolution will be expanded in M2 when we unzip to Documents
          return undefined;
        },
      });
      setChapterContent(rendered);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load book");
    } finally {
      setLoading(false);
    }
  }

  async function loadChapter(spineIndex: number) {
    try {
      setLoading(true);

      const row = await db.getFirstAsync<{ epub_path: string }>(
        "SELECT epub_path FROM books WHERE id = ?",
        [bookId!],
      );
      if (!row?.epub_path) return;

      const epub = await parseEpub(row.epub_path);
      const xhtml = await readChapter(epub, spineIndex);
      resetKeyCounter();
      const rendered = renderXhtml(xhtml, {
        baseFontSize: 17,
      });
      setChapterContent(rendered);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load chapter");
    } finally {
      setLoading(false);
    }
  }

  function goToPreviousChapter() {
    if (currentChapter > 0) {
      setCurrentChapter((c) => c - 1);
    }
  }

  function goToNextChapter() {
    if (currentChapter < totalChapters - 1) {
      setCurrentChapter((c) => c + 1);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>
          {bookTitle}
        </Text>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.closeButton}>✕</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {chapterContent}
        </ScrollView>
      )}

      <View style={styles.footer}>
        <Pressable onPress={goToPreviousChapter} disabled={currentChapter === 0}>
          <Text style={[styles.navButton, currentChapter === 0 && styles.navButtonDisabled]}>
            ‹ Prev
          </Text>
        </Pressable>
        <Text style={styles.pageIndicator}>
          {totalChapters > 0
            ? `${currentChapter + 1} of ${totalChapters}`
            : "—"}
        </Text>
        <Pressable onPress={goToNextChapter} disabled={currentChapter >= totalChapters - 1}>
          <Text
            style={[
              styles.navButton,
              currentChapter >= totalChapters - 1 && styles.navButtonDisabled,
            ]}
          >
            Next ›
          </Text>
        </Pressable>
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
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  errorText: {
    fontSize: 15,
    color: "#FF3B30",
    textAlign: "center",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E5EA",
  },
  pageIndicator: {
    fontSize: 12,
    color: "#8E8E93",
  },
  navButton: {
    fontSize: 15,
    color: "#007AFF",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  navButtonDisabled: {
    color: "#C7C7CC",
  },
});
