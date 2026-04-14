import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  RefreshControl,
  useColorScheme,
  useWindowDimensions,
} from "react-native";
import Animated from "react-native-reanimated";
import { useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TabHeader, useHeaderScroll, HEADER_CONTENT_INSET } from "../../../lib/tab-header";
import { Ionicons } from "@expo/vector-icons";
import { Host, Button, HStack, Menu, Picker, Section, Text as SwiftText } from "@expo/ui/swift-ui";
import { buttonStyle, clipShape, controlSize, labelStyle, scaleEffect, shadow, tag } from "@expo/ui/swift-ui/modifiers";
import {
  Paths,
  File as ExpoFile,
  Directory,
} from "expo-file-system";
import { parseEpub, extractCoverImage } from "../../../lib/epub-parser";
import { importFromDocumentPicker } from "../../../lib/book-import";
import { useColors } from "../../../lib/colors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BookWithProgress {
  id: number;
  book_id: string;
  title: string | null;
  author: string | null;
  cover_path: string | null;
  epub_path: string | null;
  source: string;
  progress: number | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COVER_ASPECT_RATIO = 1.5; // height = width * 1.5 (standard book cover)
const GRID_GAP = 16;
const HORIZONTAL_PADDING = 16;

type ViewMode = "grid" | "list";
type SortBy = "recent" | "title" | "author";

// ---------------------------------------------------------------------------
// Cover cache helpers
// ---------------------------------------------------------------------------

let coversDirReady = false;

function getCoversDir() {
  return new Directory(Paths.document, "covers");
}

function ensureCoversDirExists() {
  if (coversDirReady) return;
  const dir = getCoversDir();
  if (!dir.exists) {
    dir.create();
  }
  coversDirReady = true;
}

