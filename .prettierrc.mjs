import config from '@vben/prettier-config';

export default {
  ...config,
  overrides: [
    ...(config.overrides ?? []),
    {
      files: ['apps/web-ele/src/views/**/*.vue'],
      options: { htmlWhitespaceSensitivity: 'ignore' },
    },
  ],
};
