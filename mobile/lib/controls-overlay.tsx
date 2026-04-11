/**
 * Controls Overlay — top/bottom bars that appear on center tap.
 *
 * Matches the Apple Books reader controls:
 *   - Top: "N pages left in chapter" in small gray text
 *   - Bottom toolbar: frosted glass floating bar with Contents, Search, Themes & Settings
 *   - Bottom action row: Share, screen, orientation, bookmark icons
 *   - Smooth fade in/out with Reanimated
 */

import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
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
  // Check if background is dark by parsing hex
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
  const blurTint = dark ? "dark" : "light";
  const iconColor = dark ? "#F2F2F7" : "#1C1C1E";
  const toolbarBg = dark
    ? "rgba(60, 60, 67, 0.65)"
    : "rgba(255, 255, 255, 0.75)";
  const separatorColor = dark
    ? "rgba(255, 255, 255, 0.15)"
    : "rgba(0, 0, 0, 0.1)";

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: withTiming(visible ? 1 : 0, {
      duration: FADE_DURATION,
      easing: Easing.inOut(Easing.ease),
    }),
  }));

  return (
    <Animated.View
      style={[styles.overlay, animatedStyle]}
      pointerEvents={visible ? "auto" : "none"}
    >
      {/* Top bar — pages left in chapter */}
      <View style={styles.topBar}>
        <Text style={[styles.topText, { color: theme.secondaryTextColor }]}>
          {pagesLeftInChapter === 1
            ? "1 page left in chapter"
            : `${pagesLeftInChapter} pages left in chapter`}
        </Text>
      </View>

      {/* Bottom area */}
      <View style={styles.bottomArea}>
        {/* Main toolbar — frosted glass */}
        <BlurView
          intensity={40}
          tint={blurTint}
          style={[styles.toolbar, { backgroundColor: toolbarBg }]}
        >
          {/* Contents button */}
          <Pressable
            style={styles.toolbarButton}
            onPress={onOpenContents}
          >
            <Text
              style={[styles.toolbarButtonText, { color: iconColor }]}
              numberOfLines={1}
            >
              Contents{" "}
              <Text style={styles.toolbarButtonDot}>&middot;</Text>{" "}
              {progressPercent}%
            </Text>
            <Ionicons
              name="list"
              size={18}
              color={iconColor}
              style={styles.toolbarIcon}
            />
          </Pressable>

          {/* Separator */}
          <View
            style={[styles.toolbarSeparator, { backgroundColor: separatorColor }]}
          />

          {/* Search button */}
          <Pressable
            style={styles.toolbarButton}
            onPress={onOpenSearch}
          >
            <Text style={[styles.toolbarButtonText, { color: iconColor }]}>
              Search Book
            </Text>
            <Ionicons
              name="search"
              size={16}
              color={iconColor}
              style={styles.toolbarIcon}
            />
          </Pressable>

          {/* Separator */}
          <View
            style={[styles.toolbarSeparator, { backgroundColor: separatorColor }]}
          />

          {/* Themes & Settings button */}
          <Pressable
            style={styles.toolbarButton}
            onPress={onOpenSettings}
          >
            <Text style={[styles.toolbarButtonText, { color: iconColor }]}>
              Themes & Settings
            </Text>
            <Text style={[styles.toolbarAaIcon, { color: iconColor }]}>
              Aa
            </Text>
          </Pressable>
        </BlurView>

        {/* Action row — icon buttons */}
        <BlurView
          intensity={40}
          tint={blurTint}
          style={[styles.actionRow, { backgroundColor: toolbarBg }]}
        >
          <Pressable style={styles.actionButton} onPress={onShare}>
            <Ionicons name="share-outline" size={22} color={iconColor} />
          </Pressable>

          <Pressable style={styles.actionButton}>
            <Ionicons name="phone-portrait-outline" size={22} color={iconColor} />
          </Pressable>

          <Pressable style={styles.actionButton}>
            <Ionicons
              name="lock-closed-outline"
              size={22}
              color={iconColor}
            />
          </Pressable>

          <Pressable style={styles.actionButton} onPress={onBookmark}>
            <Ionicons name="bookmark-outline" size={22} color={iconColor} />
          </Pressable>
        </BlurView>

        {/* Page scrubber */}
        <PageScrubber
          globalPage={globalPage}
          globalTotalPages={globalTotalPages}
          theme={theme}
          dark={dark}
          getChapterNameForPage={getChapterNameForPage}
          onScrubEnd={onScrubEnd}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
    pointerEvents: "box-none",
  },
  topBar: {
    paddingTop: 4,
    alignItems: "center",
  },
  topText: {
    fontSize: 13,
    fontWeight: "400",
  },
  bottomArea: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 10,
  },
  toolbar: {
    flexDirection: "column",
    borderRadius: 14,
    overflow: "hidden",
  },
  toolbarButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  toolbarButtonText: {
    fontSize: 15,
    fontWeight: "500",
  },
  toolbarButtonDot: {
    fontSize: 15,
  },
  toolbarIcon: {
    marginLeft: 8,
  },
  toolbarAaIcon: {
    fontSize: 17,
    fontWeight: "600",
    marginLeft: 8,
  },
  toolbarSeparator: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    borderRadius: 14,
    overflow: "hidden",
    paddingVertical: 10,
  },
  actionButton: {
    padding: 8,
  },
});
