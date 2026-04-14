import { useColorScheme } from "react-native";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { Text as SwiftText } from "@expo/ui/swift-ui";

export default function TabsLayout() {
  const colorScheme = useColorScheme();
  const tintColor = colorScheme === "dark" ? "#0A84FF" : "#007AFF";

  return (
    <NativeTabs tintColor={tintColor} minimizeBehavior="onScrollDown">
      <NativeTabs.Trigger name="reading-now">
        <SwiftText>Reading Now</SwiftText>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="library">
        <SwiftText>Library</SwiftText>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <SwiftText>Settings</SwiftText>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="search" hidden>
        <SwiftText>Search</SwiftText>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
