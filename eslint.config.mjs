import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'build', 'node_modules'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // React Hooks rules (flat-config compatible object form)
      ...reactHooks.configs.recommended.rules,
      // Allow unused vars prefixed with _ (common pattern in this codebase)
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Allow explicit any for now — tighten later
      '@typescript-eslint/no-explicit-any': 'warn',
      // React Refresh: only warn, don't block
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
)

