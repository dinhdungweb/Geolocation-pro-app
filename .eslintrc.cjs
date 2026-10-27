/** @type {import('@types/eslint').Linter.BaseConfig} */
module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  extends: ["eslint:recommended", "plugin:react-hooks/recommended", "prettier"],
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  ignorePatterns: [".react-router/", "build/", "coverage/"],
  globals: {
    shopify: "readonly"
  },
  rules: {
    "no-constant-binary-expression": "error",
    "no-unused-vars": "off"
  },
  overrides: [
    {
      // ESLint 8 only lints .js by default; without this override no
      // TypeScript file (i.e. the whole app) was ever linted.
      files: ["**/*.ts", "**/*.tsx"],
      extends: ["plugin:@typescript-eslint/recommended"],
      rules: {
        // Existing debt, tracked as warnings so new code is still flagged
        // without blocking the build on the backlog.
        "@typescript-eslint/no-explicit-any": "warn",
        "@typescript-eslint/no-unused-vars": [
          "warn",
          { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
        ],
        // TypeScript already reports undefined identifiers, and this rule
        // misfires on type-only globals.
        "no-undef": "off",
      },
    },
  ],
};
