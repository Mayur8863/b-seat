import nextPlugin from '@next/eslint-plugin-next';
import { defineConfig } from 'eslint/config';

import base from './base.mjs';
import { reactRules } from './react-library.mjs';

/** Next.js app: base + React/a11y + Next core-web-vitals. */
/** @param {{ tsconfigRootDir: string }} options */
export default function next(options) {
  return defineConfig(base(options), reactRules, nextPlugin.configs['core-web-vitals'], {
    rules: {
      // The generated API client is the only way to talk to the backend.
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'Use the generated client from @bseat/api-client.' },
      ],
      'no-restricted-imports': [
        'error',
        { paths: [{ name: 'axios', message: 'Use the generated client from @bseat/api-client.' }] },
      ],
    },
  });
}
