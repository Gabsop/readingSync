import { StyleSheet, useColorScheme } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  useSharedValue,
  Extrapolation,
} from "react-native-reanimated";
import { useColors } from "./colors";

const LARGE_TITLE_SIZE = 34;
const SMALL_TITLE_SIZE = 17;
const SCROLL_THRESHOLD = 40;

/** Padding to apply to scrollable content so it clears the large-title header. */
export const HEADER_CONTENT_INSET = LARGE_TITLE_SIZE + 16;

export function useHeaderScroll() {
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });
  return { scrollY, scrollHandler };
}

export function TabHeader({
  title,
  right,
  scrollY,
}: {
  title: string;
  right?: React.ReactNode;
  scrollY?: { value: number };
}) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const colorScheme = useColorScheme();
  const bgColor = colorScheme === "dark" ? "#000000" : "#F2F2F7";

  const titleStyle = useAnimatedStyle(() => {
    if (!scrollY) return { fontSize: LARGE_TITLE_SIZE, textAlign: "left" as const };
    const fontSize = interpolate(
      scrollY.value,
      [0, SCROLL_THRESHOLD],
      [LARGE_TITLE_SIZE, SMALL_TITLE_SIZE],
      Extrapolation.CLAMP,
    );
    return { fontSize };
  });

  const titleContainerStyle = useAnimatedStyle(() => {
    if (!scrollY) return {};
    const alignSelf = scrollY.value >= SCROLL_THRESHOLD ? "center" as const : "flex-start" as const;
    const flex = scrollY.value >= SCROLL_THRESHOLD ? 0 : 1;
    return { alignSelf, flex };
  });

  const bgOpacity = useAnimatedStyle(() => {
    if (!scrollY) return { opacity: 0 };
    const opacity = interpolate(
      scrollY.value,
      [0, SCROLL_THRESHOLD],
      [0, 1],
      Extrapolation.CLAMP,
    );
    return { opacity };
  });

  const headerPadding = useAnimatedStyle(() => {
    if (!scrollY) return { paddingBottom: 4 };
    const pb = interpolate(
      scrollY.value,
      [0, SCROLL_THRESHOLD],
      [4, 8],
      Extrapolation.CLAMP,
    );
    return { paddingBottom: pb };
  });

  // When collapsed, title is centered so we need absolute positioned right buttons
  const rightStyle = useAnimatedStyle(() => {
    if (!scrollY) return {};
    const pos = scrollY.value >= SCROLL_THRESHOLD ? "absolute" as const : "relative" as const;
    return { position: pos, right: 16 };
  });

  return (
    <Animated.View
      style={[
        styles.headerContainer,
        { paddingTop: insets.top },
        headerPadding,
      ]}
    >
      {/* Gradient background — fades in on scroll */}
      <Animated.View style={[StyleSheet.absoluteFill, bgOpacity]} pointerEvents="none">
        <LinearGradient
          colors={[bgColor, bgColor, "transparent"]}
          locations={[0, 0.7, 1]}
          style={{ ...StyleSheet.absoluteFillObject }}
        />
      </Animated.View>

      <Animated.View style={styles.headerContent}>
        <Animated.View style={titleContainerStyle}>
          <Animated.Text
            style={[styles.title, { color: colors.text, fontWeight: "700" }, titleStyle]}
            numberOfLines={1}
          >
            {title}
          </Animated.Text>
        </Animated.View>
        {right ? (
          <Animated.View style={rightStyle}>
            {right}
          </Animated.View>
        ) : null}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  title: {
    marginRight: 8,
  },
});
