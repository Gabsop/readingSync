/**
 * Table of Contents Modal — full-screen overlay listing EPUB chapters.
 *
 * Displays the parsed TOC tree with indent for nested entries.
 * Current chapter is highlighted. Tap to jump, modal dismisses.
 * Matches Apple Books styling with theme awareness.
 */

import React, { useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { TocEntry } from "./epub-parser";
import type { ReaderTheme } from "./reader-settings";

interface TocModalProps {
  visible: boolean;
  toc: TocEntry[];
  currentChapterHref: string | undefined;
  theme: ReaderTheme;
  onSelectEntry: (href: string) => void;
  onClose: () => void;
}

/** Flatten nested TocEntry tree into a list with depth for indentation. */
function flattenToc(entries: TocEntry[], depth = 0): Array<TocEntry & { depth: number }> {
  const result: Array<TocEntry & { depth: number }> = [];
  for (const entry of entries) {
    result.push({ ...entry, depth });
    if (entry.children.length > 0) {
      result.push(...flattenToc(entry.children, depth + 1));
    }
  }
  return result;
}

/** Strip fragment identifier from href for comparison. */
function stripFragment(href: string) {
  return href.split("#")[0];
}

function isDark(theme: ReaderTheme) {
  const hex = theme.backgroundColor.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}

export function TocModal({
  visible,
  toc,
  currentChapterHref,
  theme,
  onSelectEntry,
  onClose,
}: TocModalProps) {
  const dark = isDark(theme);
  const flatItems = React.useMemo(() => flattenToc(toc), [toc]);

  const currentHrefBase = currentChapterHref ? stripFragment(currentChapterHref) : undefined;

  const renderItem = useCallback(
    ({ item }: { item: (typeof flatItems)[number] }) => {
      const isActive = currentHrefBase !== undefined &&
        stripFragment(item.href) === currentHrefBase;

      return (
        <Pressable
          style={({ pressed }) => [
            styles.row,
            { paddingLeft: 20 + item.depth * 20 },
            pressed && { opacity: 0.6 },
          ]}
          onPress={() => onSelectEntry(item.href)}
        >
          <Text
            style={[
              styles.label,
              { color: isActive ? theme.linkColor : theme.textColor },
              isActive && styles.labelActive,
            ]}
            numberOfLines={2}
          >
            {item.label}
          </Text>
          {isActive && (
            <View style={[styles.activeIndicator, { backgroundColor: theme.linkColor }]} />
          )}
        </Pressable>
      );
    },
    [currentHrefBase, theme, onSelectEntry],
  );

  if (!visible) return null;

  return (
    <View style={[styles.overlay, { backgroundColor: theme.backgroundColor }]}>
      <StatusBar barStyle={dark ? "light-content" : "dark-content"} />
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: theme.textColor }]}>
            Contents
          </Text>
          <Pressable onPress={onClose} hitSlop={8} style={styles.closeButton}>
            <Ionicons
              name="close-circle-outline"
              size={26}
              color={theme.secondaryTextColor}
            />
          </Pressable>
        </View>

        {/* Separator */}
        <View
          style={[
            styles.separator,
            { backgroundColor: dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)" },
          ]}
        />

        {/* Chapter list */}
        <FlatList
          data={flatItems}
          renderItem={renderItem}
          keyExtractor={(item, index) => `${item.href}-${index}`}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator
          initialNumToRender={30}
        />
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
  separator: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 20,
  },
  listContent: {
    paddingBottom: 40,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 20,
    paddingVertical: 14,
    minHeight: 48,
  },
  label: {
    fontSize: 16,
    flex: 1,
  },
  labelActive: {
    fontWeight: "600",
  },
  activeIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginLeft: 10,
  },
});
