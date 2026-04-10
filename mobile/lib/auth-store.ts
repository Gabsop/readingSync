import { create } from "zustand";
import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "session-token";

interface AuthState {
  token: string | null;
  isLoading: boolean;
  loadToken: () => Promise<void>;
  setToken: (token: string) => Promise<void>;
  clearToken: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  isLoading: true,

  loadToken: async () => {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    set({ token, isLoading: false });
  },

  setToken: async (token) => {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    set({ token, isLoading: false });
  },

  clearToken: async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    set({ token: null, isLoading: false });
  },
}));
