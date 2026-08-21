import { createContext, useContext } from "react";

export type Theme = "light" | "dark";

export interface ThemeContextType {
  theme: Theme;
  toggleTheme?: () => void;
  switchable: boolean;
}

export const ThemeContext = createContext<ThemeContextType | undefined>(
  undefined
);

/**
 * Kept out of ThemeContext.tsx so that file only exports components: mixing a
 * hook and a component in one module breaks React Fast Refresh for it.
 */
export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
