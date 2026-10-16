import { cpSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitepress';

import { resolveDocsBase } from './base.mjs';
import { sections } from './chapters.mjs';
import { tokenizeChinese } from './search.mjs';

const partial = process.env.DOCS_PARTIAL === '1';
const base = resolveDocsBase();
export default defineConfig({
  lang: 'zh-CN',
  title: partial ? '星辉文档 · 部分章节' : '星辉文档',
  description: '星辉后台管理系统：使用、开发、组件与部署指南',
  base,
  srcDir: 'content',
  cleanUrls: false,
  ignoreDeadLinks: partial,
  vite: { publicDir: fileURLToPath(new URL('../public', import.meta.url)) },
  markdown: { codeCopyButtonTitle: '复制代码' },
  buildEnd(site) {
    const expected = fileURLToPath(new URL('dist/', import.meta.url));
    if (resolve(site.outDir) !== resolve(expected))
      throw new Error(
        'Documentation output must stay in apps/docs/.vitepress/dist',
      );
    cpSync(fileURLToPath(new URL('../public', import.meta.url)), expected, {
      recursive: true,
    });
  },
  lastUpdated: false,
  head: [['link', { rel: 'icon', href: `${base}favicon.svg` }]],
  themeConfig: {
    notFound: {
      title: '页面不存在',
      quote: '请从目录查找，或返回首页。',
      linkLabel: '返回文档首页',
      linkText: '返回首页',
    },
    logo: '/favicon.svg',
    nav: sections.map((section) => ({
      text: section.title,
      link: `/${section.items[0][0]}`,
    })),
    sidebar: sections.map((section) => ({
      text: section.title,
      collapsed: false,
      items: section.items.map(([path, text]) => ({ text, link: `/${path}` })),
    })),
    outline: { level: [2, 3], label: '本页目录' },
    docFooter: { prev: '上一篇', next: '下一篇' },
    sidebarMenuLabel: '章节导航',
    returnToTopLabel: '返回顶部',
    darkModeSwitchLabel: '切换配色',
    darkModeSwitchTitle: '切换到深色',
    lightModeSwitchTitle: '切换到浅色',
    search: {
      provider: 'local',
      options: {
        miniSearch: {
          options: { tokenize: tokenizeChinese },
          searchOptions: { prefix: true, fuzzy: 0.1 },
        },
        locales: {
          root: {
            translations: {
              button: { buttonText: '搜索文档', buttonAriaLabel: '搜索文档' },
              modal: {
                displayDetails: '显示详情',
                resetButtonTitle: '清除搜索',
                backButtonTitle: '关闭搜索',
                noResultsText: '没有找到相关内容',
                footer: {
                  selectText: '选择',
                  navigateText: '切换',
                  closeText: '关闭',
                },
              },
            },
          },
        },
      },
    },
    footer: {
      message: partial
        ? '开发检查：仅本站点分支章节，完整内容待组合。'
        : '开发候选文档。功能与验证边界以各章节为准。',
      copyright: '保留 Vue Vben Admin、VitePress 及其他上游归属。',
    },
  },
});
