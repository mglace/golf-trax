/* eslint-env node */
module.exports = {
  root: true,
  env: { browser: true, es2021: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  plugins: ['react-refresh', 'react-hooks'],
  settings: { react: { version: '18.3' } },
  ignorePatterns: ['dist', 'node_modules', '.eslintrc.cjs'],
  rules: {
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
  },
  overrides: [
    {
      // Playwright config + E2E specs run in Node and use test globals, not the
      // browser/React rules that apply to the app source under src/.
      files: ['playwright.config.ts', 'e2e/**/*.ts'],
      env: { browser: true, node: true },
      rules: {
        'react-refresh/only-export-components': 'off',
      },
    },
  ],
}
