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
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  Easing,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { parseEpub, readChapter } from "../../lib/epub-parser";
import { renderXhtml, resetKeyCounter } from "../../lib/xhtml-renderer";
import type { ParsedEpub } from "../../lib/epub-parser";
import {
  useReaderSettings,
  getTheme,
  getLineHeight,
  getHorizontalMargin,
  getFontFamily,
} from "../../lib/reader-settings";
import { ReaderSettingsPanel } from "../../lib/reader-settings-panel";

// Gesture thresholds
const SWIPE_THRESHOLD_RATIO = 0.25; // 25% of screen width to trigger page turn
const SWIPE_VELOCITY_THRESHOLD = 500; // px/s — fast flick triggers regardless of distance
const SLIDE_DURATION = 250; // ms for slide-out animation
const SPRING_CONFIG = { damping: 20, stiffness: 300 }; // snap-back spring

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
  const [settingsVisible, setSettingsVisible] = useState(false);

  // Reader settings
  const {
    settings,
    loaded: settingsLoaded,
    update: updateSettings,
    increaseFontSize,
    decreaseFontSize,
    canIncrease,
    canDecrease,
  } = useReaderSettings(db);

  const theme = getTheme(settings.theme);
  const computedLineHeight = getLineHeight(settings.lineSpacing, settings.fontSize);
  const computedMargin = getHorizontalMargin(settings.margins);
  const computedFontFamily = getFontFamily(settings.fontFamily);

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
    if (!bookId || !settingsLoaded) return;
    loadBook();
  }, [bookId, settingsLoaded]);

  // Re-render chapter when settings change (after initial load)
  useEffect(() => {
    if (!bookId || totalChapters === 0 || !settingsLoaded) return;
    loadChapter(currentChapter);
  }, [currentChapter, totalChapters, settings.fontSize, settings.fontFamily, settings.theme, settings.lineSpacing, settings.margins, settings.textAlign]);

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
        baseFontSize: settings.fontSize,
        fontFamily: computedFontFamily,
        lineHeight: computedLineHeight,
        textColor: theme.textColor,
        linkColor: theme.linkColor,
        textAlign: settings.textAlign,
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
        baseFontSize: settings.fontSize,
        fontFamily: computedFontFamily,
        lineHeight: computedLineHeight,
        textColor: theme.textColor,
        linkColor: theme.linkColor,
        textAlign: settings.textAlign,
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

  // Shared values for swipe animation
  const translateX = useSharedValue(0);
  const pageShadowOpacity = useSharedValue(0);
  const isAnimating = useRef(false);

  function hapticTick() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  function goToNextPage() {
    if (isAnimating.current) return;
    if (currentPage < totalPages - 1) {
      hapticTick();
      const nextPage = currentPage + 1;
      scrollRef.current?.scrollTo({ y: nextPage * pageHeight, animated: true });
      setCurrentPage(nextPage);
    } else if (currentChapter < totalChapters - 1) {
      hapticTick();
      setCurrentChapter((c) => c + 1);
    }
  }

  function goToPreviousPage() {
    if (isAnimating.current) return;
    if (currentPage > 0) {
      hapticTick();
      const prevPage = currentPage - 1;
      scrollRef.current?.scrollTo({ y: prevPage * pageHeight, animated: true });
      setCurrentPage(prevPage);
    } else if (currentChapter > 0) {
      hapticTick();
      setCurrentChapter((c) => c - 1);
      // TODO: scroll to last page of previous chapter after it loads
    }
  }

  function finishPageTurnNext() {
    isAnimating.current = false;
    goToNextPage();
  }

  function finishPageTurnPrev() {
    isAnimating.current = false;
    goToPreviousPage();
  }

  /** Animate page sliding off-screen, then navigate and reset */
  function animatePageTurn(direction: "left" | "right") {
    isAnimating.current = true;
    const target = direction === "left" ? -screenWidth : screenWidth;
    const finisher = direction === "left" ? finishPageTurnNext : finishPageTurnPrev;

    translateX.value = withTiming(
      target,
      { duration: SLIDE_DURATION, easing: Easing.out(Easing.cubic) },
      (finished) => {
        if (finished) {
          translateX.value = 0;
          pageShadowOpacity.value = 0;
          runOnJS(finisher)();
        }
      },
    );
    pageShadowOpacity.value = withTiming(0.15, { duration: SLIDE_DURATION });
  }

  /** Snap back to origin (cancelled swipe) */
  function snapBack() {
    translateX.value = withSpring(0, SPRING_CONFIG);
    pageShadowOpacity.value = withTiming(0, { duration: 150 });
  }

  // --- Gestures ---

  function handleTapNavigation(locationX: number) {
    const leftZone = screenWidth * 0.4;
    const rightZone = screenWidth * 0.6;

    if (locationX < leftZone) {
      goToPreviousPage();
    } else if (locationX > rightZone) {
      goToNextPage();
    } else {
      // Center 20%: toggle settings panel
      setSettingsVisible((v) => !v);
    }
  }

  const tapGesture = Gesture.Tap()
    .onEnd((e) => {
      runOnJS(handleTapNavigation)(e.x);
    });

  const panGesture = Gesture.Pan()
    .activeOffsetX([-15, 15]) // Must move 15px horizontally before activating
    .failOffsetY([-10, 10]) // Cancel if vertical movement exceeds 10px
    .onUpdate((e) => {
      translateX.value = e.translationX;
      // Shadow grows with swipe distance
      pageShadowOpacity.value = Math.min(
        0.2,
        Math.abs(e.translationX) / screenWidth * 0.4,
      );
    })
    .onEnd((e) => {
      const swipeThreshold = screenWidth * SWIPE_THRESHOLD_RATIO;
      const swipedLeft =
        e.translationX < -swipeThreshold || e.velocityX < -SWIPE_VELOCITY_THRESHOLD;
      const swipedRight =
        e.translationX > swipeThreshold || e.velocityX > SWIPE_VELOCITY_THRESHOLD;

      if (swipedLeft) {
        runOnJS(animatePageTurn)("left");
      } else if (swipedRight) {
        runOnJS(animatePageTurn)("right");
      } else {
        runOnJS(snapBack)();
      }
    });

  const composedGesture = Gesture.Race(panGesture, tapGesture);

  // Animated styles
  const animatedPageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const animatedShadowStyle = useAnimatedStyle(() => ({
    opacity: pageShadowOpacity.value,
  }));

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.backgroundColor }]}>
      {/* Header */}
      <View style={[styles.header, { height: HEADER_HEIGHT }]}>
        <View style={styles.headerSpacer} />
        <Text style={[styles.title, { color: theme.secondaryTextColor }]} numberOfLines={1}>
          {bookTitle}
        </Text>
        <Pressable onPress={() => router.back()} style={styles.closeButtonContainer}>
          <Text style={[styles.closeButton, { color: theme.secondaryTextColor }]}>✕</Text>
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
        <GestureDetector gesture={composedGesture}>
          <Animated.View style={[{ flex: 1 }, animatedPageStyle]}>
            {/* Page edge shadow during swipe */}
            <Animated.View
              style={[styles.pageShadow, animatedShadowStyle]}
              pointerEvents="none"
            />
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
                contentContainerStyle={[
                  styles.scrollContent,
                  { paddingHorizontal: computedMargin },
                ]}
                pointerEvents="none"
              >
                {chapterContent}
              </ScrollView>
            </View>
          </Animated.View>
        </GestureDetector>
      )}

      {/* Footer */}
      <View style={[styles.footer, { height: FOOTER_HEIGHT }]}>
        <Text style={[styles.pageIndicator, { color: theme.secondaryTextColor }]}>
          {globalTotalPages > 1
            ? `${globalPage} of ${globalTotalPages}`
            : "—"}
        </Text>
      </View>

      {/* Settings panel */}
      <ReaderSettingsPanel
        visible={settingsVisible}
        settings={settings}
        canIncrease={canIncrease}
        canDecrease={canDecrease}
        onUpdate={updateSettings}
        onIncreaseFontSize={increaseFontSize}
        onDecreaseFontSize={decreaseFontSize}
        onClose={() => setSettingsVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    flex: 1,
    textAlign: "center",
  },
  closeButtonContainer: {
    width: 34,
    alignItems: "flex-end",
  },
  closeButton: {
    fontSize: 18,
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
  pageShadow: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#000",
    zIndex: 10,
    opacity: 0,
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
  },
});
