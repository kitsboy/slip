// ESLint flat config. Deliberately small: enough to keep the house rules honest
// (no `any`, no stray console, no unused vars) without a type-aware 4-second run
// on every save. Type errors are tsc's job, not this file's.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'screenshots/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
    rules: {
      // The money path is integer-only; an `any` there is how floats sneak in.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
    },
  },
  {
    // Node-run files (playwright drivers, fixture generators) live outside the browser.
    files: ['**/*.mjs', 'scripts/**/*.{mjs,ts}'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // The service worker runs in the worker global scope, not the window.
    files: ['public/sw.js'],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
  {
    // Playwright files evaluate inside the page, so `document` is legitimate there.
    files: ['tests/e2e/**/*.mjs'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    // Tests and scripts may reach for the console and for looser shapes.
    files: ['tests/**/*.{ts,tsx,mjs}', 'scripts/**/*.{mjs,ts}'],
    rules: { 'no-console': 'off', '@typescript-eslint/no-explicit-any': 'warn' },
  },
  {
    files: ['*.config.{js,ts}', 'tailwind.config.js'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);
