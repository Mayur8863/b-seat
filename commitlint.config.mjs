/** Conventional Commits: https://www.conventionalcommits.org */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      1,
      'always',
      [
        'web',
        'api',
        'ui',
        'config',
        'api-client',
        'infra',
        'ci',
        'docs',
        'agents',
        'deps',
        'specs',
      ],
    ],
    'body-max-line-length': [0],
  },
};
