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
};
