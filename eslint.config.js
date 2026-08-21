import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * Lint configuration.
 *
 * Deliberately narrow: rules that catch real defects, not stylistic ones —
 * formatting is Prettier's job. The shadcn components under components/ui are
 * vendored and excluded, so their conventions do not have to be argued with.
 */
export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "build/**",
      "node_modules/**",
      "drizzle/**/*.sql",
      "*.config.js",
      "client/src/components/ui/**",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
      // Type information is required by no-floating-promises and
      // no-misused-promises, so the project service is enabled for every
      // TypeScript file rather than only the app directories.
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // Unused values are usually a leftover from a refactor. The underscore
      // prefix is the documented way to say "intentionally unused".
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      // `any` silently disables the type checker, which is how the socket
      // handlers ended up accepting unvalidated payloads.
      "@typescript-eslint/no-explicit-any": "error",
      // An un-awaited promise in a request handler loses its error.
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],
    },
  },

  {
    files: ["server/**/*.ts"],
    rules: {
      // The server logs operational events to stdout by design.
      "no-console": "off",
    },
  },

  {
    files: ["client/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },

  {
    files: ["**/*.test.ts", "server/__tests__/**/*.ts"],
    rules: {
      // Tests deliberately construct partial objects to stand in for real ones.
      "@typescript-eslint/no-explicit-any": "off",
    },
  }
);
