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
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import {
  parseEpub,
  readChapter,
  extractExcerptAtPosition,
  searchExcerpt,
} from "../../lib/epub-parser";
import { extractText, paginateText, TextPageView } from "../../lib/text-paginator";
import PageFlipper from "../../lib/page-flipper";
import { Host, Menu, Button, Section } from "@expo/ui/swift-ui";
import { labelStyle } from "@expo/ui/swift-ui/modifiers";
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

  const [textPages, setTextPages] = useState<ReturnType<typeof paginateText>>([]);
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

  // Page height calculation — available space for content, snapped to line height
  // so page breaks always fall between lines (no cut text)
  const rawPageHeight =
    screenHeight - insets.top - insets.bottom - HEADER_HEIGHT - FOOTER_HEIGHT;
  const pageHeight =
    computedLineHeight > 0
      ? Math.floor(rawPageHeight / computedLineHeight) * computedLineHeight
      : rawPageHeight;

  // Track pages-per-chapter for global page number calculation
  const chapterPageCountsRef = useRef<Map<number, number>>(new Map());

  useEffect(() => {
    if (!bookId || !settingsLoaded) return;
    loadBook();
  }, [bookId, settingsLoaded]);

  // Re-paginate when settings change (font size, etc.)
  useEffect(() => {
    if (!bookId || totalChapters === 0 || !settingsLoaded || textPages.length === 0) return;
    // Re-load the entire book with new settings
    loadBook();
  }, [settings.fontSize, settings.fontFamily, settings.lineSpacing, settings.margins, settings.textAlign]);

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

      // Load ALL chapters and paginate the entire book
      let fullText = "";
      for (let i = 0; i < epub.spine.length; i++) {
        const xhtml = await readChapter(epub, i);
        const chapterText = extractText(xhtml);
        if (chapterText.length > 0) {
          fullText += (i > 0 ? "\n\n" : "") + chapterText;
        }
      }

      const pages = paginateText(fullText, screenWidth, pageHeight, settings.fontSize, computedLineHeight);
      setTextPages(pages);
      setTotalPages(pages.length);

      // Restore saved position
      if (startPage > 0 && startPage < pages.length) {
        setCurrentPage(startPage);
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

  function hapticTick() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

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
        <Pressable
          style={[styles.pageContainer, { height: pageHeight }]}
        >
          {/* Page flipper with text pages */}
          {textPages.length > 0 ? (
            <PageFlipper
              key={`book-${textPages.length}`}
              data={textPages}
              pageSize={{ width: screenWidth, height: pageHeight }}
              portrait
              pressable={false}
              renderPage={(page) => (
                <TextPageView
                  page={page}
                  fontSize={settings.fontSize}
                  lineHeight={computedLineHeight}
                  fontFamily={computedFontFamily}
                  textColor={theme.textColor}
                  backgroundColor={theme.backgroundColor}
                  textAlign={settings.textAlign}
                  pageHeight={pageHeight}
                  pageWidth={screenWidth}
                />
              )}
              onFlippedEnd={(index) => {
                userHasNavigatedRef.current = true;
                setCurrentPage(index);
                hapticTick();
              }}
              onPageDragStart={() => setControlsVisible(false)}
            />
          ) : (
            <View style={styles.centered}>
              <ActivityIndicator size="small" color={theme.secondaryTextColor} />
            </View>
          )}
        </Pressable>
      )}

      {/* Footer */}
      <View style={[styles.footer, { height: FOOTER_HEIGHT }]}>
        <Text style={[styles.pageIndicator, { color: theme.secondaryTextColor }]}>
          {totalPages > 1 ? `${currentPage + 1} of ${totalPages}` : "—"}
        </Text>
        <Host matchContents colorScheme="dark">
          <Menu label="" systemImage="list.bullet" modifiers={[labelStyle("iconOnly")]}>
            <Section>
              <Button
                label={`Contents · ${Math.round((currentPage / Math.max(totalPages, 1)) * 100)}%`}
                systemImage="list.bullet"
                onPress={() => setTocVisible(true)}
              />
              <Button
                label="Search Book"
                systemImage="magnifyingglass"
                onPress={() => setSearchVisible(true)}
              />
              <Button
                label="Themes & Settings"
                systemImage="textformat.size"
                onPress={() => setSettingsVisible(true)}
              />
            </Section>
            <Section>
              <Button label="Share" systemImage="square.and.arrow.up" onPress={() => {}} />
              <Button label="Bookmark" systemImage="bookmark" onPress={() => {}} />
            </Section>
          </Menu>
        </Host>
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
  pageEdgeShadow: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: -20,
    width: 20,
    zIndex: 10,
    backgroundColor: "transparent",
    shadowColor: "#000",
    shadowOffset: { width: -5, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 20,
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
