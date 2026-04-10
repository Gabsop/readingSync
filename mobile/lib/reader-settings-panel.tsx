/**
 * Reader Settings Panel — half-sheet modal for font, size, theme, and layout.
 *
 * Matches the Apple Books "Themes & Settings" panel:
 *   - Top row: font size decrease / increase, brightness (future)
 *   - Theme grid (6 themes)
 *   - Customize section: font family, line spacing, margins, alignment
 */

import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Modal,
  StyleSheet,
} from "react-native";
import {
  THEMES,
  THEME_KEYS,
  FONT_FAMILIES,
  getTheme,
  type ReaderSettings,
  type ThemeKey,
  type FontFamily,
  type LineSpacingKey,
  type MarginKey,
} from "./reader-settings";

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
  const activeTheme = getTheme(settings.theme);

  // Use a dark panel style for dark themes
  const isDark = settings.theme === "bold" || settings.theme === "focus";
  const panelBg = isDark ? "#2C2C2E" : "#F2F2F7";
  const panelText = isDark ? "#F2F2F7" : "#1C1C1E";
  const panelSecondary = "#8E8E93";
  const panelDivider = isDark ? "#3A3A3C" : "#D1D1D6";
  const controlBg = isDark ? "#3A3A3C" : "#FFFFFF";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: panelBg }]}
          onPress={() => {}}
        >
          {/* Header */}
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: panelText }]}>
              Themes & Settings
            </Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <View style={[styles.closeCircle, { backgroundColor: controlBg }]}>
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
            {/* Font size controls */}
            <View style={[styles.fontSizeRow, { backgroundColor: controlBg }]}>
              <Pressable
                onPress={onDecreaseFontSize}
                disabled={!canDecrease}
                style={[styles.fontSizeBtn, !canDecrease && styles.disabledBtn]}
              >
                <Text
                  style={[
                    styles.fontSizeLabel,
                    { fontSize: 14, color: canDecrease ? panelText : panelSecondary },
                  ]}
                >
                  A
                </Text>
              </Pressable>

              <View style={[styles.fontSizeDivider, { backgroundColor: panelDivider }]} />

              <Pressable
                onPress={onIncreaseFontSize}
                disabled={!canIncrease}
                style={[styles.fontSizeBtn, !canIncrease && styles.disabledBtn]}
              >
                <Text
                  style={[
                    styles.fontSizeLabel,
                    { fontSize: 22, color: canIncrease ? panelText : panelSecondary },
                  ]}
                >
                  A
                </Text>
              </Pressable>
            </View>

            {/* Font size indicator */}
            <Text style={[styles.fontSizeIndicator, { color: panelSecondary }]}>
              {settings.fontSize}pt
            </Text>

            {/* Theme grid */}
            <View style={styles.themeGrid}>
              {THEME_KEYS.map((key) => {
                const theme = THEMES[key];
                const selected = settings.theme === key;
                return (
                  <Pressable
                    key={key}
                    style={[
                      styles.themeCard,
                      { backgroundColor: theme.backgroundColor },
                      selected && styles.themeCardSelected,
                    ]}
                    onPress={() => onUpdate({ theme: key })}
                  >
                    <Text
                      style={[
                        styles.themeCardLabel,
                        { color: theme.textColor },
                      ]}
                    >
                      Aa
                    </Text>
                    <Text
                      style={[
                        styles.themeCardName,
                        {
                          color: selected ? "#007AFF" : panelSecondary,
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
              <Text style={[styles.customizeBtnText, { color: "#007AFF" }]}>
                {showCustomize ? "Hide Options" : "Customize"}
              </Text>
            </Pressable>

            {/* Extended settings */}
            {showCustomize && (
              <View style={styles.customizeSection}>
                {/* Font family */}
                <Text style={[styles.sectionLabel, { color: panelSecondary }]}>
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
                              fontFamily: family === "System" ? undefined : family,
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
                <Text style={[styles.sectionLabel, { color: panelSecondary }]}>
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
                <Text style={[styles.sectionLabel, { color: panelSecondary }]}>
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
                <Text style={[styles.sectionLabel, { color: panelSecondary }]}>
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
        </Pressable>
      </Pressable>
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
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "70%",
    paddingBottom: 34, // safe area bottom approximation
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

  // Font size controls
  fontSizeRow: {
    flexDirection: "row",
    borderRadius: 10,
    overflow: "hidden",
    height: 44,
  },
  fontSizeBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  disabledBtn: {
    opacity: 0.35,
  },
  fontSizeLabel: {
    fontWeight: "500",
  },
  fontSizeDivider: {
    width: StyleSheet.hairlineWidth,
    height: 28,
    alignSelf: "center",
  },
  fontSizeIndicator: {
    textAlign: "center",
    fontSize: 12,
    marginTop: 6,
    marginBottom: 16,
  },

  // Theme grid
  themeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },
  themeCard: {
    width: "30%",
    flexGrow: 1,
    flexBasis: "30%",
    aspectRatio: 1.2,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  themeCardSelected: {
    borderColor: "#007AFF",
  },
  themeCardLabel: {
    fontSize: 22,
    fontWeight: "500",
    marginBottom: 4,
  },
  themeCardName: {
    fontSize: 11,
    fontWeight: "500",
  },

  // Customize
  customizeBtn: {
    borderRadius: 10,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  customizeBtnText: {
    fontSize: 15,
    fontWeight: "500",
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
