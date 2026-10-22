import { defineConfig } from 'eslint/config';

import base from './base.mjs';

/** NestJS API: base + allowances for decorator-driven classes. */
/** @param {{ tsconfigRootDir: string }} options */
export default function nest(options) {
  return defineConfig(base(options), {
    rules: {
      // Nest modules are empty classes carrying a @Module() decorator.
      '@typescript-eslint/extraneous-class': ['error', { allowWithDecorator: true }],
      // Constructor DI needs runtime (non-type) imports for emitDecoratorMetadata.
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  });
}
