// @ts-check

import { defineConfig } from '@vben/eslint-config';

export default defineConfig([
  {
    ignores: [
      '.quality/**',
      'site/**',
      'scripts/check-site.mjs',
      'scripts/check-site.test.mjs',
    ],
  },
  {
    files: [
      'apps/web-ele/src/views/system/ai-model/index.vue',
      'apps/web-ele/src/views/system/business-config/index.vue',
      'apps/web-ele/src/views/system/wechat/index.vue',
    ],
    rules: {
      'vue/html-closing-bracket-newline': [
        'error',
        { singleline: 'never', multiline: 'always' },
      ],
      'vue/multiline-html-element-content-newline': 'error',
    },
  },
  {
    files: ['apps/web-ele/src/views/**/*.vue'],
    rules: {
      'vue/html-closing-bracket-newline': [
        'error',
        { singleline: 'never', multiline: 'always' },
      ],
      'vue/html-quotes': ['error', 'double', { avoidEscape: true }],
    },
  },
]);
