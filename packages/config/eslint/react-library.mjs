import { defineConfig } from 'eslint/config';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

import base from './base.mjs';

/** React rules + strict accessibility (WCAG 2.1 AA baseline). */
export const reactRules = defineConfig(
  react.configs.flat.recommended,
  react.configs.flat['jsx-runtime'],
  reactHooks.configs.flat['recommended-latest'],
  jsxA11y.flatConfigs.strict,
  {
    languageOptions: { globals: { ...globals.browser } },
    settings: { react: { version: 'detect' } },
    rules: {
      'react/prop-types': 'off',
      // The strict preset allows tabpanel only. A labelled region that scrolls must be focusable, or keyboard
      // users cannot scroll it (axe scrollable-region-focusable, WCAG 2.1.1). Other options keep the preset values.
      'jsx-a11y/no-noninteractive-tabindex': [
        'error',
        { tags: [], roles: ['tabpanel', 'region'], allowExpressionValues: true },
      ],
    },
  },
);

/** @param {{ tsconfigRootDir: string }} options */
export default function reactLibrary(options) {
  return defineConfig(base(options), reactRules);
}
