import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import {
  Paths,
  File as ExpoFile,
  Directory,
} from "expo-file-system";
import { parseEpub, extractCoverImage } from "../../lib/epub-parser";

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

const NUM_COLUMNS = 2;
const COVER_ASPECT_RATIO = 1.5; // height = width * 1.5 (standard book cover)
const GRID_GAP = 16;
const HORIZONTAL_PADDING = 16;

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
        <Ionicons name="ellipsis-horizontal" size={16} color="#8E8E93" />
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function LibraryScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const [books, setBooks] = useState<BookWithProgress[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const coverWidth =
    (screenWidth - HORIZONTAL_PADDING * 2 - GRID_GAP * (NUM_COLUMNS - 1)) /
    NUM_COLUMNS;
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
      <View style={styles.container}>
        <FlatList
          data={[]}
          renderItem={null}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          contentContainerStyle={styles.emptyState}
          ListEmptyComponent={
            <View style={styles.emptyContent}>
              <Ionicons name="library-outline" size={64} color="#C7C7CC" />
              <Text style={styles.emptyTitle}>No books yet</Text>
              <Text style={styles.emptySubtitle}>
                Import an EPUB to start reading
              </Text>
            </View>
          }
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={books}
        keyExtractor={(item) => item.id.toString()}
        numColumns={NUM_COLUMNS}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.gridContent}
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
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  gridContent: {
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingTop: 12,
    paddingBottom: 32,
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
    color: "#000",
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    color: "#8E8E93",
    textAlign: "center",
  },
});
