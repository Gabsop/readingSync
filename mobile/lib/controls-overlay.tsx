/**
 * Controls Overlay — bottom sheet that slides up from the footer.
 * Matches Apple Books reader controls layout.
 */

import React from "react";
import { View, Text, Pressable, StyleSheet, useColorScheme } from "react-native";
import Animated, {
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ReaderTheme } from "./reader-settings";
import { PageScrubber } from "./page-scrubber";

const FADE_DURATION = 200;

interface ControlsOverlayProps {
  visible: boolean;
  theme: ReaderTheme;
  pagesLeftInChapter: number;
  progressPercent: number;
  globalPage: number;
  globalTotalPages: number;
  getChapterNameForPage: (page: number) => string;
  onScrubEnd: (page: number) => void;
  onOpenSettings: () => void;
  onOpenContents: () => void;
  onOpenSearch: () => void;
  onBookmark: () => void;
  onShare: () => void;
}

function isDark(theme: ReaderTheme) {
  const hex = theme.backgroundColor.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}

export function ControlsOverlay({
  visible,
  theme,
  pagesLeftInChapter,
  progressPercent,
  globalPage,
  globalTotalPages,
  getChapterNameForPage,
  onScrubEnd,
  onOpenSettings,
  onOpenContents,
  onOpenSearch,
  onBookmark,
  onShare,
}: ControlsOverlayProps) {
  const dark = isDark(theme);
  const insets = useSafeAreaInsets();
  const iconColor = dark ? "#F2F2F7" : "#1C1C1E";
  const textColor = dark ? "#F2F2F7" : "#1C1C1E";
  const secondaryColor = dark ? "#8E8E93" : "#6D6D72";
  const toolbarBg = dark
    ? "rgba(44, 44, 46, 0.92)"
    : "rgba(255, 255, 255, 0.92)";
  const separatorColor = dark
    ? "rgba(255, 255, 255, 0.12)"
    : "rgba(0, 0, 0, 0.08)";
  const actionBg = dark
    ? "rgba(44, 44, 46, 0.92)"
    : "rgba(255, 255, 255, 0.92)";

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: withTiming(visible ? 1 : 0, {
      duration: FADE_DURATION,
      easing: Easing.inOut(Easing.ease),
    }),
    transform: [
      {
        translateY: withTiming(visible ? 0 : 20, {
          duration: FADE_DURATION,
          easing: Easing.out(Easing.ease),
        }),
      },
    ],
  }));

  return (
    <Animated.View
      style={[styles.container, { bottom: insets.bottom + 4 }, animatedStyle]}
      pointerEvents={visible ? "auto" : "none"}
    >
      {/* Pages left indicator */}
      <Text style={[styles.pagesLeft, { color: secondaryColor }]}>
        {pagesLeftInChapter === 1
          ? "1 page left in chapter"
          : `${pagesLeftInChapter} pages left in chapter`}
      </Text>

      {/* Main toolbar */}
      <View style={[styles.toolbar, { backgroundColor: toolbarBg }]}>
        {/* Contents */}
        <Pressable style={styles.toolbarRow} onPress={onOpenContents}>
          <Text style={[styles.toolbarText, { color: textColor }]}>
            Contents <Text style={{ color: secondaryColor }}>· {progressPercent}%</Text>
          </Text>
          <Ionicons name="list" size={18} color={iconColor} />
        </Pressable>

        <View style={[styles.separator, { backgroundColor: separatorColor }]} />

        {/* Search */}
        <Pressable style={styles.toolbarRow} onPress={onOpenSearch}>
          <Text style={[styles.toolbarText, { color: textColor }]}>Search Book</Text>
          <Ionicons name="search" size={16} color={iconColor} />
        </Pressable>

        <View style={[styles.separator, { backgroundColor: separatorColor }]} />

        {/* Themes & Settings */}
        <Pressable style={styles.toolbarRow} onPress={onOpenSettings}>
          <Text style={[styles.toolbarText, { color: textColor }]}>Themes & Settings</Text>
          <Text style={[styles.aaIcon, { color: iconColor }]}>Aa</Text>
        </Pressable>
      </View>

      {/* Action buttons row */}
      <View style={[styles.actionRow, { backgroundColor: actionBg }]}>
        <Pressable style={styles.actionButton} onPress={onShare}>
          <Ionicons name="share-outline" size={22} color={iconColor} />
        </Pressable>
        <Pressable style={styles.actionButton}>
          <Ionicons name="phone-portrait-outline" size={22} color={iconColor} />
        </Pressable>
        <Pressable style={styles.actionButton}>
          <Ionicons name="lock-closed-outline" size={22} color={iconColor} />
        </Pressable>
        <Pressable style={styles.actionButton} onPress={onBookmark}>
          <Ionicons name="bookmark-outline" size={22} color={iconColor} />
        </Pressable>
      </View>

      {/* Page scrubber */}
      <PageScrubber
        globalPage={globalPage}
        globalTotalPages={globalTotalPages}
        theme={theme}
        dark={dark}
        getChapterNameForPage={getChapterNameForPage}
        onScrubEnd={onScrubEnd}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 12,
    right: 12,
    gap: 8,
  },
  pagesLeft: {
    fontSize: 13,
    textAlign: "center",
    marginBottom: 2,
  },
  toolbar: {
    borderRadius: 14,
    overflow: "hidden",
  },
  toolbarRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  toolbarText: {
    fontSize: 16,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 16,
  },
  aaIcon: {
    fontSize: 18,
    fontWeight: "600",
  },
  actionRow: {
    borderRadius: 14,
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 10,
  },
  actionButton: {
    padding: 8,
  },
});
