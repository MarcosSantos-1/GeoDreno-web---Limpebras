"use client";

import { createContext, useCallback, useContext, useLayoutEffect, useState } from "react";

interface ThemeContextType {
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (theme: "light" | "dark") => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(false);

  /** Alinha o estado com a classe em `document.documentElement` (script no layout) para o ícone refletir o tema real. */
  useLayoutEffect(() => {
    const dark = document.documentElement.classList.contains("dark");
    queueMicrotask(() => setIsDark(dark));
  }, []);

  const toggleTheme = useCallback(() => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
    setIsDark(next);
  }, []);

  const setTheme = useCallback((theme: "light" | "dark") => {
    const darkMode = theme === "dark";
    document.documentElement.classList.toggle("dark", darkMode);
    localStorage.setItem("theme", theme);
    setIsDark(darkMode);
  }, []);

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
