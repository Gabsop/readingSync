/**
 * Reader settings — types, theme definitions, defaults, and SQLite persistence.
 *
 * Settings are stored in the SQLite `settings` table as JSON under the key
 * "reader_settings". The store exposes a hook that loads on mount and writes
 * back on every change.
 */

import { useCallback, useEffect, useState } from "react";
import type { SQLiteDatabase } from "expo-sqlite";

// ---------------------------------------------------------------------------
// Theme definitions (matches Apple Books)
// ---------------------------------------------------------------------------

export interface ReaderTheme {
  name: string;
  backgroundColor: string;
  textColor: string;
  secondaryTextColor: string;
  /** Accent used for links */
  linkColor: string;
}

export const THEMES = {
  original: {
    name: "Original",
    backgroundColor: "#FFFFFF",
    textColor: "#1C1C1E",
    secondaryTextColor: "#8E8E93",
    linkColor: "#007AFF",
  },
  quiet: {
    name: "Quiet",
    backgroundColor: "#F2F1ED",
    textColor: "#3A3A3C",
    secondaryTextColor: "#8E8E93",
    linkColor: "#007AFF",
  },
  paper: {
    name: "Paper",
    backgroundColor: "#F5EDDC",
    textColor: "#3B2F1E",
    secondaryTextColor: "#8B7D6B",
    linkColor: "#A0522D",
  },
  bold: {
    name: "Bold",
    backgroundColor: "#1C1C1E",
    textColor: "#F2F2F7",
    secondaryTextColor: "#8E8E93",
    linkColor: "#64D2FF",
  },
  calm: {
    name: "Calm",
    backgroundColor: "#DAC9A6",
    textColor: "#2C2518",
    secondaryTextColor: "#6B5D4A",
    linkColor: "#8B6914",
  },
  focus: {
    name: "Focus",
    backgroundColor: "#2C2C2E",
    textColor: "#D1D1D6",
    secondaryTextColor: "#8E8E93",
    linkColor: "#64D2FF",
  },
} as const;

export type ThemeKey = keyof typeof THEMES;

export const THEME_KEYS: ThemeKey[] = [
  "original",
  "quiet",
  "paper",
  "bold",
  "calm",
  "focus",
];

// ---------------------------------------------------------------------------
// Font options
// ---------------------------------------------------------------------------

export const FONT_FAMILIES = [
  "System",
  "Georgia",
  "Palatino",
  "New York",
  "Athelas",
  "Charter",
  "Iowan Old Style",
] as const;

export type FontFamily = (typeof FONT_FAMILIES)[number];

// ---------------------------------------------------------------------------
// Line spacing / margin presets
// ---------------------------------------------------------------------------

export const LINE_SPACING_OPTIONS = {
  compact: 1.3,
  normal: 1.6,
  loose: 2.0,
} as const;

export type LineSpacingKey = keyof typeof LINE_SPACING_OPTIONS;

export const MARGIN_OPTIONS = {
  narrow: 16,
  normal: 24,
  wide: 36,
} as const;

export type MarginKey = keyof typeof MARGIN_OPTIONS;

// ---------------------------------------------------------------------------
// Settings shape
// ---------------------------------------------------------------------------

export interface ReaderSettings {
  fontSize: number;
  fontFamily: FontFamily;
  theme: ThemeKey;
  lineSpacing: LineSpacingKey;
  margins: MarginKey;
  textAlign: "left" | "justify";
}

const DEFAULTS: ReaderSettings = {
  fontSize: 17,
  fontFamily: "System",
  theme: "original",
  lineSpacing: "normal",
  margins: "normal",
  textAlign: "justify",
};

const MIN_FONT_SIZE = 12;
const MAX_FONT_SIZE = 30;
const FONT_SIZE_STEP = 1;

const SETTINGS_KEY = "reader_settings";

// ---------------------------------------------------------------------------
// SQLite persistence helpers
// ---------------------------------------------------------------------------

async function loadSettings(db: SQLiteDatabase): Promise<ReaderSettings> {
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM settings WHERE key = ?",
    [SETTINGS_KEY],
  );
  if (!row) return { ...DEFAULTS };
  try {
    return { ...DEFAULTS, ...JSON.parse(row.value) };
  } catch {
    return { ...DEFAULTS };
  }
}

async function saveSettings(db: SQLiteDatabase, settings: ReaderSettings) {
  await db.runAsync(
    "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
    [SETTINGS_KEY, JSON.stringify(settings)],
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useReaderSettings(db: SQLiteDatabase) {
  const [settings, setSettingsState] = useState<ReaderSettings>({ ...DEFAULTS });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadSettings(db).then((s) => {
      setSettingsState(s);
      setLoaded(true);
    });
  }, [db]);

  const update = useCallback(
    (patch: Partial<ReaderSettings>) => {
      setSettingsState((prev) => {
        const next = { ...prev, ...patch };
        // Clamp font size
        next.fontSize = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, next.fontSize));
        saveSettings(db, next);
        return next;
      });
    },
    [db],
  );

  const increaseFontSize = useCallback(() => {
    update({ fontSize: settings.fontSize + FONT_SIZE_STEP });
  }, [settings.fontSize, update]);

  const decreaseFontSize = useCallback(() => {
    update({ fontSize: settings.fontSize - FONT_SIZE_STEP });
  }, [settings.fontSize, update]);

  return {
    settings,
    loaded,
    update,
    increaseFontSize,
    decreaseFontSize,
    canIncrease: settings.fontSize < MAX_FONT_SIZE,
    canDecrease: settings.fontSize > MIN_FONT_SIZE,
  };
}

// ---------------------------------------------------------------------------
// Derived helpers — compute concrete values from settings
// ---------------------------------------------------------------------------

export function getTheme(key: ThemeKey): ReaderTheme {
  return THEMES[key];
}

export function getLineHeight(key: LineSpacingKey, fontSize: number) {
  return Math.round(fontSize * LINE_SPACING_OPTIONS[key]);
}

export function getHorizontalMargin(key: MarginKey) {
  return MARGIN_OPTIONS[key];
}

export function getFontFamily(family: FontFamily) {
  if (family === "System") return undefined; // React Native uses system font by default
  return family;
}
