import { useColorScheme } from "react-native";

// iOS system colors for light and dark modes
const palette = {
  light: {
    background: "#FFFFFF",
    groupedBackground: "#F2F2F7",
    secondaryGroupedBackground: "#FFFFFF",
    text: "#000000",
    secondaryText: "#8E8E93",
    tertiaryText: "#C7C7CC",
    separator: "#C6C6C8",
    tint: "#007AFF",
    destructive: "#FF3B30",
    success: "#34C759",
  },
  dark: {
    background: "#000000",
    groupedBackground: "#000000",
    secondaryGroupedBackground: "#1C1C1E",
    text: "#FFFFFF",
    secondaryText: "#8E8E93",
    tertiaryText: "#48484A",
    separator: "#38383A",
    tint: "#0A84FF",
    destructive: "#FF453A",
    success: "#30D158",
  },
} as const;

export function useColors() {
  const scheme = useColorScheme();
  return palette[scheme === "dark" ? "dark" : "light"];
}
