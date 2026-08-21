import React, { useEffect, useState } from "react";
import { ThemeContext, type Theme } from "./themeContextValue";

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  switchable?: boolean;
}

export function ThemeProvider({
  children,
  defaultTheme = "light",
  switchable = false,
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (!switchable) return defaultTheme;
    try {
      const stored = localStorage.getItem("theme");
      return stored === "light" || stored === "dark" ? stored : defaultTheme;
    } catch {
      // Private browsing and blocked site data both make this throw.
      return defaultTheme;
    }
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");

    if (!switchable) return;
    try {
      localStorage.setItem("theme", theme);
    } catch {
      // Persisting the preference is a convenience, never a requirement.
    }
  }, [theme, switchable]);

  const toggleTheme = switchable
    ? () => setTheme(prev => (prev === "light" ? "dark" : "light"))
    : undefined;

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, switchable }}>
      {children}
    </ThemeContext.Provider>
  );
}
