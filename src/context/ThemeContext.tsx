import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface ThemeColors {
  isDark: boolean;
  background: string;
  surface: string;
  surfaceAlt: string;
  surfaceHighlight: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  gold: string;
  goldLight: string;
  goldBg: string;
  goldBorder: string;
  forest: string;
  forestLight: string;
  forestBg: string;
  forestBorder: string;
  rose: string;
  roseBg: string;
  roseBorder: string;
}

const DARK_COLORS: ThemeColors = {
  isDark: true,
  background: "#020617", // slate-950
  surface: "#0f172a", // slate-900
  surfaceAlt: "#1e293b", // slate-800
  surfaceHighlight: "#020617",
  text: "#f8fafc",
  textSecondary: "#cbd5e1",
  textMuted: "#94a3b8",
  border: "#1e293b",
  gold: "#d4a017",
  goldLight: "#fde047",
  goldBg: "rgba(212, 160, 23, 0.14)",
  goldBorder: "rgba(212, 160, 23, 0.35)",
  forest: "#4ade80",
  forestLight: "#86efac",
  forestBg: "rgba(22, 163, 74, 0.16)",
  forestBorder: "rgba(22, 163, 74, 0.35)",
  rose: "#f87171",
  roseBg: "rgba(225, 29, 72, 0.18)",
  roseBorder: "rgba(225, 29, 72, 0.4)",
};

const LIGHT_COLORS: ThemeColors = {
  isDark: false,
  background: "#f6f4ef", // warm parchment matching web app
  surface: "#ffffff",
  surfaceAlt: "#f3eee3",
  surfaceHighlight: "#ede8dd",
  text: "#0f172a",
  textSecondary: "#334155",
  textMuted: "#64748b",
  border: "#d6d3d1",
  gold: "#b8860b",
  goldLight: "#a16207",
  goldBg: "#f7f2e4",
  goldBorder: "#dacaa2",
  forest: "#15803d",
  forestLight: "#166534",
  forestBg: "#f0fdf4",
  forestBorder: "#bbf7d0",
  rose: "#e11d48",
  roseBg: "#fff1f2",
  roseBorder: "#fecdd3",
};

interface ThemeContextType {
  isDark: boolean;
  colors: ThemeColors;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  isDark: true,
  colors: DARK_COLORS,
  toggleTheme: () => {},
});

const THEME_STORAGE_KEY = "subcancel_theme_mobile";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY).then((saved) => {
      if (saved === "light") setIsDark(false);
      else if (saved === "dark") setIsDark(true);
    });
  }, []);

  const toggleTheme = () => {
    setIsDark((prev) => {
      const next = !prev;
      AsyncStorage.setItem(THEME_STORAGE_KEY, next ? "dark" : "light");
      return next;
    });
  };

  return (
    <ThemeContext.Provider
      value={{
        isDark,
        colors: isDark ? DARK_COLORS : LIGHT_COLORS,
        toggleTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
