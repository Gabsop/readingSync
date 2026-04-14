/**
 * Settings screen — accessible as a native tab.
 *
 * Sections:
 *   - Kindle Sync: API key management
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
import { useSQLiteContext } from "expo-sqlite";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated from "react-native-reanimated";
import { useColors } from "../../../lib/colors";
import { useThemeStore } from "../../../lib/theme-store";
import { TabHeader, useHeaderScroll, HEADER_CONTENT_INSET } from "../../../lib/tab-header";
import {
  getStorageInfo,
  clearDownloadCache,
  formatBytes,
  type StorageInfo,
} from "../../../lib/storage-manager";
import { authFetch } from "../../../lib/api";

interface ApiKeyInfo {
  id: number;
  prefix: string;
  name: string;
  lastUsedAt: string | null;
  createdAt: string;
}

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const colors = useColors();
  const { scrollY, scrollHandler } = useHeaderScroll();
  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + HEADER_CONTENT_INSET;
  const themePreference = useThemeStore((s) => s.preference);
  const setTheme = useThemeStore((s) => s.set);

  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [loadingStorage, setLoadingStorage] = useState(true);
  const [clearing, setClearing] = useState(false);

  const [apiKeys, setApiKeys] = useState<ApiKeyInfo[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [generatingKey, setGeneratingKey] = useState(false);

  const loadApiKeys = useCallback(async () => {
    setLoadingKeys(true);
    try {
      const res = await authFetch("/api/auth/api-keys");
      if (res.ok) {
        const keys = (await res.json()) as ApiKeyInfo[];
        setApiKeys(keys);
      }
    } catch {
      // non-critical
    } finally {
      setLoadingKeys(false);
    }
  }, []);

  async function handleGenerateKey() {
    setGeneratingKey(true);
    try {
      const res = await authFetch("/api/auth/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "KOReader" }),
      });
      if (!res.ok) {
        Alert.alert("Error", "Failed to generate API key");
        return;
      }
      const data = (await res.json()) as { key: string };
      await Clipboard.setStringAsync(data.key);
      Alert.alert(
        "API Key Created",
        "Your key has been copied to the clipboard. Paste it in KOReader under:\n\nReading Sync → Set API key\n\nThis key won't be shown again.",
      );
      loadApiKeys();
    } catch {
      Alert.alert("Error", "Something went wrong");
    } finally {
      setGeneratingKey(false);
    }
  }

  async function handleRevokeKey(keyId: number, prefix: string) {
    Alert.alert(
      "Revoke API Key",
      `Revoke key ${prefix}…? Your Kindle will stop syncing until you create a new key.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Revoke",
          style: "destructive",
          onPress: async () => {
            try {
              await authFetch("/api/auth/api-keys", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: keyId }),
              });
              loadApiKeys();
            } catch {
              Alert.alert("Error", "Failed to revoke key");
            }
          },
        },
      ],
    );
  }

  const loadStorage = useCallback(async () => {
    setLoadingStorage(true);
    try {
      const info = await getStorageInfo(db);
      setStorageInfo(info);
    } catch {
      setStorageInfo({ epubBytes: 0, coverBytes: 0, totalBytes: 0, bookCount: 0 });
    } finally {
      setLoadingStorage(false);
    }
  }, [db]);

  useEffect(() => {
    loadStorage();
    loadApiKeys();
  }, [loadStorage, loadApiKeys]);

  function handleClearCache() {
    Alert.alert(
      "Clear Download Cache",
      `This will remove all downloaded EPUBs, cover images, and locally imported books from this device.\n\nYour reading progress will not be affected.`,
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
    <View style={styles.screen}>
      <TabHeader title="Settings" scrollY={scrollY} />
      <Animated.ScrollView
        style={[styles.scrollView, { backgroundColor: colors.groupedBackground }]}
        contentContainerStyle={[styles.scrollContent, { paddingTop: headerHeight }]}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
      >
      {/* Appearance Section */}
      <Text style={styles.sectionHeader}>APPEARANCE</Text>
      <View style={[styles.section, { backgroundColor: colors.secondaryGroupedBackground }]}>
        <View style={styles.row}>
          <View style={[styles.segmentedControl, { backgroundColor: colors.groupedBackground }]}>
            {(["system", "light", "dark"] as const).map((option) => (
              <Pressable
                key={option}
                style={[
                  styles.segment,
                  themePreference === option && [
                    styles.segmentActive,
                    { backgroundColor: colors.secondaryGroupedBackground },
                  ],
                ]}
                onPress={() => setTheme(option)}
              >
                <Text
                  style={[
                    styles.segmentText,
                    { color: colors.secondaryText },
                    themePreference === option && { color: colors.text, fontWeight: "600" },
                  ]}
                >
                  {option.charAt(0).toUpperCase() + option.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      {/* Kindle API Key Section */}
      <Text style={styles.sectionHeader}>KINDLE SYNC</Text>
      <View style={[styles.section, { backgroundColor: colors.secondaryGroupedBackground }]}>
        {loadingKeys ? (
          <View style={styles.row}>
            <ActivityIndicator size="small" color={colors.secondaryText} />
          </View>
        ) : apiKeys.length > 0 ? (
          apiKeys.map((key, i) => (
            <View key={key.id}>
              {i > 0 && <View style={[styles.separator, { backgroundColor: colors.separator }]} />}
              <View style={styles.row}>
                <View style={styles.rowLeft}>
                  <Ionicons name="key-outline" size={22} color={colors.secondaryText} style={styles.rowIcon} />
                  <View>
                    <Text style={[styles.rowLabel, { color: colors.text }]}>{key.prefix}…</Text>
                    <Text style={[styles.rowValueSecondary, { color: colors.secondaryText }]}>
                      {key.lastUsedAt
                        ? `Last used ${new Date(key.lastUsedAt).toLocaleDateString()}`
                        : "Never used"}
                    </Text>
                  </View>
                </View>
                <Pressable onPress={() => handleRevokeKey(key.id, key.prefix)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={20} color={colors.destructive} />
                </Pressable>
              </View>
            </View>
          ))
        ) : (
          <Pressable
            style={({ pressed }) => [
              styles.actionButton,
              pressed && { backgroundColor: colors.groupedBackground },
              generatingKey && styles.actionButtonDisabled,
            ]}
            onPress={handleGenerateKey}
            disabled={generatingKey}
          >
            {generatingKey ? (
              <ActivityIndicator size="small" color={colors.tint} />
            ) : (
              <>
                <Ionicons name="key-outline" size={20} color={colors.tint} style={styles.actionIcon} />
                <Text style={[styles.generateButtonText, { color: colors.tint }]}>Generate API Key</Text>
              </>
            )}
          </Pressable>
        )}
      </View>

      <Text style={styles.sectionFooter}>
        Generate an API key to sync reading progress from your Kindle. In KOReader, go to Reading Sync → Set API key and paste the key.
      </Text>

      {/* Storage Section */}
      <Text style={styles.sectionHeader}>STORAGE</Text>
      <View style={[styles.section, { backgroundColor: colors.secondaryGroupedBackground }]}>
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Ionicons name="folder-outline" size={22} color={colors.secondaryText} style={styles.rowIcon} />
            <Text style={[styles.rowLabel, { color: colors.text }]}>Downloaded Books</Text>
          </View>
          {loadingStorage ? (
            <ActivityIndicator size="small" color={colors.secondaryText} />
          ) : (
            <Text style={[styles.rowValue, { color: colors.text }]}>
              {formatBytes(storageInfo?.totalBytes ?? 0)}
            </Text>
          )}
        </View>

        <View style={[styles.separator, { backgroundColor: colors.separator }]} />

        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Ionicons name="document-outline" size={22} color={colors.secondaryText} style={styles.rowIcon} />
            <Text style={[styles.rowLabel, { color: colors.text }]}>EPUB Files</Text>
          </View>
          {loadingStorage ? (
            <ActivityIndicator size="small" color={colors.secondaryText} />
          ) : (
            <Text style={[styles.rowValueSecondary, { color: colors.secondaryText }]}>
              {storageInfo?.bookCount ?? 0} books · {formatBytes(storageInfo?.epubBytes ?? 0)}
            </Text>
          )}
        </View>

        <View style={[styles.separator, { backgroundColor: colors.separator }]} />

        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <Ionicons name="image-outline" size={22} color={colors.secondaryText} style={styles.rowIcon} />
            <Text style={[styles.rowLabel, { color: colors.text }]}>Cover Images</Text>
          </View>
          {loadingStorage ? (
            <ActivityIndicator size="small" color={colors.secondaryText} />
          ) : (
            <Text style={[styles.rowValueSecondary, { color: colors.secondaryText }]}>
              {formatBytes(storageInfo?.coverBytes ?? 0)}
            </Text>
          )}
        </View>

        <View style={[styles.separator, { backgroundColor: colors.separator }]} />

        <Pressable
          style={({ pressed }) => [
            styles.actionButton,
            pressed && { backgroundColor: colors.groupedBackground },
            (clearing || ((storageInfo?.totalBytes ?? 0) === 0 && (storageInfo?.bookCount ?? 0) === 0)) && styles.actionButtonDisabled,
          ]}
          onPress={handleClearCache}
          disabled={clearing || ((storageInfo?.totalBytes ?? 0) === 0 && (storageInfo?.bookCount ?? 0) === 0)}
        >
          {clearing ? (
            <ActivityIndicator size="small" color={colors.destructive} />
          ) : (
            <>
              <Ionicons name="trash-outline" size={20} color={colors.destructive} style={styles.actionIcon} />
              <Text style={[styles.clearButtonText, { color: colors.destructive }]}>Clear Download Cache</Text>
            </>
          )}
        </Pressable>
      </View>

      <Text style={styles.sectionFooter}>
        Clearing the cache removes downloaded EPUBs and covers from this device. Books will re-download from the cloud when opened. Reading progress is preserved.
      </Text>

      {/* About Section */}
      <Text style={styles.sectionHeader}>ABOUT</Text>
      <View style={[styles.section, { backgroundColor: colors.secondaryGroupedBackground }]}>
        <View style={styles.row}>
          <Text style={[styles.rowLabel, { color: colors.text }]}>Version</Text>
          <Text style={[styles.rowValueSecondary, { color: colors.secondaryText }]}>1.0.0</Text>
        </View>
      </View>
    </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
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
    marginTop: 16,
    marginBottom: 8,
    marginLeft: 32,
    letterSpacing: 0.2,
  },
  section: {
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
  },
  rowValue: {
    fontSize: 16,
    fontWeight: "500",
  },
  rowValueSecondary: {
    fontSize: 15,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 50,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 44,
  },
  actionButtonPressed: {},
  actionButtonDisabled: {
    opacity: 0.4,
  },
  actionIcon: {
    marginRight: 8,
  },
  clearButtonText: {
    fontSize: 16,
    fontWeight: "500",
  },
  generateButtonText: {
    fontSize: 16,
    fontWeight: "500",
  },
  segmentedControl: {
    flexDirection: "row",
    borderRadius: 8,
    padding: 2,
    flex: 1,
  },
  segment: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 7,
  },
  segmentActive: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: "500",
  },
});
