import { Stack } from "expo-router";
import { useColorScheme } from "react-native";

export default function SearchLayout() {
  const colorScheme = useColorScheme();
  const backgroundColor = colorScheme === "dark" ? "#000000" : "#FFFFFF";

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor },
      }}
    >
      <Stack.Screen name="index" />
    </Stack>
  );
}
