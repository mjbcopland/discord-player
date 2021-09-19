module.exports = {
  env: { node: true },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking",
    "plugin:eslint-comments/recommended",
    "plugin:import/recommended",
    "plugin:prettier/recommended",
  ],
  parserOptions: { project: require.resolve("./tsconfig.json") },
  settings: { "import/resolver": "typescript" },
  rules: {
    "eslint-comments/no-unused-disable": "error",
    "eslint-comments/require-description": "error",
    "import/no-extraneous-dependencies": "error",
    "import/order": "error",

    "@typescript-eslint/ban-types": [
      "error",
      {
        extendDefaults: true,
        types: { BigInt: { message: "Use bigint instead", fixWith: "bigint" } },
      },
    ],

    // Use winston instead https://github.com/winstonjs/winston
    "no-console": "error",
  },
};
