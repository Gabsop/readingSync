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
import * as Clipboard from "expo-clipboard";
import {
  getStorageInfo,
  clearDownloadCache,
  formatBytes,
  type StorageInfo,
} from "../lib/storage-manager";
import { authFetch, API_URL } from "../lib/api";

interface ApiKeyInfo {
  id: number;
  prefix: string;
  name: string;
  lastUsedAt: string | null;
  createdAt: string;
}

export default function SettingsScreen() {
  const router = useRouter();
  const db = useSQLiteContext();

  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [loadingStorage, setLoadingStorage] = useState(true);
  const [clearing, setClearing] = useState(false);

  const [apiKeys, setApiKeys] = useState<ApiKeyInfo[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);

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
      setNewKey(data.key);
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
      // Non-critical — show zeros
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

        {/* Kindle API Key Section */}
        <Text style={styles.sectionHeader}>KINDLE SYNC</Text>
        <View style={styles.section}>
          {loadingKeys ? (
            <View style={styles.row}>
              <ActivityIndicator size="small" color="#8E8E93" />
            </View>
          ) : apiKeys.length > 0 ? (
            apiKeys.map((key, i) => (
              <View key={key.id}>
                {i > 0 && <View style={styles.separator} />}
                <View style={styles.row}>
                  <View style={styles.rowLeft}>
                    <Ionicons name="key-outline" size={22} color="#8E8E93" style={styles.rowIcon} />
                    <View>
                      <Text style={styles.rowLabel}>{key.prefix}…</Text>
                      <Text style={styles.rowValueSecondary}>
                        {key.lastUsedAt
                          ? `Last used ${new Date(key.lastUsedAt).toLocaleDateString()}`
                          : "Never used"}
                      </Text>
                    </View>
                  </View>
                  <Pressable onPress={() => handleRevokeKey(key.id, key.prefix)} hitSlop={8}>
                    <Ionicons name="trash-outline" size={20} color="#FF3B30" />
                  </Pressable>
                </View>
              </View>
            ))
          ) : (
            <Pressable
              style={({ pressed }) => [
                styles.generateButton,
                pressed && styles.clearButtonPressed,
                generatingKey && styles.clearButtonDisabled,
              ]}
              onPress={handleGenerateKey}
              disabled={generatingKey}
            >
              {generatingKey ? (
                <ActivityIndicator size="small" color="#007AFF" />
              ) : (
                <>
                  <Ionicons name="key-outline" size={20} color="#007AFF" style={styles.clearIcon} />
                  <Text style={styles.generateButtonText}>Generate API Key</Text>
                </>
              )}
            </Pressable>
          )}
        </View>

        <Text style={styles.sectionFooter}>
          Generate an API key to sync reading progress from your Kindle. In KOReader, go to Reading Sync → Set API key and paste the key.
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
  generateButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 44,
  },
  generateButtonText: {
    fontSize: 16,
    color: "#007AFF",
    fontWeight: "500",
  },
});
