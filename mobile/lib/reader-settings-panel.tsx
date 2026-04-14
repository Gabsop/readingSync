/**
 * Reader Settings Panel — native bottom sheet for font, size, theme, and layout.
 *
 * Uses @expo/ui BottomSheet for native iOS sheet presentation.
 * Matches Apple Books "Themes & Settings" panel:
 *   - Top row: 4 icon buttons (font size -, font size +, scroll mode, dark mode)
 *   - Brightness slider (native SwiftUI)
 *   - Theme grid (6 themes with unique fonts)
 *   - Customize section: font family, line spacing, margins, alignment
 */

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Modal,
  StyleSheet,
  useColorScheme,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Host, Slider } from "@expo/ui/swift-ui";
import * as Brightness from "expo-brightness";
import {
  THEMES,
  THEME_KEYS,
  FONT_FAMILIES,
  type ReaderSettings,
  type ThemeKey,
  type LineSpacingKey,
  type MarginKey,
} from "./reader-settings";
import { useThemeStore } from "./theme-store";

// ---------------------------------------------------------------------------
// Font assigned to each theme card preview
// ---------------------------------------------------------------------------

const THEME_FONTS: Record<ThemeKey, string | undefined> = {
  original: undefined,          // System (SF Pro)
  quiet: "Georgia",
  paper: "Palatino",
  bold: undefined,              // System bold
  calm: "New York",
  focus: "Athelas",
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ReaderSettingsPanelProps {
  visible: boolean;
  settings: ReaderSettings;
  canIncrease: boolean;
  canDecrease: boolean;
  onUpdate: (patch: Partial<ReaderSettings>) => void;
  onIncreaseFontSize: () => void;
  onDecreaseFontSize: () => void;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReaderSettingsPanel({
  visible,
  settings,
  canIncrease,
  canDecrease,
  onUpdate,
  onIncreaseFontSize,
  onDecreaseFontSize,
  onClose,
}: ReaderSettingsPanelProps) {
  const [showCustomize, setShowCustomize] = useState(false);
  const [brightness, setBrightness] = useState(0.5);
  const themeStore = useThemeStore();
  const colorScheme = useColorScheme();

  // Load current brightness when panel opens
  useEffect(() => {
    if (visible) {
      Brightness.getBrightnessAsync().then(setBrightness);
    }
  }, [visible]);

  const handleBrightnessChange = (value: number) => {
    setBrightness(value);
    Brightness.setBrightnessAsync(value);
  };

  const toggleDarkMode = () => {
    const next = themeStore.preference === "dark" ? "light" : "dark";
    themeStore.set(next);
  };

  // Panel adapts to system dark mode
  const isDark = colorScheme === "dark";
  const panelBg = isDark ? "#1C1C1E" : "#F2F2F7";
  const panelText = isDark ? "#F2F2F7" : "#1C1C1E";
  const panelSecondary = "#8E8E93";
  const panelDivider = isDark ? "#3A3A3C" : "#D1D1D6";
  const controlBg = isDark ? "#3A3A3C" : "#FFFFFF";

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.sheetContent, { backgroundColor: panelBg }]}>
        {/* Header */}
        <View style={styles.sheetHeader}>
          <Text style={[styles.sheetTitle, { color: panelText }]}>
            Themes & Settings
          </Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <View
              style={[styles.closeCircle, { backgroundColor: controlBg }]}
            >
              <Text style={[styles.closeX, { color: panelSecondary }]}>
                ✕
              </Text>
            </View>
          </Pressable>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          bounces={false}
          contentContainerStyle={styles.sheetBody}
        >
              {/* Top icon bar — 4 buttons */}
              <View style={[styles.iconBar, { backgroundColor: controlBg }]}>
                <Pressable
                  onPress={onDecreaseFontSize}
                  disabled={!canDecrease}
                  style={[
                    styles.iconBarBtn,
                    !canDecrease && styles.disabledBtn,
                  ]}
                >
                  <Text
                    style={[
                      styles.fontSizeLabelSmall,
                      {
                        color: canDecrease ? panelText : panelSecondary,
                      },
                    ]}
                  >
                    A
                  </Text>
                </Pressable>

                <View
                  style={[
                    styles.iconBarDivider,
                    { backgroundColor: panelDivider },
                  ]}
                />

                <Pressable
                  onPress={onIncreaseFontSize}
                  disabled={!canIncrease}
                  style={[
                    styles.iconBarBtn,
                    !canIncrease && styles.disabledBtn,
                  ]}
                >
                  <Text
                    style={[
                      styles.fontSizeLabelLarge,
                      {
                        color: canIncrease ? panelText : panelSecondary,
                      },
                    ]}
                  >
                    A
                  </Text>
                </Pressable>

                <View
                  style={[
                    styles.iconBarDivider,
                    { backgroundColor: panelDivider },
                  ]}
                />

                <Pressable style={styles.iconBarBtn}>
                  <Ionicons name="text-outline" size={20} color={panelText} />
                </Pressable>

                <View
                  style={[
                    styles.iconBarDivider,
                    { backgroundColor: panelDivider },
                  ]}
                />

                <Pressable style={styles.iconBarBtn} onPress={toggleDarkMode}>
                  <Ionicons
                    name={
                      themeStore.preference === "dark" ? "moon" : "moon-outline"
                    }
                    size={20}
                    color={panelText}
                  />
                </Pressable>
              </View>

              {/* Brightness slider */}
              <Host matchContents style={styles.brightnessSliderHost}>
                <Slider
                  value={brightness}
                  min={0}
                  max={1}
                  step={0.01}
                  onValueChange={handleBrightnessChange}
                  minimumValueLabel={
                    <Ionicons
                      name="sunny-outline"
                      size={14}
                      color={panelSecondary}
                    />
                  }
                  maximumValueLabel={
                    <Ionicons
                      name="sunny"
                      size={18}
                      color={panelSecondary}
                    />
                  }
                />
              </Host>

              {/* Theme grid */}
              <View style={styles.themeGrid}>
                {THEME_KEYS.map((key) => {
                  const theme = THEMES[key];
                  const selected = settings.theme === key;
                  const isThemeDark = key === "bold" || key === "focus";
                  const font = THEME_FONTS[key];
                  return (
                    <Pressable
                      key={key}
                      style={styles.themeCardWrapper}
                      onPress={() => onUpdate({ theme: key })}
                    >
                      <View
                        style={[
                          styles.themeCard,
                          { backgroundColor: theme.backgroundColor },
                          selected && styles.themeCardSelected,
                          !selected &&
                            !isThemeDark && {
                              borderColor: "rgba(0,0,0,0.1)",
                              borderWidth: 1,
                            },
                          !selected &&
                            isThemeDark && {
                              borderColor: "rgba(255,255,255,0.12)",
                              borderWidth: 1,
                            },
                        ]}
                      >
                        <Text
                          style={[
                            styles.themeCardAa,
                            {
                              color: theme.textColor,
                              fontFamily: font,
                              fontWeight: key === "bold" ? "800" : "500",
                            },
                          ]}
                        >
                          Aa
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.themeCardName,
                          {
                            color: selected ? panelText : panelSecondary,
                            fontWeight: selected ? "600" : "400",
                          },
                        ]}
                      >
                        {theme.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Customize toggle */}
              <Pressable
                style={[styles.customizeBtn, { backgroundColor: controlBg }]}
                onPress={() => setShowCustomize((v) => !v)}
              >
                <Ionicons
                  name="settings-outline"
                  size={16}
                  color="#007AFF"
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.customizeBtnText}>
                  {showCustomize ? "Hide Options" : "Customize"}
                </Text>
              </Pressable>

              {/* Extended settings */}
              {showCustomize && (
                <View style={styles.customizeSection}>
                  {/* Font family */}
                  <Text
                    style={[styles.sectionLabel, { color: panelSecondary }]}
                  >
                    Font
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.fontFamilyRow}
                  >
                    {FONT_FAMILIES.map((family) => {
                      const selected = settings.fontFamily === family;
                      return (
                        <Pressable
                          key={family}
                          style={[
                            styles.fontFamilyChip,
                            { backgroundColor: controlBg },
                            selected && styles.fontFamilyChipSelected,
                          ]}
                          onPress={() => onUpdate({ fontFamily: family })}
                        >
                          <Text
                            style={[
                              styles.fontFamilyChipText,
                              {
                                color: selected ? "#007AFF" : panelText,
                                fontFamily:
                                  family === "System" ? undefined : family,
                              },
                            ]}
                          >
                            {family}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>

                  {/* Line spacing */}
                  <Text
                    style={[styles.sectionLabel, { color: panelSecondary }]}
                  >
                    Line Spacing
                  </Text>
                  <SegmentedControl<LineSpacingKey>
                    options={["compact", "normal", "loose"]}
                    labels={["Compact", "Normal", "Loose"]}
                    value={settings.lineSpacing}
                    onChange={(v) => onUpdate({ lineSpacing: v })}
                    controlBg={controlBg}
                    textColor={panelText}
                  />

                  {/* Margins */}
                  <Text
                    style={[styles.sectionLabel, { color: panelSecondary }]}
                  >
                    Margins
                  </Text>
                  <SegmentedControl<MarginKey>
                    options={["narrow", "normal", "wide"]}
                    labels={["Narrow", "Normal", "Wide"]}
                    value={settings.margins}
                    onChange={(v) => onUpdate({ margins: v })}
                    controlBg={controlBg}
                    textColor={panelText}
                  />

                  {/* Text alignment */}
                  <Text
                    style={[styles.sectionLabel, { color: panelSecondary }]}
                  >
                    Alignment
                  </Text>
                  <SegmentedControl<"left" | "justify">
                    options={["left", "justify"]}
                    labels={["Left", "Justified"]}
                    value={settings.textAlign}
                    onChange={(v) => onUpdate({ textAlign: v })}
                    controlBg={controlBg}
                    textColor={panelText}
                  />
                </View>
              )}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Segmented control helper
// ---------------------------------------------------------------------------

function SegmentedControl<T extends string>({
  options,
  labels,
  value,
  onChange,
  controlBg,
  textColor,
}: {
  options: T[];
  labels: string[];
  value: T;
  onChange: (v: T) => void;
  controlBg: string;
  textColor: string;
}) {
  return (
    <View style={[styles.segmented, { backgroundColor: controlBg }]}>
      {options.map((opt, i) => {
        const selected = value === opt;
        return (
          <Pressable
            key={opt}
            style={[
              styles.segmentedItem,
              selected && styles.segmentedItemSelected,
            ]}
            onPress={() => onChange(opt)}
          >
            <Text
              style={[
                styles.segmentedLabel,
                { color: selected ? "#007AFF" : textColor },
                selected && styles.segmentedLabelSelected,
              ]}
            >
              {labels[i]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  sheetContent: {
    flex: 1,
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: "600",
  },
  closeCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  closeX: {
    fontSize: 13,
    fontWeight: "600",
  },
  sheetBody: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },

  // Top icon bar (4 buttons)
  iconBar: {
    flexDirection: "row",
    borderRadius: 10,
    overflow: "hidden",
    height: 44,
  },
  iconBarBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBarDivider: {
    width: StyleSheet.hairlineWidth,
    height: 28,
    alignSelf: "center",
  },
  disabledBtn: {
    opacity: 0.35,
  },
  fontSizeLabelSmall: {
    fontSize: 14,
    fontWeight: "500",
  },
  fontSizeLabelLarge: {
    fontSize: 22,
    fontWeight: "500",
  },

  // Brightness
  brightnessSliderHost: {
    width: "100%",
    marginTop: 14,
    marginBottom: 18,
    height: 44,
  },

  // Theme grid
  themeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 16,
    justifyContent: "space-between",
  },
  themeCardWrapper: {
    width: "30%",
    flexGrow: 1,
    flexBasis: "30%",
    alignItems: "center",
  },
  themeCard: {
    width: "100%",
    aspectRatio: 1.35,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  themeCardSelected: {
    borderWidth: 2.5,
    borderColor: "#007AFF",
  },
  themeCardAa: {
    fontSize: 24,
    letterSpacing: 0.5,
  },
  themeCardName: {
    fontSize: 12,
    marginTop: 6,
    marginBottom: 2,
  },

  // Customize
  customizeBtn: {
    borderRadius: 10,
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  customizeBtnText: {
    fontSize: 15,
    fontWeight: "500",
    color: "#007AFF",
  },
  customizeSection: {
    gap: 4,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 6,
    marginLeft: 4,
  },
  fontFamilyRow: {
    gap: 8,
    paddingBottom: 4,
  },
  fontFamilyChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  fontFamilyChipSelected: {
    borderColor: "#007AFF",
  },
  fontFamilyChipText: {
    fontSize: 14,
  },

  // Segmented control
  segmented: {
    flexDirection: "row",
    borderRadius: 10,
    overflow: "hidden",
    height: 36,
    marginBottom: 4,
  },
  segmentedItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentedItemSelected: {
    backgroundColor: "rgba(0,122,255,0.12)",
  },
  segmentedLabel: {
    fontSize: 13,
    fontWeight: "500",
  },
  segmentedLabelSelected: {
    fontWeight: "600",
  },
});
