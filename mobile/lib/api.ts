import { Platform } from "react-native";
import { useAuthStore } from "./auth-store";

// Android emulator uses 10.0.2.2 to reach host machine's localhost
const DEV_API_URL = Platform.select({
  android: "http://10.0.2.2:3000",
  default: "http://localhost:3000",
});

// TODO: Replace with production URL when deploying
export const API_URL = __DEV__ ? DEV_API_URL : "https://readingsync.example.com";

/** Fetch wrapper that injects the session token as a Bearer header. */
export async function authFetch(path: string, init?: RequestInit) {
  const token = useAuthStore.getState().token;
  const headers = new Headers(init?.headers);

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(`${API_URL}${path}`, { ...init, headers });
}
