import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// Flat config (ESLint 9). Type-aware linting is intentionally deferred until the
// real application code lands in Phase 2; the recommended rule sets are enough
// to keep the bootstrap honest.
export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'eslint.config.mjs'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
    },
  },
);