async function extractAndCacheCover(
  epubPath: string,
  bookId: string,
): Promise<string | undefined> {
  try {
    const epub = await parseEpub(epubPath);
    const dataUri = await extractCoverImage(epub);
    if (!dataUri) return undefined;

    // Parse the data URI: data:image/jpeg;base64,<data>
    const match = dataUri.match(/^data:image\/(\w+);base64,(.+)$/s);
    if (!match) return undefined;

    const ext = match[1] === "jpeg" ? "jpg" : match[1]!;
    const base64Data = match[2]!;
    const safeId = bookId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const coverFileName = `${safeId}.${ext}`;

    ensureCoversDirExists();

    const coverFile = new ExpoFile(getCoversDir(), coverFileName);
    // Write base64 cover image to file
    const bytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
    coverFile.write(bytes);

    // Return the file:// URI (strip file:// prefix for Image source compatibility)
    return coverFile.uri.replace(/^file:\/\//, "");
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function PlaceholderCover({
  title,
  author,
  width,
  height,
}: {
  title: string;
  author: string;
  width: number;
  height: number;
}) {
  // Generate a deterministic color from the title
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  const bg = `hsl(${hue}, 35%, 45%)`;

  return (
    <View style={[styles.placeholderCover, { width, height, backgroundColor: bg }]}>
      <Text style={styles.placeholderTitle} numberOfLines={3}>
        {title}
      </Text>
      {author ? (
        <Text style={styles.placeholderAuthor} numberOfLines={2}>
          {author}
        </Text>
      ) : null}
    </View>
  );
}

function BookCard({
  book,
  coverWidth,
  coverHeight,
  onPress,
}: {
  book: BookWithProgress;
  coverWidth: number;
  coverHeight: number;
  onPress: () => void;
}) {
  const progressPercent =
    book.progress !== null && book.progress !== undefined
      ? Math.round(book.progress * 100)
      : null;

  return (
    <Pressable
      style={[styles.bookCard, { width: coverWidth }]}
      onPress={onPress}
    >
      {/* 3D perspective cover */}
      <View style={[styles.coverShadow, { width: coverWidth, height: coverHeight }]}>
        <View style={[styles.coverContainer, { width: coverWidth, height: coverHeight }]}>
          {book.cover_path ? (
            <Image
              source={{
                uri: book.cover_path.startsWith("file://")
                  ? book.cover_path
                  : `file://${book.cover_path}`,
              }}
              style={[styles.coverImage, { width: coverWidth, height: coverHeight }]}
              resizeMode="cover"
            />
          ) : (
            <PlaceholderCover
              title={book.title ?? book.book_id}
              author={book.author ?? ""}
              width={coverWidth}
              height={coverHeight}
            />
          )}
        </View>
      </View>

      {/* Progress + actions row */}
      <View style={styles.bookMeta}>
        {progressPercent !== null ? (
          <Text style={styles.progressText}>{progressPercent}%</Text>
        ) : (
          <View style={styles.newBadge}>
            <Text style={styles.newBadgeText}>NEW</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

function BookListRow({
  book,
  onPress,
  colors,
}: {
  book: BookWithProgress;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const progressPercent =
    book.progress !== null && book.progress !== undefined
      ? Math.round(book.progress * 100)
      : null;

  return (
    <Pressable style={styles.listRow} onPress={onPress}>
      {book.cover_path ? (
        <Image
          source={{
            uri: book.cover_path.startsWith("file://")
              ? book.cover_path
              : `file://${book.cover_path}`,
          }}
          style={styles.listCover}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.listCoverPlaceholder, { backgroundColor: colors.tertiaryText }]}>
          <Ionicons name="book" size={20} color="#fff" />
        </View>
      )}
      <View style={styles.listInfo}>
        <Text style={[styles.listTitle, { color: colors.text }]} numberOfLines={1}>
          {book.title ?? book.book_id}
        </Text>
        {book.author ? (
          <Text style={[styles.listAuthor, { color: colors.secondaryText }]} numberOfLines={1}>
            {book.author}
          </Text>
        ) : null}
      </View>
      {progressPercent !== null ? (
        <Text style={[styles.listProgress, { color: colors.secondaryText }]}>
          {progressPercent}%
        </Text>
      ) : (
        <View style={[styles.newBadge, { backgroundColor: colors.success }]}>
          <Text style={styles.newBadgeText}>NEW</Text>
        </View>
      )}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function LibraryScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const colors = useColors();
  const { scrollY, scrollHandler } = useHeaderScroll();
  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + HEADER_CONTENT_INSET;
  const { width: screenWidth } = useWindowDimensions();
  const [books, setBooks] = useState<BookWithProgress[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sortBy, setSortBy] = useState<SortBy>("recent");

  const numColumns = viewMode === "grid" ? 2 : 1;
  const coverWidth =
    (screenWidth - HORIZONTAL_PADDING * 2 - GRID_GAP * (numColumns - 1)) /
    numColumns;
  const coverHeight = coverWidth * COVER_ASPECT_RATIO;

  const loadBooks = useCallback(async () => {
    const rows = await db.getAllAsync<BookWithProgress>(
      `SELECT b.id, b.book_id, b.title, b.author, b.cover_path, b.epub_path, b.source,
              rp.progress
       FROM books b
       LEFT JOIN reading_positions rp ON rp.book_id = b.book_id
       ORDER BY COALESCE(rp.updated_at, b.import_date) DESC`,
    );
    setBooks(rows);

    // Extract covers for books that have an epub but no cached cover
    for (const book of rows) {
      if (!book.cover_path && book.epub_path) {
        const coverPath = await extractAndCacheCover(book.epub_path, book.book_id);
        if (coverPath) {
          await db.runAsync(
            "UPDATE books SET cover_path = ? WHERE id = ?",
            [coverPath, book.id],
          );
          // Update local state to show the cover
          setBooks((prev) =>
            prev.map((b) =>
              b.id === book.id ? { ...b, cover_path: coverPath } : b,
            ),
          );
        }
      }
    }
  }, [db]);

  // Reload books when the tab is focused (e.g. after reading a book)
  useFocusEffect(
    useCallback(() => {
      loadBooks();
    }, [loadBooks]),
  );

  const handleImport = useCallback(async () => {
    const id = await importFromDocumentPicker(db);
    if (id) loadBooks();
  }, [db, loadBooks]);

  const colorScheme = useColorScheme() ?? "light";

  const headerButtons = (
    <Host matchContents colorScheme={colorScheme}>
      <HStack spacing={6}>
        <Button
          label="Add"
          systemImage="plus"
          onPress={handleImport}
          modifiers={[labelStyle("iconOnly"), buttonStyle("glass"), controlSize("extraLarge"), clipShape("circle"), scaleEffect(1.1), shadow({ radius: 12, x: 5, y: 5, color: "rgba(0, 0, 0, 0.1)" })]}
        />
        <Menu
          label="Options"
          systemImage="ellipsis"
          modifiers={[labelStyle("iconOnly"), buttonStyle("glass"), controlSize("extraLarge"), clipShape("circle"), scaleEffect(1.3), shadow({ radius: 12, x: 5, y: 5, color: "rgba(0, 0, 0, 0.1)" })]}
        >
          <Picker selection={viewMode} onSelectionChange={(v) => setViewMode(v as ViewMode)}>
            <Button label="Grid" systemImage="square.grid.2x2" modifiers={[tag("grid")]} />
            <Button label="List" systemImage="list.bullet" modifiers={[tag("list")]} />
          </Picker>
          <Picker label="Sort by..." selection={sortBy} onSelectionChange={(v) => setSortBy(v as SortBy)}>
            <SwiftText modifiers={[tag("recent")]}>Recent</SwiftText>
            <SwiftText modifiers={[tag("title")]}>Title</SwiftText>
            <SwiftText modifiers={[tag("author")]}>Author</SwiftText>
          </Picker>
        </Menu>
      </HStack>
    </Host>
  );

  const header = (
    <TabHeader title="Library" right={headerButtons} scrollY={scrollY} />
  );

  // Sort books
  const sortedBooks = [...books].sort((a, b) => {
    if (sortBy === "title") {
      return (a.title ?? "").localeCompare(b.title ?? "");
    }
    if (sortBy === "author") {
      return (a.author ?? "").localeCompare(b.author ?? "");
    }
    return 0; // "recent" — already sorted by query
  });

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadBooks();
    setRefreshing(false);
  }, [loadBooks]);

  const handleBookPress = useCallback(
    (bookId: number) => {
      router.push(`/read/${bookId}`);
    },
    [router],
  );

  if (books.length === 0 && !refreshing) {
    return (
      <View style={styles.screen}>
        {header}
        <View style={styles.emptyContent}>
          <Ionicons name="library-outline" size={64} color={colors.tertiaryText} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No books yet</Text>
          <Text style={[styles.emptySubtitle, { color: colors.secondaryText }]}>
            Your synced books will appear here
          </Text>
        </View>
      </View>
    );
  }

  if (viewMode === "list") {
    return (
      <View style={styles.screen}>
        {header}
        <Animated.FlatList
          data={sortedBooks}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={[styles.listContent, { paddingTop: headerHeight }]}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          ItemSeparatorComponent={() => (
            <View style={[styles.listSeparator, { backgroundColor: colors.separator }]} />
          )}
          renderItem={({ item }) => (
            <BookListRow
              book={item}
              colors={colors}
              onPress={() => handleBookPress(item.id)}
            />
          )}
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {header}
      <Animated.FlatList
        key="grid"
        data={sortedBooks}
        keyExtractor={(item) => item.id.toString()}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={[styles.gridContent, { paddingTop: headerHeight }]}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        renderItem={({ item }) => (
          <BookCard
            book={item}
            coverWidth={coverWidth}
            coverHeight={coverHeight}
            onPress={() => handleBookPress(item.id)}
          />
        )}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  gridContent: {
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingTop: 12,
    paddingBottom: 100,
  },
  row: {
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
  },
  bookCard: {
    // Width set dynamically
  },
  coverShadow: {
    borderRadius: 4,
    // 3D depth shadow
    shadowColor: "#000",
    shadowOffset: { width: 2, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  coverContainer: {
    borderRadius: 4,
    overflow: "hidden",
  },
  coverImage: {
    borderRadius: 4,
  },
  placeholderCover: {
    borderRadius: 4,
    justifyContent: "flex-end",
    padding: 12,
  },
  placeholderTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 4,
    textShadowColor: "rgba(0,0,0,0.4)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  placeholderAuthor: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 12,
    fontWeight: "400",
    textShadowColor: "rgba(0,0,0,0.3)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  bookMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 6,
    paddingHorizontal: 2,
  },
  progressText: {
    fontSize: 12,
    color: "#8E8E93",
    fontWeight: "400",
  },
  newBadge: {
    backgroundColor: "#34C759",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  newBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  emptyState: {
    flexGrow: 1,
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
  screen: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingBottom: 100,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
  },
  listCover: {
    width: 44,
    height: 66,
    borderRadius: 4,
  },
  listCoverPlaceholder: {
    width: 44,
    height: 66,
    borderRadius: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  listInfo: {
    flex: 1,
    marginLeft: 12,
  },
  listTitle: {
    fontSize: 16,
    fontWeight: "500",
  },
  listAuthor: {
    fontSize: 14,
    marginTop: 2,
  },
  listProgress: {
    fontSize: 14,
    marginLeft: 8,
  },
  listSeparator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 56,
  },
});
