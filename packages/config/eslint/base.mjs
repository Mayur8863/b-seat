import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Strict, type-aware base config for every TypeScript package.
 * @param {{ tsconfigRootDir: string }} options pass `import.meta.dirname`
 */
export default function base({ tsconfigRootDir }) {
  return defineConfig(
    globalIgnores([
      '**/dist/**',
      '**/dist-dev/**',
      '**/.next/**',
      '**/coverage/**',
      '**/generated/**',
      '**/next-env.d.ts',
      '**/playwright-report/**',
      '**/test-results/**',
    ]),
    js.configs.recommended,
    tseslint.configs.strictTypeChecked,
    tseslint.configs.stylisticTypeChecked,
    {
      languageOptions: {
        globals: { ...globals.node },
        parserOptions: { projectService: true, tsconfigRootDir },
      },
      rules: {
        '@typescript-eslint/consistent-type-imports': [
          'error',
          { fixStyle: 'inline-type-imports' },
        ],
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
        ],
        '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
        'no-console': ['error', { allow: ['warn', 'error'] }],
        eqeqeq: ['error', 'smart'],
      },
    },
    {
      files: ['**/*.{js,mjs,cjs}'],
      extends: [tseslint.configs.disableTypeChecked],
    },
    {
      files: ['**/*.{test,spec}.{ts,tsx}', '**/test/**/*.ts', '**/e2e/**/*.ts'],
      rules: {
        '@typescript-eslint/no-non-null-assertion': 'off',
        '@typescript-eslint/unbound-method': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
      },
    },
    prettier,
  );
}
