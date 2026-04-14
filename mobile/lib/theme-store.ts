import { Appearance } from "react-native";
import { create } from "zustand";
import * as SecureStore from "expo-secure-store";

const THEME_KEY = "theme-preference";

type ThemePreference = "system" | "light" | "dark";

interface ThemeState {
  preference: ThemePreference;
  load: () => Promise<void>;
  set: (preference: ThemePreference) => Promise<void>;
}

function applyTheme(preference: ThemePreference) {
  Appearance.setColorScheme(preference === "system" ? null : preference);
}

export const useThemeStore = create<ThemeState>((setState) => ({
  preference: "system",

  load: async () => {
    const saved = await SecureStore.getItemAsync(THEME_KEY);
    const preference = (saved as ThemePreference) || "system";
    setState({ preference });
    applyTheme(preference);
  },

  set: async (preference) => {
    await SecureStore.setItemAsync(THEME_KEY, preference);
    setState({ preference });
    applyTheme(preference);
  },
}));
