/**
 * Page Scrubber — horizontal slider for quick navigation through a book.
 *
 * Appears at the bottom of the controls overlay. Dragging shows a floating
 * label with the current page number and chapter name. Releasing navigates
 * to that page.
 */

import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  interpolate,
  clamp,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import type { ReaderTheme } from "./reader-settings";

interface PageScrubberProps {
  globalPage: number;
  globalTotalPages: number;
  theme: ReaderTheme;
  dark: boolean;
  /** Resolve a global page number to a chapter name. */
  getChapterNameForPage: (page: number) => string;
  /** Called when user finishes scrubbing — navigate to this page. */
  onScrubEnd: (page: number) => void;
}

export function PageScrubber({
  globalPage,
  globalTotalPages,
  theme,
  dark,
  getChapterNameForPage,
  onScrubEnd,
}: PageScrubberProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const [scrubLabel, setScrubLabel] = useState("");
  const [isScrubbing, setIsScrubbing] = useState(false);

  const scrubX = useSharedValue(0);
  const labelOpacity = useSharedValue(0);
  const lastHapticPage = useSharedValue(-1);

  const progress = globalTotalPages > 1
    ? (globalPage - 1) / (globalTotalPages - 1)
    : 0;

  const handleTrackLayout = useCallback((e: LayoutChangeEvent) => {
    setTrackWidth(e.nativeEvent.layout.width);
  }, []);

  function updateLabel(page: number) {
    const chapterName = getChapterNameForPage(page);
    setScrubLabel(`${page} of ${globalTotalPages}  ·  ${chapterName}`);
  }

  function startScrub() {
    setIsScrubbing(true);
  }

  function endScrub(normalizedX: number) {
    setIsScrubbing(false);
    if (globalTotalPages <= 1) return;
    const ratio = Math.max(0, Math.min(1, normalizedX / trackWidth));
    const page = Math.round(ratio * (globalTotalPages - 1)) + 1;
    onScrubEnd(page);
  }

  function hapticForPage(page: number) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    lastHapticPage.value = page;
  }

  const panGesture = Gesture.Pan()
    .hitSlop({ top: 20, bottom: 20 })
    .onBegin((e) => {
      scrubX.value = clamp(e.x, 0, trackWidth);
      labelOpacity.value = withTiming(1, { duration: 100 });
      runOnJS(startScrub)();

      const ratio = trackWidth > 0 ? clamp(e.x, 0, trackWidth) / trackWidth : 0;
      const page = Math.round(ratio * (globalTotalPages - 1)) + 1;
      runOnJS(updateLabel)(page);
    })
    .onUpdate((e) => {
      const clamped = clamp(e.x, 0, trackWidth);
      scrubX.value = clamped;

      const ratio = trackWidth > 0 ? clamped / trackWidth : 0;
      const page = Math.round(ratio * (globalTotalPages - 1)) + 1;
      runOnJS(updateLabel)(page);

      if (page !== lastHapticPage.value) {
        runOnJS(hapticForPage)(page);
      }
    })
    .onEnd((e) => {
      labelOpacity.value = withTiming(0, { duration: 200 });
      const clamped = clamp(e.x, 0, trackWidth);
      runOnJS(endScrub)(clamped);
    })
    .onFinalize(() => {
      labelOpacity.value = withTiming(0, { duration: 200 });
    });

  const thumbPosition = isScrubbing
    ? undefined
    : progress * trackWidth;

  const animatedThumbStyle = useAnimatedStyle(() => {
    if (trackWidth <= 0) return { left: 0 };
    return {
      left: isScrubbing ? scrubX.value - 10 : progress * trackWidth - 10,
    };
  });

  const animatedFillStyle = useAnimatedStyle(() => {
    if (trackWidth <= 0) return { width: 0 };
    return {
      width: isScrubbing ? scrubX.value : progress * trackWidth,
    };
  });

  const animatedLabelStyle = useAnimatedStyle(() => {
    if (trackWidth <= 0) return { opacity: 0, left: 0 };
    const xPos = isScrubbing ? scrubX.value : progress * trackWidth;
    return {
      opacity: labelOpacity.value,
      left: clamp(xPos - 100, 0, trackWidth - 200),
    };
  });

  const thumbColor = dark ? "#F2F2F7" : "#1C1C1E";
  const fillColor = dark ? "rgba(242, 242, 247, 0.5)" : "rgba(28, 28, 30, 0.4)";
  const trackColor = dark ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.1)";
  const labelBg = dark ? "rgba(60, 60, 67, 0.85)" : "rgba(40, 40, 40, 0.85)";

  if (globalTotalPages <= 1) return null;

  return (
    <View style={styles.container}>
      {/* Floating label */}
      <Animated.View style={[styles.labelContainer, animatedLabelStyle]}>
        <View style={[styles.label, { backgroundColor: labelBg }]}>
          <Text style={styles.labelText} numberOfLines={1}>
            {scrubLabel}
          </Text>
        </View>
        <View style={[styles.labelArrow, { borderTopColor: labelBg }]} />
      </Animated.View>

      {/* Slider track */}
      <GestureDetector gesture={panGesture}>
        <View style={styles.trackContainer}>
          <View
            style={[styles.track, { backgroundColor: trackColor }]}
            onLayout={handleTrackLayout}
          >
            <Animated.View
              style={[styles.trackFill, { backgroundColor: fillColor }, animatedFillStyle]}
            />
          </View>

          {/* Thumb */}
          <Animated.View
            style={[
              styles.thumb,
              { backgroundColor: thumbColor },
              animatedThumbStyle,
            ]}
          />
        </View>
      </GestureDetector>

      {/* Page indicator text */}
      <View style={styles.pageRow}>
        <Text style={[styles.pageText, { color: theme.secondaryTextColor }]}>
          {globalPage} of {globalTotalPages}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 4,
  },
  labelContainer: {
    position: "absolute",
    bottom: 52,
    width: 200,
    alignItems: "center",
    zIndex: 10,
  },
  label: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  labelText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "500",
    textAlign: "center",
  },
  labelArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 6,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    marginTop: -1,
  },
  trackContainer: {
    height: 40,
    justifyContent: "center",
  },
  track: {
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  trackFill: {
    height: "100%",
    borderRadius: 2,
  },
  thumb: {
    position: "absolute",
    width: 20,
    height: 20,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3,
  },
  pageRow: {
    alignItems: "center",
  },
  pageText: {
    fontSize: 12,
    fontWeight: "400",
  },
});
