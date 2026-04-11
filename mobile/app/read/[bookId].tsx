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
import { Ionicons } from "@expo/vector-icons";
import {
  parseEpub,
  readChapter,
  extractExcerptAtPosition,
  searchExcerpt,
} from "../../lib/epub-parser";
import { renderXhtml, resetKeyCounter } from "../../lib/xhtml-renderer";
import type { ParsedEpub, TocEntry } from "../../lib/epub-parser";
import { TocModal } from "../../lib/toc-modal";
import {
  useReaderSettings,
  getTheme,
  getLineHeight,
  getHorizontalMargin,
  getFontFamily,
} from "../../lib/reader-settings";
import { ReaderSettingsPanel } from "../../lib/reader-settings-panel";
import { ControlsOverlay } from "../../lib/controls-overlay";
import {
  enqueueSync,
  flushSyncQueue,
  resolveProgressOnOpen,
  cancelPendingFlush,
} from "../../lib/sync-engine";
import { SyncConflictPicker } from "../../lib/sync-conflict-picker";
import { SearchModal } from "../../lib/search-modal";

/** Find a TOC entry label matching a spine href (searching the tree recursively). */
function findTocEntryByHref(toc: TocEntry[], href: string): string | null {
  for (const entry of toc) {
    const entryBase = entry.href.split("#")[0];
    if (href === entryBase || href.endsWith("/" + entryBase)) {
      return entry.label;
    }
    if (entry.children?.length) {
      const found = findTocEntryByHref(entry.children, href);
      if (found) return found;
    }
  }
  return null;
}

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

