import js from "@eslint/js"
import tsPlugin from "@typescript-eslint/eslint-plugin"
import tsParser from "@typescript-eslint/parser"
import prettierConfig from "eslint-config-prettier"
import globals from "globals"
import type { Linter } from "eslint"

const config: Linter.Config[] = [
  // Base JS recommended rules
  js.configs.recommended,

  // TypeScript source files (type-aware linting via tsconfig)
  {
    files: ["src/**/*.ts", "bin/**/*.ts", "tests/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        project: "./tsconfig.json",
      },
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      // TypeScript recommended rules
      ...tsPlugin.configs["recommended"].rules,

      // Disable base rule in favor of TS version
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],

      // No explicit any
      "@typescript-eslint/no-explicit-any": "error",

      // Require explicit return types on functions
      "@typescript-eslint/explicit-function-return-type": "off",

      // Consistent type imports
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
          fixStyle: "inline-type-imports",
        },
      ],

      // No non-null assertions
      "@typescript-eslint/no-non-null-assertion": "warn",
    },
  },

  // Tooling configs (not part of tsconfig.json include) — lint without type-aware rules
  {
    files: ["*.config.ts", "*.config.mts", "*.config.js"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        // No `project` here — avoids "file not in tsconfig" parser errors
      },
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
  },

  // Ignore patterns
  {
    ignores: ["node_modules/**", "dist/**", "coverage/**", "*.js", "*.mjs"],
  },

  // Prettier must be last to override formatting rules
  prettierConfig,
]

export default config
