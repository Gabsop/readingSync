/**
 * Settings screen — accessible from the gear icon on the Library header.
 *
 * Sections:
 *   - Storage: total space used, clear cache button
 *   - About: app version
 */

import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSQLiteContext } from "expo-sqlite";
import { Ionicons } from "@expo/vector-icons";
import {
  getStorageInfo,
  clearDownloadCache,
  formatBytes,
  type StorageInfo,
} from "../lib/storage-manager";

export default function SettingsScreen() {
  const router = useRouter();
  const db = useSQLiteContext();

  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [loadingStorage, setLoadingStorage] = useState(true);
  const [clearing, setClearing] = useState(false);

  const loadStorage = useCallback(async () => {
    setLoadingStorage(true);
    try {
      const info = await getStorageInfo(db);
      setStorageInfo(info);
    } catch {
      // Non-critical — show zeros
      setStorageInfo({ epubBytes: 0, coverBytes: 0, totalBytes: 0, bookCount: 0 });
    } finally {
      setLoadingStorage(false);
    }
  }, [db]);

  useEffect(() => {
    loadStorage();
  }, [loadStorage]);

  function handleClearCache() {
    if (!storageInfo || storageInfo.totalBytes === 0) return;

    Alert.alert(
      "Clear Download Cache",
      `This will remove ${formatBytes(storageInfo.totalBytes)} of downloaded EPUBs and cover images from this device. Books will re-download from the cloud when you open them.\n\nYour reading progress will not be affected.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear Cache",
          style: "destructive",
          onPress: async () => {
            setClearing(true);
            try {
              await clearDownloadCache(db);
              await loadStorage();
            } catch {
              Alert.alert("Error", "Failed to clear cache. Please try again.");
            } finally {
              setClearing(false);
            }
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={28} color="#007AFF" />
        </Pressable>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Storage Section */}
        <Text style={styles.sectionHeader}>STORAGE</Text>
        <View style={styles.section}>
          {/* Total space used */}
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Ionicons name="folder-outline" size={22} color="#8E8E93" style={styles.rowIcon} />
              <Text style={styles.rowLabel}>Downloaded Books</Text>
            </View>
            {loadingStorage ? (
              <ActivityIndicator size="small" color="#8E8E93" />
            ) : (
              <Text style={styles.rowValue}>
                {formatBytes(storageInfo?.totalBytes ?? 0)}
              </Text>
            )}
          </View>

          <View style={styles.separator} />

          {/* Breakdown */}
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Ionicons name="document-outline" size={22} color="#8E8E93" style={styles.rowIcon} />
              <Text style={styles.rowLabel}>EPUB Files</Text>
            </View>
            {loadingStorage ? (
              <ActivityIndicator size="small" color="#8E8E93" />
            ) : (
              <Text style={styles.rowValueSecondary}>
                {storageInfo?.bookCount ?? 0} books · {formatBytes(storageInfo?.epubBytes ?? 0)}
              </Text>
            )}
          </View>

          <View style={styles.separator} />

          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Ionicons name="image-outline" size={22} color="#8E8E93" style={styles.rowIcon} />
              <Text style={styles.rowLabel}>Cover Images</Text>
            </View>
            {loadingStorage ? (
              <ActivityIndicator size="small" color="#8E8E93" />
            ) : (
              <Text style={styles.rowValueSecondary}>
                {formatBytes(storageInfo?.coverBytes ?? 0)}
              </Text>
            )}
          </View>

          <View style={styles.separator} />

          {/* Clear cache button */}
          <Pressable
            style={({ pressed }) => [
              styles.clearButton,
              pressed && styles.clearButtonPressed,
              (clearing || (storageInfo?.totalBytes ?? 0) === 0) && styles.clearButtonDisabled,
            ]}
            onPress={handleClearCache}
            disabled={clearing || (storageInfo?.totalBytes ?? 0) === 0}
          >
            {clearing ? (
              <ActivityIndicator size="small" color="#FF3B30" />
            ) : (
              <>
                <Ionicons name="trash-outline" size={20} color="#FF3B30" style={styles.clearIcon} />
                <Text style={styles.clearButtonText}>Clear Download Cache</Text>
              </>
            )}
          </Pressable>
        </View>

        <Text style={styles.sectionFooter}>
          Clearing the cache removes downloaded EPUBs and covers from this device. Books will re-download from the cloud when opened. Reading progress is preserved.
        </Text>

        {/* About Section */}
        <Text style={styles.sectionHeader}>ABOUT</Text>
        <View style={styles.section}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Version</Text>
            <Text style={styles.rowValueSecondary}>1.0.0</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F2F2F7",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#1C1C1E",
  },
  headerSpacer: {
    width: 28,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: "400",
    color: "#6D6D72",
    marginTop: 24,
    marginBottom: 8,
    marginLeft: 32,
    letterSpacing: 0.2,
  },
  section: {
    backgroundColor: "#FFFFFF",
    marginHorizontal: 16,
    borderRadius: 10,
    overflow: "hidden",
  },
  sectionFooter: {
    fontSize: 13,
    color: "#6D6D72",
    marginTop: 8,
    marginHorizontal: 32,
    lineHeight: 18,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 44,
  },
  rowLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  rowIcon: {
    marginRight: 12,
  },
  rowLabel: {
    fontSize: 16,
    color: "#1C1C1E",
  },
  rowValue: {
    fontSize: 16,
    fontWeight: "500",
    color: "#1C1C1E",
  },
  rowValueSecondary: {
    fontSize: 15,
    color: "#8E8E93",
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#C6C6C8",
    marginLeft: 50,
  },
  clearButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 44,
  },
  clearButtonPressed: {
    backgroundColor: "#F2F2F7",
  },
  clearButtonDisabled: {
    opacity: 0.4,
  },
  clearIcon: {
    marginRight: 8,
  },
  clearButtonText: {
    fontSize: 16,
    color: "#FF3B30",
    fontWeight: "500",
  },
});
