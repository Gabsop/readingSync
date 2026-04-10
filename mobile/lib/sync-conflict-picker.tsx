/**
 * SyncConflictPicker — modal shown when local and remote reading positions
 * diverge significantly (>5%). Lets the user choose which position to continue from.
 *
 * Matches the PRD spec: shows source, progress percentage, and excerpt preview
 * for each option. Uses a semi-transparent overlay with a centered card.
 */

import React from "react";
import { View, Text, Pressable, StyleSheet, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface ConflictOption {
  label: string;
  source: string;
  progress: number;
  excerpt?: string;
  icon: keyof typeof Ionicons.glyphMap;
}

interface SyncConflictPickerProps {
  visible: boolean;
  bookTitle: string;
  local: ConflictOption;
  remote: ConflictOption;
  onPickLocal: () => void;
  onPickRemote: () => void;
}

function formatProgress(progress: number) {
  return `${Math.round(progress * 100)}%`;
}

function truncateExcerpt(excerpt: string, maxLength = 80) {
  if (excerpt.length <= maxLength) return excerpt;
  return excerpt.slice(0, maxLength).trimEnd() + "\u2026";
}

function sourceLabel(source: string) {
  switch (source) {
    case "mobile":
      return "Mobile";
    case "kindle":
      return "Kindle";
    default:
      return source.charAt(0).toUpperCase() + source.slice(1);
  }
}

export function SyncConflictPicker({
  visible,
  bookTitle,
  local,
  remote,
  onPickLocal,
  onPickRemote,
}: SyncConflictPickerProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.heading}>Continue reading</Text>
          <Text style={styles.bookTitle} numberOfLines={2}>
            {bookTitle}
          </Text>

          {/* Local option */}
          <Pressable
            style={({ pressed }) => [
              styles.option,
              pressed && styles.optionPressed,
            ]}
            onPress={onPickLocal}
          >
            <View style={styles.optionHeader}>
              <Ionicons
                name={local.icon}
                size={20}
                color="#007AFF"
                style={styles.optionIcon}
              />
              <Text style={styles.optionSource}>
                {sourceLabel(local.source)}
              </Text>
              <Text style={styles.optionProgress}>
                {formatProgress(local.progress)}
              </Text>
            </View>
            {local.excerpt ? (
              <Text style={styles.optionExcerpt} numberOfLines={2}>
                &ldquo;{truncateExcerpt(local.excerpt)}&rdquo;
              </Text>
            ) : null}
          </Pressable>

          {/* Remote option */}
          <Pressable
            style={({ pressed }) => [
              styles.option,
              pressed && styles.optionPressed,
            ]}
            onPress={onPickRemote}
          >
            <View style={styles.optionHeader}>
              <Ionicons
                name={remote.icon}
                size={20}
                color="#007AFF"
                style={styles.optionIcon}
              />
              <Text style={styles.optionSource}>
                {sourceLabel(remote.source)}
              </Text>
              <Text style={styles.optionProgress}>
                {formatProgress(remote.progress)}
              </Text>
            </View>
            {remote.excerpt ? (
              <Text style={styles.optionExcerpt} numberOfLines={2}>
                &ldquo;{truncateExcerpt(remote.excerpt)}&rdquo;
              </Text>
            ) : null}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 340,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  heading: {
    fontSize: 13,
    fontWeight: "600",
    color: "#8E8E93",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  bookTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1C1C1E",
    marginBottom: 20,
  },
  option: {
    backgroundColor: "#F2F2F7",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "transparent",
  },
  optionPressed: {
    backgroundColor: "#E5E5EA",
    borderColor: "#007AFF",
  },
  optionHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  optionIcon: {
    marginRight: 8,
  },
  optionSource: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1C1C1E",
    flex: 1,
  },
  optionProgress: {
    fontSize: 16,
    fontWeight: "600",
    color: "#007AFF",
  },
  optionExcerpt: {
    fontSize: 13,
    color: "#6B6B6B",
    marginTop: 8,
    lineHeight: 18,
    fontStyle: "italic",
  },
});
