import { Tabs } from "expo-router";
import { Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSQLiteContext } from "expo-sqlite";
import { importFromDocumentPicker } from "../../lib/book-import";

function ImportButton() {
  const db = useSQLiteContext();
  return (
    <Pressable
      onPress={() => importFromDocumentPicker(db)}
      hitSlop={8}
      style={{ marginRight: 8 }}
    >
      <Ionicons name="add" size={28} color="#007AFF" />
    </Pressable>
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
          headerRight: () => <ImportButton />,
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
