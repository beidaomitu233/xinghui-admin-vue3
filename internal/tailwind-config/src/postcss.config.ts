import { createRequire } from 'node:module';

import config from '.';

const require = createRequire(import.meta.url);

export default {
  plugins: {
    // Resolve this package's declared dependency without relying on root hoisting.
    ...(process.env.NODE_ENV === 'production'
      ? { [require.resolve('cssnano')]: {} }
      : {}),
    // Specifying the config is not necessary in most cases, but it is included
    autoprefixer: {},
    // 修复 element-plus 和 ant-design-vue 的样式和tailwindcss冲突问题
    'postcss-antd-fixes': { prefixes: ['ant', 'el'] },
    'postcss-import': {},
    'postcss-preset-env': {},
    tailwindcss: { config },
    'tailwindcss/nesting': {},
  },
};
