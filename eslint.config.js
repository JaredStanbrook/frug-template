import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["dist", "node_modules", ".wrangler", "worker-configuration.d.ts"] },
  {
    // 1. Keep standard JS and TypeScript rules
    extends: [js.configs.recommended, ...tseslint.configs.recommended, prettier],

    // 2. Target your files
    files: ["**/*.{ts,tsx}"],

    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      // 3. Setup parser for TypeScript
      parserOptions: {
        project: ["./tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },

    rules: {
      "no-console": ["warn", { allow: ["log", "warn", "error"] }],

      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/strict-boolean-expressions": "off",
    },
  },
);
