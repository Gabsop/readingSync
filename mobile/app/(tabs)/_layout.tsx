import { Tabs, useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSQLiteContext } from "expo-sqlite";
import { importFromDocumentPicker } from "../../lib/book-import";

function LibraryHeaderRight() {
  const db = useSQLiteContext();
  const router = useRouter();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <Pressable
        onPress={() => router.push("/settings")}
        hitSlop={8}
        style={{ marginRight: 4 }}
      >
        <Ionicons name="settings-outline" size={22} color="#007AFF" />
      </Pressable>
      <Pressable
        onPress={() => importFromDocumentPicker(db)}
        hitSlop={8}
        style={{ marginRight: 8 }}
      >
        <Ionicons name="add" size={28} color="#007AFF" />
      </Pressable>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#007AFF",
      }}
    >
      <Tabs.Screen
        name="reading-now"
        options={{
          title: "Reading Now",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="book" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: "Library",
          headerRight: () => <LibraryHeaderRight />,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="library" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: "Search",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="search" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
