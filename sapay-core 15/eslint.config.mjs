// ESLint flat config. Type-aware linting is on because the rules that matter
// most for a ledger (floating and misused promises) need type information.
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'coverage/', 'node_modules/', 'public/', 'mobile/', 'integration/', '*.cjs', '*.js', '*.mjs'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // An un-awaited database call can commit or fail after the HTTP
      // response is sent, so these stay errors.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Ratchet, not a free pass: these flag `any` flowing out of pg query
      // rows, JSON.parse and test doubles (about 110 findings today). Typing
      // them properly means typed row interfaces for every query, which is
      // its own change. They stay visible as warnings until then, and should
      // be promoted back to errors once the count reaches zero.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
    },
  },
);
