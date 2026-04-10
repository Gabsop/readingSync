import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useSQLiteContext } from "expo-sqlite";
import { parseEpub, readChapter } from "../../lib/epub-parser";
import { renderXhtml, resetKeyCounter } from "../../lib/xhtml-renderer";
import type { ParsedEpub } from "../../lib/epub-parser";

// Layout constants
const HEADER_HEIGHT = 40;
const FOOTER_HEIGHT = 36;
const CONTENT_PADDING_H = 24;
const CONTENT_PADDING_V = 16;

export default function ReaderScreen() {
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const router = useRouter();
  const db = useSQLiteContext();
  const { height: screenHeight, width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [chapterContent, setChapterContent] = useState<React.ReactNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentChapter, setCurrentChapter] = useState(0);
  const [totalChapters, setTotalChapters] = useState(0);
  const [bookTitle, setBookTitle] = useState(bookId ?? "");

  // Pagination state
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [globalPage, setGlobalPage] = useState(1);
  const [globalTotalPages, setGlobalTotalPages] = useState(1);
  const scrollRef = useRef<ScrollView>(null);
  const epubRef = useRef<ParsedEpub | null>(null);

  // Page height calculation — available space for content
  const pageHeight =
    screenHeight - insets.top - insets.bottom - HEADER_HEIGHT - FOOTER_HEIGHT;

  // Track pages-per-chapter for global page number calculation
  const chapterPageCountsRef = useRef<Map<number, number>>(new Map());

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
      epubRef.current = epub;
      setTotalChapters(epub.spine.length);

      // Render first chapter
      const xhtml = await readChapter(epub, 0);
      resetKeyCounter();
      const rendered = renderXhtml(xhtml, {
        baseFontSize: 17,
        resolveAsset: (href) => undefined,
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

      let epub = epubRef.current;
      if (!epub) {
        const row = await db.getFirstAsync<{ epub_path: string }>(
          "SELECT epub_path FROM books WHERE id = ?",
          [bookId!],
        );
        if (!row?.epub_path) return;
        epub = await parseEpub(row.epub_path);
        epubRef.current = epub;
      }

      const xhtml = await readChapter(epub, spineIndex);
      resetKeyCounter();
      const rendered = renderXhtml(xhtml, {
        baseFontSize: 17,
      });
      setChapterContent(rendered);
      setCurrentPage(0);
      // Scroll to top of new chapter
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load chapter");
    } finally {
      setLoading(false);
    }
  }

  // --- Pagination callbacks ---

  const handleContentSizeChange = useCallback(
    (_w: number, contentHeight: number) => {
      if (contentHeight <= 0 || pageHeight <= 0) return;
      const pages = Math.max(1, Math.ceil(contentHeight / pageHeight));
      setTotalPages(pages);
      setCurrentPage(0);

      // Update chapter page counts for global page tracking
      chapterPageCountsRef.current.set(currentChapter, pages);
      recalcGlobalPages();
    },
    [pageHeight, currentChapter],
  );

  function recalcGlobalPages() {
    const counts = chapterPageCountsRef.current;
    let total = 0;
    let pagesBefore = 0;
    for (let i = 0; i < totalChapters; i++) {
      const chapterPages = counts.get(i) ?? 1;
      if (i < currentChapter) pagesBefore += chapterPages;
      total += chapterPages;
    }
    setGlobalTotalPages(total);
    setGlobalPage(pagesBefore + currentPage + 1);
  }

  // Recalc global page whenever currentPage or currentChapter changes
  useEffect(() => {
    recalcGlobalPages();
  }, [currentPage, currentChapter, totalPages]);

  const handleScroll = useCallback(
    (e: { nativeEvent: { contentOffset: { y: number } } }) => {
      const offsetY = e.nativeEvent.contentOffset.y;
      const page = Math.round(offsetY / pageHeight);
      if (page !== currentPage) {
        setCurrentPage(page);
      }
    },
    [pageHeight, currentPage],
  );

  // --- Navigation ---

  function goToNextPage() {
    if (currentPage < totalPages - 1) {
      const nextPage = currentPage + 1;
      scrollRef.current?.scrollTo({ y: nextPage * pageHeight, animated: true });
      setCurrentPage(nextPage);
    } else if (currentChapter < totalChapters - 1) {
      // Advance to next chapter
      setCurrentChapter((c) => c + 1);
    }
  }

  function goToPreviousPage() {
    if (currentPage > 0) {
      const prevPage = currentPage - 1;
      scrollRef.current?.scrollTo({ y: prevPage * pageHeight, animated: true });
      setCurrentPage(prevPage);
    } else if (currentChapter > 0) {
      // Go to previous chapter (last page) — handled after chapter loads
      setCurrentChapter((c) => c - 1);
      // TODO: scroll to last page of previous chapter after it loads
    }
  }

  function handleTap(locationX: number) {
    const leftZone = screenWidth * 0.4;
    const rightZone = screenWidth * 0.6;

    if (locationX < leftZone) {
      goToPreviousPage();
    } else if (locationX > rightZone) {
      goToNextPage();
    }
    // Center 20%: toggle controls (will be implemented in controls overlay task)
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { height: HEADER_HEIGHT }]}>
        <View style={styles.headerSpacer} />
        <Text style={styles.title} numberOfLines={1}>
          {bookTitle}
        </Text>
        <Pressable onPress={() => router.back()} style={styles.closeButtonContainer}>
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
        <Pressable
          style={{ flex: 1 }}
          onPress={(e) => handleTap(e.nativeEvent.locationX)}
        >
          <View style={[styles.pageContainer, { height: pageHeight }]}>
            <ScrollView
              ref={scrollRef}
              pagingEnabled
              showsVerticalScrollIndicator={false}
              onContentSizeChange={handleContentSizeChange}
              onScroll={handleScroll}
              scrollEventThrottle={16}
              decelerationRate="fast"
              snapToInterval={pageHeight}
              contentContainerStyle={styles.scrollContent}
              pointerEvents="none"
            >
              {chapterContent}
            </ScrollView>
          </View>
        </Pressable>
      )}

      {/* Footer */}
      <View style={[styles.footer, { height: FOOTER_HEIGHT }]}>
        <Text style={styles.pageIndicator}>
          {globalTotalPages > 1
            ? `${globalPage} of ${globalTotalPages}`
            : "—"}
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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  headerSpacer: {
    width: 34,
  },
  title: {
    fontSize: 13,
    color: "#8E8E93",
    flex: 1,
    textAlign: "center",
  },
  closeButtonContainer: {
    width: 34,
    alignItems: "flex-end",
  },
  closeButton: {
    fontSize: 18,
    color: "#8E8E93",
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
  pageContainer: {
    overflow: "hidden",
  },
  scrollContent: {
    paddingHorizontal: CONTENT_PADDING_H,
    paddingVertical: CONTENT_PADDING_V,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  pageIndicator: {
    fontSize: 12,
    color: "#8E8E93",
  },
});
