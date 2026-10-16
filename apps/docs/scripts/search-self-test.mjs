import assert from 'node:assert/strict';
import process from 'node:process';

import MiniSearch from 'minisearch';

import { tokenizeChinese } from '../.vitepress/search.mjs';

const index = new MiniSearch({
  fields: ['title', 'text'],
  storeFields: ['title'],
  tokenize: tokenizeChinese,
});
index.addAll([
  {
    id: 'dictionary',
    title: '字典管理',
    text: '新增字典类型和字典数据，代码和值创建后不可修改。',
  },
  {
    id: 'configuration',
    title: '运行配置',
    text: 'CONFIG_MASTER_KEY 保护持久化业务配置，变更主密钥需要恢复计划。',
  },
  {
    id: 'menus',
    title: '菜单管理',
    text: '系统管理、通用能力、运行维护三个入口。',
  },
]);
assert.equal(
  index.search('字典管理', { boost: { title: 4 }, prefix: true })[0]?.id,
  'dictionary',
);
assert.equal(
  index.search('CONFIG_MASTER_KEY', { prefix: true })[0]?.id,
  'configuration',
);
assert.equal(
  index.search('config_master', { prefix: true })[0]?.id,
  'configuration',
);
assert.equal(
  index.search('没有这个功能xyz987', { combineWith: 'AND' }).length,
  0,
);
process.stdout.write(
  'Local search self-test passed: Chinese, English configuration key, prefix and no-result queries.\n',
);