// Debounce delay for saving progress to SQLite (ms)
const PROGRESS_SAVE_DEBOUNCE = 1000;

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
  const [controlsVisible, setControlsVisible] = useState(false);
  const [tocVisible, setTocVisible] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);

  // Sync conflict picker state
  const [conflictData, setConflictData] = useState<{
    localProgress: number;
    localExcerpt?: string;
    remoteProgress: number;
    remoteExcerpt?: string;
    remoteSource: string;
    remotePosition: string;
  } | null>(null);

  // The text book_id used for reading_positions (vs the integer id from route params)
  const textBookIdRef = useRef<string | null>(null);
  // Whether we've restored the saved position (only on first load)
  const restoredPositionRef = useRef(false);
  // Saved position to restore after chapter loads
  const pendingRestorePageRef = useRef<number | null>(null);
  // Debounce timer for saving progress
  const saveProgressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Whether the user has turned a page (suppresses sync prompts)
  const userHasNavigatedRef = useRef(false);

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

      const row = await db.getFirstAsync<{ epub_path: string; title: string; book_id: string }>(
        "SELECT epub_path, title, book_id FROM books WHERE id = ?",
        [bookId!],
      );

      if (!row?.epub_path) {
        setError("Book not found or EPUB not downloaded");
        setLoading(false);
        return;
      }

      textBookIdRef.current = row.book_id;
      setBookTitle(row.title || bookId!);
      const epub = await parseEpub(row.epub_path);
      epubRef.current = epub;
      setTotalChapters(epub.spine.length);

      // Check for saved reading position
      let startChapter = 0;
      let startPage = 0;

      if (!restoredPositionRef.current) {
        const saved = await db.getFirstAsync<{ position: string }>(
          "SELECT position FROM reading_positions WHERE book_id = ?",
          [row.book_id],
        );
        if (saved?.position) {
          try {
            const pos = JSON.parse(saved.position);
            if (typeof pos.chapter === "number" && pos.chapter < epub.spine.length) {
              startChapter = pos.chapter;
              startPage = typeof pos.page === "number" ? pos.page : 0;
            }
          } catch {
            // Invalid position JSON — start from beginning
          }
        }
        restoredPositionRef.current = true;
      }

      // If restoring to a non-zero page, stash it for after content measurement
      if (startPage > 0) {
        pendingRestorePageRef.current = startPage;
      }

      if (startChapter > 0) {
        setCurrentChapter(startChapter);
      } else {
        // Render first chapter directly
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
      }

      // Non-blocking: check remote progress in background
      resolveProgressOnOpen(db, row.book_id).then(async (result) => {
        if (!result || result.action === "use_local") return;
        if (userHasNavigatedRef.current) return;

        const remote = result.remote;
        if (!remote) return;

        // --- "prompt" action: show conflict picker ---
        if (result.action === "prompt") {
          // Load local excerpt from SQLite for display
          const localRow = await db.getFirstAsync<{ excerpt: string | null }>(
            "SELECT excerpt FROM reading_positions WHERE book_id = ?",
            [row.book_id],
          );
          setConflictData({
            localProgress: result.localProgress ?? 0,
            localExcerpt: localRow?.excerpt ?? undefined,
            remoteProgress: result.remoteProgress ?? remote.progress,
            remoteExcerpt: remote.excerpt,
            remoteSource: remote.source ?? "kindle",
            remotePosition: remote.position,
          });
          return;
        }

        // --- "use_remote" action: auto-apply ---
        applyRemotePosition(remote, epub);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load book");
    } finally {
      setLoading(false);
    }
  }

  /** Navigate to a remote position using the 3-tier strategy. */
  async function applyRemotePosition(
    remote: NonNullable<Awaited<ReturnType<typeof resolveProgressOnOpen>>>["remote"] & {},
    epub: ParsedEpub,
  ) {
    if (userHasNavigatedRef.current) return;

    // --- Strategy 1: same-source mobile position (JSON { chapter, page }) ---
    if (remote.source === "mobile") {
      try {
        const remotePos = JSON.parse(remote.position);
        if (
          typeof remotePos.chapter === "number" &&
          remotePos.chapter < epub.spine.length
        ) {
          if (typeof remotePos.page === "number" && remotePos.page > 0) {
            pendingRestorePageRef.current = remotePos.page;
          }
          setCurrentChapter(remotePos.chapter);
          return;
        }
      } catch {
        // Not valid JSON — fall through to excerpt matching
      }
    }

    // --- Strategy 2: excerpt-based text matching (cross-renderer sync) ---
    if (remote.excerpt) {
      try {
        const matches = await searchExcerpt(
          epub,
          remote.excerpt,
          remote.progress,
        );
        if (userHasNavigatedRef.current) return;
        if (matches.length > 0) {
          const best = matches[0]!;
          const chapterPages =
            chapterPageCountsRef.current.get(best.chapter) ?? 1;
          const estimatedPage = Math.round(
            best.chapterProgress * (chapterPages - 1),
          );
          if (estimatedPage > 0) {
            pendingRestorePageRef.current = estimatedPage;
          }
          setCurrentChapter(best.chapter);
          return;
        }
      } catch {
        // Excerpt search failed — fall through to percentage fallback
      }
    }

    // --- Strategy 3: percentage approximation (fallback) ---
    if (typeof remote.progress === "number" && remote.progress > 0) {
      const targetChapter = Math.min(
        Math.floor(remote.progress * epub.spine.length),
        epub.spine.length - 1,
      );
      setCurrentChapter(targetChapter);
    }
  }

  /** Handle user picking the remote option in the conflict picker. */
  async function handlePickRemote() {
    if (!conflictData) return;
    setConflictData(null);
    userHasNavigatedRef.current = true;

    const epub = epubRef.current;
    if (!epub) return;

    // Build a minimal remote object from stored conflict data
    await applyRemotePosition(
      {
        bookId: textBookIdRef.current ?? "",
        position: conflictData.remotePosition,
        progress: conflictData.remoteProgress,
        excerpt: conflictData.remoteExcerpt,
        source: conflictData.remoteSource,
        updatedAt: 0,
      },
      epub,
    );
  }

  /** Handle user picking the local option — just dismiss the picker. */
  function handlePickLocal() {
    setConflictData(null);
    userHasNavigatedRef.current = true;
  }

  /** Navigate to a chapter by TOC entry href. */
  function handleTocSelect(href: string) {
    const epub = epubRef.current;
    if (!epub) return;

    const hrefBase = href.split("#")[0];
    const spineIndex = epub.spine.findIndex(
      (s) => s.href === hrefBase || s.href.endsWith("/" + hrefBase),
    );

    if (spineIndex >= 0) {
      userHasNavigatedRef.current = true;
      setCurrentChapter(spineIndex);
    }

    setTocVisible(false);
    setControlsVisible(false);
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

      // Update chapter page counts for global page tracking
      chapterPageCountsRef.current.set(currentChapter, pages);

      // Restore saved page position if pending
      const pendingPage = pendingRestorePageRef.current;
      if (pendingPage !== null && pendingPage > 0 && pendingPage < pages) {
        pendingRestorePageRef.current = null;
        setCurrentPage(pendingPage);
        scrollRef.current?.scrollTo({ y: pendingPage * pageHeight, animated: false });
      } else {
        pendingRestorePageRef.current = null;
        setCurrentPage(0);
      }

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

  // --- Progress persistence ---

  /** Save current reading position to SQLite (debounced). */
  function scheduleSaveProgress(chapter: number, page: number) {
    if (saveProgressTimerRef.current) {
      clearTimeout(saveProgressTimerRef.current);
    }
    saveProgressTimerRef.current = setTimeout(() => {
      saveProgressToDb(chapter, page);
    }, PROGRESS_SAVE_DEBOUNCE);
  }

  async function saveProgressToDb(chapter: number, page: number) {
    const bid = textBookIdRef.current;
    if (!bid) return;

    const counts = chapterPageCountsRef.current;
    let pagesBefore = 0;
    let total = 0;
    for (let i = 0; i < totalChapters; i++) {
      const cp = counts.get(i) ?? 1;
      if (i < chapter) pagesBefore += cp;
      total += cp;
    }
    const gPage = pagesBefore + page + 1;
    const progress = total > 0 ? gPage / total : 0;

    // Position stored as JSON: { chapter, page }
    const position = JSON.stringify({ chapter, page });

    // Extract ~500 char excerpt at current position for cross-device sync
    let excerpt: string | undefined;
    const epub = epubRef.current;
    if (epub) {
      const chapterPages = counts.get(chapter) ?? 1;
      const positionRatio = chapterPages > 1 ? page / (chapterPages - 1) : 0;
      try {
        excerpt = await extractExcerptAtPosition(epub, chapter, positionRatio);
      } catch {
        // Non-critical — sync will still work via progress percentage fallback
      }
    }

    await db.runAsync(
      `INSERT INTO reading_positions (book_id, position, current_page, total_pages, progress, excerpt, source, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'mobile', datetime('now'))
       ON CONFLICT(book_id) DO UPDATE SET
         position = excluded.position,
         current_page = excluded.current_page,
         total_pages = excluded.total_pages,
         progress = excluded.progress,
         excerpt = excluded.excerpt,
         updated_at = datetime('now')`,
      [bid, position, gPage, total, progress, excerpt ?? null],
    );

    // Enqueue for background sync to backend (debounced internally at 3s)
    enqueueSync(db, {
      bookId: bid,
      bookTitle: bookTitle || undefined,
      position,
      currentPage: gPage,
      totalPages: total,
      progress,
      excerpt,
    });
  }

  // Save progress on every page/chapter change
  useEffect(() => {
    if (!textBookIdRef.current || totalChapters === 0) return;
    scheduleSaveProgress(currentChapter, currentPage);
  }, [currentPage, currentChapter]);

  // Save progress immediately on unmount, flush sync queue
  useEffect(() => {
    return () => {
      if (saveProgressTimerRef.current) {
        clearTimeout(saveProgressTimerRef.current);
      }
      cancelPendingFlush();
      if (textBookIdRef.current && totalChapters > 0) {
        saveProgressToDb(currentChapter, currentPage);
      }
      // Fire-and-forget flush of any pending sync items
      flushSyncQueue(db);
    };
  }, [currentChapter, currentPage, totalChapters]);

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
    userHasNavigatedRef.current = true;
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
    userHasNavigatedRef.current = true;
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

  function hideControls() {
    setControlsVisible(false);
  }

  function handleTapNavigation(locationX: number) {
    const leftZone = screenWidth * 0.4;
    const rightZone = screenWidth * 0.6;

    if (locationX < leftZone) {
      setControlsVisible(false);
      goToPreviousPage();
    } else if (locationX > rightZone) {
      setControlsVisible(false);
      goToNextPage();
    } else {
      // Center 20%: toggle controls overlay
      setControlsVisible((v) => !v);
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
        runOnJS(hideControls)();
        runOnJS(animatePageTurn)("left");
      } else if (swipedRight) {
        runOnJS(hideControls)();
        runOnJS(animatePageTurn)("right");
      } else {
        runOnJS(snapBack)();
      }
    });

  /** Resolve a global page number to the chapter name it falls in. */
  function getChapterNameForPage(page: number) {
    const epub = epubRef.current;
    if (!epub) return "";
    const counts = chapterPageCountsRef.current;
    let accumulated = 0;
    for (let i = 0; i < totalChapters; i++) {
      accumulated += counts.get(i) ?? 1;
      if (page <= accumulated) {
        const toc = epub.toc;
        const spineHref = epub.spine[i]?.href;
        if (toc && spineHref) {
          const entry = findTocEntryByHref(toc, spineHref);
          if (entry) return entry;
        }
        return `Chapter ${i + 1}`;
      }
    }
    return "";
  }

  /** Navigate to a specific global page via scrubber. */
  function handleScrubEnd(page: number) {
    const counts = chapterPageCountsRef.current;
    let accumulated = 0;
    for (let i = 0; i < totalChapters; i++) {
      const chapterPages = counts.get(i) ?? 1;
      if (page <= accumulated + chapterPages) {
        const pageWithinChapter = page - accumulated - 1;
        userHasNavigatedRef.current = true;
        if (i === currentChapter) {
          const target = Math.max(0, pageWithinChapter);
          scrollRef.current?.scrollTo({ y: target * pageHeight, animated: false });
          setCurrentPage(target);
        } else {
          pendingRestorePageRef.current = Math.max(0, pageWithinChapter);
          setCurrentChapter(i);
        }
        hapticTick();
        return;
      }
      accumulated += chapterPages;
    }
  }

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
        <Pressable
          onPress={() => setTocVisible(true)}
          hitSlop={8}
        >
          <Ionicons name="list" size={20} color={theme.secondaryTextColor} />
        </Pressable>
      </View>

      {/* Controls overlay — appears on center tap */}
      <ControlsOverlay
        visible={controlsVisible}
        theme={theme}
        pagesLeftInChapter={Math.max(0, totalPages - currentPage - 1)}
        progressPercent={
          globalTotalPages > 0
            ? Math.round((globalPage / globalTotalPages) * 100)
            : 0
        }
        globalPage={globalPage}
        globalTotalPages={globalTotalPages}
        getChapterNameForPage={getChapterNameForPage}
        onScrubEnd={handleScrubEnd}
        onOpenSettings={() => {
          setControlsVisible(false);
          setSettingsVisible(true);
        }}
        onOpenContents={() => {
          setControlsVisible(false);
          setTocVisible(true);
        }}
        onOpenSearch={() => {
          setControlsVisible(false);
          setSearchVisible(true);
        }}
        onBookmark={() => {
          // TODO: implement bookmarks (stretch)
        }}
        onShare={() => {
          // TODO: implement share (stretch)
        }}
      />

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

      {/* Sync conflict picker */}
      <SyncConflictPicker
        visible={conflictData !== null}
        bookTitle={bookTitle}
        local={{
          label: "Mobile",
          source: "mobile",
          progress: conflictData?.localProgress ?? 0,
          excerpt: conflictData?.localExcerpt,
          icon: "phone-portrait-outline",
        }}
        remote={{
          label: conflictData?.remoteSource === "mobile" ? "Mobile" : "Kindle",
          source: conflictData?.remoteSource ?? "kindle",
          progress: conflictData?.remoteProgress ?? 0,
          excerpt: conflictData?.remoteExcerpt,
          icon: conflictData?.remoteSource === "mobile"
            ? "phone-portrait-outline"
            : "book-outline",
        }}
        onPickLocal={handlePickLocal}
        onPickRemote={handlePickRemote}
      />

      {/* Table of Contents */}
      <TocModal
        visible={tocVisible}
        toc={epubRef.current?.toc ?? []}
        currentChapterHref={epubRef.current?.spine[currentChapter]?.href}
        theme={theme}
        onSelectEntry={handleTocSelect}
        onClose={() => setTocVisible(false)}
      />

      {/* Search */}
      <SearchModal
        visible={searchVisible}
        epub={epubRef.current}
        theme={theme}
        onSelectResult={(chapter, chapterProgress) => {
          userHasNavigatedRef.current = true;
          const pageCount = chapterPageCountsRef.current.get(chapter) ?? 1;
          const estimatedPage = Math.max(0, Math.floor(chapterProgress * pageCount));
          if (chapter === currentChapter) {
            const scrollY = estimatedPage * pageHeight;
            scrollRef.current?.scrollTo({ y: scrollY, animated: false });
            setCurrentPage(estimatedPage);
          } else {
            pendingRestorePageRef.current = estimatedPage;
            setCurrentChapter(chapter);
          }
          setSearchVisible(false);
          setControlsVisible(false);
        }}
        onClose={() => setSearchVisible(false)}
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
