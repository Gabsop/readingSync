/**
 * Search Modal — full-screen overlay for searching within an EPUB book.
 *
 * Provides a text input with debounced search, displays results with context
 * snippets (matched text highlighted), and allows jumping to a result location.
 * Matches the TocModal styling pattern with full theme awareness.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  Keyboard,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { ParsedEpub, BookSearchResult, TocEntry } from "./epub-parser";
import { searchBook } from "./epub-parser";
import type { ReaderTheme } from "./reader-settings";

const SEARCH_DEBOUNCE_MS = 400;

interface SearchModalProps {
  visible: boolean;
  epub: ParsedEpub | null;
  theme: ReaderTheme;
  onSelectResult: (chapter: number, chapterProgress: number) => void;
  onClose: () => void;
}

function isDark(theme: ReaderTheme) {
  const hex = theme.backgroundColor.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}

/** Find the TOC entry label for a given spine index. */
function chapterLabel(toc: TocEntry[], spine: ParsedEpub["spine"], spineIndex: number): string | undefined {
  const targetHref = spine[spineIndex]?.href;
  if (!targetHref) return undefined;
  const targetBase = targetHref.split("#")[0];

  function findInEntries(entries: TocEntry[]): string | undefined {
    for (const entry of entries) {
      const entryBase = entry.href.split("#")[0] ?? "";
      if (entryBase === targetBase || entryBase.endsWith("/" + targetBase)) {
        return entry.label;
      }
      const found = findInEntries(entry.children);
      if (found) return found;
    }
    return undefined;
  }

  return findInEntries(toc);
}

export function SearchModal({
  visible,
  epub,
  theme,
  onSelectResult,
  onClose,
}: SearchModalProps) {
  const dark = isDark(theme);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BookSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput>(null);

  // Focus input when modal appears
  useEffect(() => {
    if (visible) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery("");
      setResults([]);
      setSearched(false);
      setSearching(false);
    }
  }, [visible]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim() || !epub) {
      setResults([]);
      setSearched(false);
      setSearching(false);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const hits = await searchBook(epub, query.trim());
      setResults(hits);
      setSearched(true);
      setSearching(false);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, epub]);

  const handleSelect = useCallback(
    (item: BookSearchResult) => {
      Keyboard.dismiss();
      onSelectResult(item.chapter, item.chapterProgress);
    },
    [onSelectResult],
  );

  const handleClose = useCallback(() => {
    Keyboard.dismiss();
    onClose();
  }, [onClose]);

  const renderItem = useCallback(
    ({ item }: { item: BookSearchResult }) => {
      const label = epub
        ? chapterLabel(epub.toc, epub.spine, item.chapter)
        : undefined;

      return (
        <Pressable
          style={({ pressed }) => [
            styles.row,
            pressed && { opacity: 0.6 },
          ]}
          onPress={() => handleSelect(item)}
        >
          <View style={styles.rowContent}>
            <Text
              style={[styles.chapterHint, { color: theme.secondaryTextColor }]}
              numberOfLines={1}
            >
              {label ?? `Chapter ${item.chapter + 1}`}
            </Text>
            <Text style={[styles.snippet, { color: theme.textColor }]} numberOfLines={2}>
              {item.contextBefore}
              <Text style={{ fontWeight: "700", color: theme.linkColor }}>
                {item.matchedText}
              </Text>
              {item.contextAfter}
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={16}
            color={theme.secondaryTextColor}
            style={styles.chevron}
          />
        </Pressable>
      );
    },
    [epub, theme, handleSelect],
  );

  if (!visible) return null;

  const inputBg = dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)";
  const placeholderColor = dark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.35)";

  return (
    <View style={[styles.overlay, { backgroundColor: theme.backgroundColor }]}>
      <StatusBar barStyle={dark ? "light-content" : "dark-content"} />
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: theme.textColor }]}>
            Search
          </Text>
          <Pressable onPress={handleClose} hitSlop={8} style={styles.closeButton}>
            <Ionicons
              name="close-circle-outline"
              size={26}
              color={theme.secondaryTextColor}
            />
          </Pressable>
        </View>

        {/* Search input */}
        <View style={styles.inputRow}>
          <View style={[styles.inputContainer, { backgroundColor: inputBg }]}>
            <Ionicons name="search" size={16} color={theme.secondaryTextColor} />
            <TextInput
              ref={inputRef}
              style={[styles.input, { color: theme.textColor }]}
              placeholder="Search in book…"
              placeholderTextColor={placeholderColor}
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
              clearButtonMode="while-editing"
            />
          </View>
        </View>

        {/* Separator */}
        <View
          style={[
            styles.separator,
            { backgroundColor: dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)" },
          ]}
        />

        {/* Results / states */}
        {searching ? (
          <View style={styles.centered}>
            <ActivityIndicator color={theme.secondaryTextColor} />
            <Text style={[styles.statusText, { color: theme.secondaryTextColor }]}>
              Searching…
            </Text>
          </View>
        ) : searched && results.length === 0 ? (
          <View style={styles.centered}>
            <Ionicons name="search-outline" size={40} color={theme.secondaryTextColor} />
            <Text style={[styles.statusText, { color: theme.secondaryTextColor }]}>
              No results found
            </Text>
          </View>
        ) : results.length > 0 ? (
          <>
            <Text style={[styles.resultCount, { color: theme.secondaryTextColor }]}>
              {results.length} {results.length === 1 ? "result" : "results"}
            </Text>
            <FlatList
              data={results}
              renderItem={renderItem}
              keyExtractor={(_item, index) => String(index)}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
              initialNumToRender={20}
            />
          </>
        ) : (
          <View style={styles.centered}>
            <Ionicons name="search-outline" size={40} color={theme.secondaryTextColor} />
            <Text style={[styles.statusText, { color: theme.secondaryTextColor }]}>
              Type to search the book
            </Text>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 100,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  closeButton: {
    padding: 4,
  },
  inputRow: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 38,
    gap: 6,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 0,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 20,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
  },
  statusText: {
    fontSize: 15,
    marginTop: 4,
  },
  resultCount: {
    fontSize: 13,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 4,
  },
  listContent: {
    paddingBottom: 40,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    minHeight: 56,
  },
  rowContent: {
    flex: 1,
    gap: 2,
  },
  chapterHint: {
    fontSize: 12,
    fontWeight: "500",
  },
  snippet: {
    fontSize: 14,
    lineHeight: 20,
  },
  chevron: {
    marginLeft: 8,
  },
});
