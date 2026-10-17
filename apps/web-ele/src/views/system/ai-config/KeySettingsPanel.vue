<script lang="ts" setup>
import type {
  AiConfiguration,
  ApplicationImpact,
  ConfigurationPage,
  ConfigurationRow,
  ConfigurationTest,
  ConfigurationVersion,
} from '#/api/system/ai-configuration';

import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';

import { useAccessStore } from '@vben/stores';

import { ElMessage, ElMessageBox } from 'element-plus';

import {
  activateConfiguration,
  archiveConfiguration,
  cancelConfigurationTest,
  configurationImpact,
  configurationVersions,
  createConfiguration,
  disableConfiguration,
  getConfiguration,
  getConfigurationTest,
  importLegacyConfiguration,
  listConfigurations,
  saveConfiguration,
  startConfigurationTest,
} from '#/api/system/ai-configuration';

import {
  fromConfiguration,
  newEditor,
  newKey,
  pastedKeys,
  toDraft,
} from './form';

const access = useAccessStore();
const can = (action: string) =>
  access.accessCodes.includes(`ai:config:${action}`) ||
  (['add', 'edit', 'list', 'query', 'test'].includes(action) &&
    access.accessCodes.includes(`ai:model:${action}`));
const page = ref<ConfigurationPage>({
  legacyModels: [],
  records: [],
  total: 0,
  pageNum: 1,
  pageSize: 10,
});
const query = reactive({
  name: '',
  providerCode: '',
  environment: '',
  status: '',
  pageNum: 1,
  pageSize: 10,
});
const loading = ref(false);
const failed = ref(false);
const busy = ref(false);
const confirmedCosts = ref(false);
const visible = ref(false);
const current = ref<AiConfiguration>();
const editorLocked = computed(
  () =>
    busy.value ||
    current.value?.status === 'ARCHIVED' ||
    !(current.value ? can('edit') : can('add')),
);
const editor = reactive(newEditor());
const jsonObjectModels = ref<string[]>([]);
const modelOptions = computed(() => [
  ...new Set([...editor.modelCodes, ...jsonObjectModels.value]),
]);
const advanced = ref<string[]>([]);
const paste = ref('');
const test = ref<ConfigurationTest>();
const testVisible = ref(false);
const impact = ref<ApplicationImpact[]>([]);
const impactVisible = ref(false);
const versions = ref<ConfigurationVersion[]>([]);
const versionsVisible = ref(false);
const legacyVisible = ref(false);
const legacyRows = ref<
  { id: string; modelCode: string; providerCode: string }[]
>([]);
let timer: ReturnType<typeof setTimeout> | undefined;
let alive = true;
let polling = false;
const modelResults = computed(() => {
  const results = new Map<string, { model: string; usableKeys: number }>();
  for (const pair of test.value?.pairs ?? []) {
    const summary = results.get(pair.modelRef) ?? {
      model: pair.modelCode,
      usableKeys: 0,
    };
    if (pair.status === 'SUCCESS') summary.usableKeys++;
    results.set(pair.modelRef, summary);
  }
  return [...results.values()];
});
const statusText = {
  ACTIVE: '已启用',
  ARCHIVED: '已归档',
  DISABLED: '已停用',
  DRAFT: '草稿',
};
const pairText = {
  SUCCESS: '通过',
  FAILED: '未通过',
  PENDING: '未测试',
  RUNNING: '测试中',
};
const errorText: Record<string, string> = {
  AUTH_FAILED: '凭据认证失败',
  RATE_LIMITED: '供应商限流',
  PROVIDER_UNAVAILABLE: '供应商不可用',
  NETWORK_ERROR: '网络失败',
  DEADLINE_EXCEEDED: '超时',
  CREDENTIAL_UNAVAILABLE: '凭据不可用',
  INVALID_INPUT: '参数或额度不满足',
  INVALID_RESPONSE: '响应不完整或不匹配',
  CONTENT_REJECTED: '供应商拒绝',
  CANCELLED: '已取消',
  OUTPUT_LIMIT: '输出达到限制',
};

async function load() {
  if (!can('list')) return;
  loading.value = true;
  failed.value = false;
  try {
    page.value = await listConfigurations(query);
    jsonObjectModels.value = page.value.jsonObjectModels ?? [];
  } catch {
    failed.value = true;
    page.value.records = [];
  } finally {
    loading.value = false;
  }
}
function create() {
  confirmedCosts.value = false;
  current.value = undefined;
  Object.assign(editor, newEditor());
  paste.value = '';
  advanced.value = [];
  visible.value = true;
}
async function edit(row: ConfigurationRow) {
  confirmedCosts.value = false;
  try {
    current.value = await getConfiguration(row.id);
    Object.assign(editor, fromConfiguration(current.value));
    paste.value = '';
    visible.value = true;
  } catch {
    /* interceptor */
  }
}
async function save(): Promise<AiConfiguration | undefined> {
  if (busy.value) return;
  busy.value = true;
  try {
    const data = toDraft(editor, current.value);
    const saved = current.value
      ? await saveConfiguration(current.value.id, data)
      : await createConfiguration(data);
    current.value = saved;
    Object.assign(editor, fromConfiguration(saved));
    paste.value = '';
    ElMessage.success('草稿已保存');
    await load();
    return saved;
  } catch {
    return undefined;
  } finally {
    busy.value = false;
  }
}
function bulkAdd() {
  const added = pastedKeys(paste.value, editor.keys.length);
  if (editor.keys.length + added.length > 16) {
    ElMessage.warning('最多16个Key');
    return;
  }
  editor.keys.push(...added);
  paste.value = '';
}
async function poll() {
  clearTimeout(timer);
  if (!test.value || !alive || polling) return;
  polling = true;
  const expected = test.value.id;
  try {
    const latest = await getConfigurationTest(test.value.configId, expected);
    if (!alive || test.value?.id !== expected) return;
    test.value = latest;
    if (['QUEUED', 'RUNNING'].includes(test.value.status) && alive)
      timer = setTimeout(poll, 1000);
    else {
      if (current.value?.id === test.value.configId)
        current.value = await getConfiguration(test.value.configId);
      await load();
    }
  } catch {
    ElMessage.error('测试进度读取失败，请重新查询批次');
  } finally {
    polling = false;
    if (alive && test.value?.id !== expected) timer = setTimeout(poll, 0);
  }
}
async function run(saved: AiConfiguration) {
  const count = saved.draft.models.length * saved.draft.keys.length;
  if (!count) {
    ElMessage.warning('先添加至少一个模型和Key');
    return;
  }
  if (!confirmedCosts.value) {
    ElMessage.warning('请先确认测试可能产生模型费用');
    return;
  }
  busy.value = true;
  try {
    test.value = await startConfigurationTest(saved.id, {
      revision: saved.revision,
      configVersion: saved.draft.configVersion,
      confirmedCosts: true,
    });
    testVisible.value = true;
    clearTimeout(timer);
    await poll();
  } finally {
    busy.value = false;
  }
}
async function testSaved() {
  if (!current.value || !can('test')) return;
  if (
    JSON.stringify(toDraft(editor, current.value)) !==
    JSON.stringify(toDraft(fromConfiguration(current.value), current.value))
  ) {
    ElMessage.warning('请先保存修改，再测试已保存的配置');
    return;
  }
  await run(current.value);
}
async function testRow(row: ConfigurationRow) {
  try {
    await edit(row);
  } catch {
    /* interceptor */
  }
}
async function restoreTest() {
  if (current.value?.latestTestId) {
    test.value = await getConfigurationTest(
      current.value.id,
      current.value.latestTestId,
    );
    testVisible.value = true;
    clearTimeout(timer);
    await poll();
  }
}
async function cancelTest() {
  if (test.value) {
    await cancelConfigurationTest(test.value.configId, test.value.id);
    await poll();
  }
}
async function activate(onlyAvailable: boolean) {
  if (!current.value || busy.value) return;
  if (
    JSON.stringify(toDraft(editor, current.value)) !==
    JSON.stringify(toDraft(fromConfiguration(current.value), current.value))
  ) {
    ElMessage.warning('请先保存当前编辑内容，再启用对应草稿');
    return;
  }
  try {
    await ElMessageBox.confirm(
      onlyAvailable
        ? '仅启用当前草稿验证通过的搭配；失败及未测试搭配保持不可用。'
        : '确认启用当前草稿？所有搭配必须验证通过。',
      '启用配置',
      { type: 'warning' },
    );
  } catch {
    return;
  }
  busy.value = true;
  try {
    current.value = await activateConfiguration(current.value.id, {
      revision: current.value.revision,
      configVersion: current.value.draft.configVersion,
      onlyAvailable,
    });
    ElMessage.success('配置已启用');
    await load();
  } finally {
    busy.value = false;
  }
}
async function showImpact(row: { id: string }) {
  impact.value = await configurationImpact(row.id);
  impactVisible.value = true;
}
async function showVersions(row: { id: string }) {
  versions.value = await configurationVersions(row.id);
  versionsVisible.value = true;
}
async function disable(row: ConfigurationRow) {
  try {
    await ElMessageBox.confirm(
      '紧急停用将阻止所有版本的后续模型尝试。已产生内容不会撤回。',
      '停用配置',
      { type: 'warning' },
    );
  } catch {
    return;
  }
  await disableConfiguration(row.id, row.revision);
  await load();
}
async function archive(row: ConfigurationRow) {
  try {
    await ElMessageBox.confirm(
      '归档会保留历史，存在在线应用引用时将拒绝归档。',
      '归档配置',
      { type: 'warning' },
    );
  } catch {
    return;
  }
  await archiveConfiguration(row.id, row.revision);
  await load();
}
async function openLegacy() {
  const legacyPage = await listConfigurations({ pageNum: 1, pageSize: 100 });
  legacyRows.value = legacyPage.legacyModels;
  legacyVisible.value = true;
}
async function importLegacy(id: string) {
  const imported = await importLegacyConfiguration(id);
  legacyVisible.value = false;
  current.value = imported;
  Object.assign(editor, fromConfiguration(imported));
  visible.value = true;
  await load();
}
function closeEditor() {
  confirmedCosts.value = false;
  editor.keys.forEach((key) => {
    key.apiKey = '';
  });
  paste.value = '';
}
onMounted(load);
onUnmounted(() => {
  alive = false;
  clearTimeout(timer);
  closeEditor();
});
</script>

<template>
  <div class="key-settings-panel">
    <div v-if="!visible" class="space-y-4 p-4">
      <el-alert
        title="草稿保存不调用模型；测试通过后再明确启用。"
        type="info"
        closable
        show-icon
      />
      <el-card>
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span>提供商配置</span>
            <div class="flex gap-2">
              <el-button v-if="can('add')" @click="openLegacy">
                导入原有模型
              </el-button>
              <el-button v-if="can('add')" type="primary" @click="create">
                新建配置
              </el-button>
            </div>
          </div>
        </template>
        <el-form
          inline
          @submit.prevent="
            query.pageNum = 1;
            load();
          "
        >
          <el-form-item label="名称">
            <el-input v-model="query.name" clearable maxlength="100" />
          </el-form-item>
          <el-form-item label="提供商">
            <el-input v-model="query.providerCode" clearable maxlength="64" />
          </el-form-item>
          <el-form-item label="环境">
            <el-input v-model="query.environment" clearable maxlength="32" />
          </el-form-item>
          <el-form-item label="状态">
            <el-select v-model="query.status" clearable class="w-32">
              <el-option
                v-for="(label, value) in statusText"
                :key="value"
                :label="label"
                :value="value"
              />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button
              type="primary"
              @click="
                query.pageNum = 1;
                load();
              "
            >
              查询
            </el-button>
          </el-form-item>
        </el-form>
        <el-alert
          v-if="failed"
          title="加载失败，可重新查询"
          type="error"
          closable
        />
        <el-table v-loading="loading" :data="page.records" row-key="id" stripe>
          <el-table-column prop="name" label="配置名称" min-width="160" />
          <el-table-column prop="providerCode" label="提供商" min-width="120" />
          <el-table-column prop="environment" label="环境" width="110" />
          <el-table-column prop="modelCount" label="草稿模型数" width="110" />
          <el-table-column
            prop="usableKeyCount"
            label="已启用Key数"
            width="120"
          />
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              {{ statusText[row.status as keyof typeof statusText] }}
            </template>
          </el-table-column>
          <el-table-column
            prop="latestTestTime"
            label="最近测试"
            min-width="165"
          />
          <el-table-column label="操作" min-width="350">
            <template #default="{ row }">
              <el-button
                v-if="can('query')"
                link
                type="primary"
                @click="edit(row)"
              >
                {{ row.status === 'ARCHIVED' ? '查看' : '配置' }}
              </el-button>
              <el-button
                v-if="can('test') && row.status !== 'ARCHIVED'"
                link
                @click="testRow(row)"
              >
                测试
              </el-button>
              <el-button v-if="can('query')" link @click="showImpact(row)">
                影响
              </el-button>
              <el-button v-if="can('query')" link @click="showVersions(row)">
                版本
              </el-button>
              <el-button
                v-if="can('enable') && row.status === 'ACTIVE'"
                link
                type="warning"
                @click="disable(row)"
              >
                紧急停用
              </el-button>
              <el-button
                v-if="can('archive') && row.status !== 'ARCHIVED'"
                link
                @click="archive(row)"
              >
                归档
              </el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-pagination
          v-model:current-page="query.pageNum"
          v-model:page-size="query.pageSize"
          class="mt-4"
          :total="Number(page.total)"
          layout="total, prev, pager, next"
          @current-change="load"
        />
      </el-card>
    </div>
    <section v-if="visible" class="configuration-editor">
      <div class="mb-4 flex justify-between">
        <h2>{{ current ? current.name : '新建配置' }}</h2>
        <el-button
          @click="
            visible = false;
            closeEditor();
          "
        >
          返回配置列表
        </el-button>
      </div>
      <el-alert
        v-if="current?.activeVersion"
        :title="`线上版本 ${current.activeVersion}；编辑及测试不会覆盖线上配置。`"
        type="info"
        closable
        class="mb-4"
      />
      <el-form label-position="top" :disabled="editorLocked">
        <div class="grid gap-4 md:grid-cols-3">
          <el-form-item label="配置名称">
            <el-input
              v-model="editor.name"
              maxlength="100"
              placeholder="留空自动生成"
            />
          </el-form-item>
          <el-form-item label="环境">
            <el-input v-model="editor.environment" maxlength="32" />
          </el-form-item>
          <el-form-item label="提供商">
            <el-select
              v-model="editor.providerCode"
              :disabled="editorLocked || !!current"
            >
              <el-option label="OpenRouter" value="openrouter" />
            </el-select>
          </el-form-item>
        </div>
        <el-form-item label="模型（可搜索或手动添加）">
          <el-select
            v-model="editor.modelCodes"
            multiple
            filterable
            allow-create
            default-first-option
            :reserve-keyword="false"
            class="w-full"
            placeholder="输入模型代号后回车"
          >
            <el-option
              v-for="code in modelOptions"
              :key="code"
              :label="code"
              :value="code"
            />
          </el-select>
        </el-form-item>
        <el-form-item
          v-if="editor.modelCodes.length > 0"
          label="允许JSON对象（能力改变后需重新测试）"
        >
          <el-checkbox-group v-model="editor.jsonObjectModels">
            <el-checkbox
              v-for="code in editor.modelCodes"
              :key="code"
              :value="code"
              :disabled="
                editorLocked ||
                (!jsonObjectModels.includes(code) &&
                  !editor.jsonObjectModels.includes(code))
              "
            >
              {{ code }}
            </el-checkbox>
          </el-checkbox-group>
          <p class="mt-1 text-sm text-muted-foreground">
            仅开放服务端已核对的模型。JSON上游流先完整校验，再回传一个对象。
          </p>
        </el-form-item>
        <div class="my-3 flex items-center justify-between">
          <h3>共享Key</h3>
          <el-button
            :disabled="editorLocked || editor.keys.length >= 16"
            @click="editor.keys.push(newKey(editor.keys.length + 1))"
          >
            添加一行
          </el-button>
        </div>
        <div
          v-for="(key, index) in editor.keys"
          :key="key.keyRef ?? index"
          class="mb-3 rounded border p-3"
        >
          <div class="grid gap-3 md:grid-cols-3">
            <el-form-item label="标签">
              <el-input v-model="key.label" maxlength="80" />
            </el-form-item>
            <el-form-item label="来源">
              <el-select v-model="key.mode">
                <el-option label="加密数据库" value="DB" />
                <el-option label="环境变量引用" value="ENV" />
              </el-select>
            </el-form-item>
            <el-form-item
              v-if="key.mode === 'DB'"
              :label="key.keyRef ? '更换Key（留空保留）' : '新Key'"
            >
              <el-input
                v-model="key.apiKey"
                type="password"
                autocomplete="new-password"
                :show-password="false"
                maxlength="8192"
              />
            </el-form-item>
            <el-form-item v-else label="环境变量名">
              <el-input v-model="key.envName" maxlength="128" />
            </el-form-item>
          </div>
          <el-button link type="danger" @click="editor.keys.splice(index, 1)">
            从草稿移除此Key
          </el-button>
        </div>
        <el-form-item label="批量粘贴Key（一行一个）">
          <el-input
            v-model="paste"
            type="password"
            autocomplete="new-password"
            placeholder="粘贴多行后点击加入"
            @paste.prevent="paste = $event.clipboardData?.getData('text') ?? ''"
          />
          <el-button class="mt-2" @click="bulkAdd">加入表单</el-button>
        </el-form-item>
        <el-collapse v-model="advanced">
          <el-collapse-item title="高级设置" name="advanced">
            <el-form-item label="协议">
              <el-input v-model="editor.protocol" disabled />
            </el-form-item>
            <el-form-item label="地址（更换地址请新建配置）">
              <el-input v-model="editor.endpointUrl" disabled />
            </el-form-item>
            <el-form-item label="超时（秒）">
              <el-input-number
                v-model="editor.timeoutSeconds"
                :min="1"
                :max="300"
              />
            </el-form-item>
            <p class="text-sm text-muted-foreground">
              支持官方OpenRouter文本、受控JSON对象及上游流式。其他提供商和工具调用尚未开放。
            </p>
          </el-collapse-item>
        </el-collapse>
      </el-form>
      <div class="mt-4">
        <label v-if="can('test')" class="mb-3 block text-sm">
          <input v-model="confirmedCosts" type="checkbox" />
          我确认主动测试可能产生模型费用
        </label>
        <div class="flex flex-wrap justify-end gap-2">
          <el-button
            v-if="current?.latestTestId && can('test')"
            @click="restoreTest"
          >
            查看测试
          </el-button>
          <el-button
            v-if="
              current?.status !== 'ARCHIVED' &&
              (current ? can('edit') : can('add'))
            "
            :loading="busy"
            @click="save"
          >
            保存草稿
          </el-button>
          <el-button
            v-if="can('test') && current && current.status !== 'ARCHIVED'"
            type="primary"
            :loading="busy"
            @click="testSaved"
          >
            测试已保存配置
          </el-button>
          <el-button
            v-if="current && can('enable') && current.status !== 'ARCHIVED'"
            :disabled="busy"
            @click="activate(false)"
          >
            全部通过后启用
          </el-button>
          <el-button
            v-if="current && can('enable') && current.status !== 'ARCHIVED'"
            type="warning"
            :disabled="busy"
            @click="activate(true)"
          >
            仅启用可用部分
          </el-button>
        </div>
      </div>
    </section>
    <section v-if="testVisible" class="inline-section">
      <h3>逐搭配测试结果</h3>
      <el-button @click="testVisible = false">收起</el-button>
      <div class="mb-3 flex flex-wrap gap-2">
        <el-tag v-for="summary in modelResults" :key="summary.model">
          {{ summary.model }}：{{ summary.usableKeys }} 条通过Key
        </el-tag>
      </div>
      <p v-if="test">
        批次 {{ test.id }} · {{ test.status }} · {{ test.finished }}/{{
          test.total
        }}
      </p>
      <el-table :data="test?.pairs ?? []">
        <el-table-column prop="modelCode" label="模型" min-width="160" />
        <el-table-column prop="keyLabel" label="Key标签" />
        <el-table-column label="结果">
          <template #default="{ row }">
            {{ pairText[row.status as keyof typeof pairText] }}
          </template>
        </el-table-column>
        <el-table-column label="原因" min-width="160">
          <template #default="{ row }">
            {{ errorText[row.errorCode] ?? row.errorCode ?? '—' }}
          </template>
        </el-table-column>
        <el-table-column prop="elapsedMs" label="耗时(ms)" />
      </el-table>
      <div class="mt-4">
        <el-button @click="poll">刷新</el-button>
        <el-button
          v-if="test && ['RUNNING', 'QUEUED'].includes(test.status)"
          type="warning"
          @click="cancelTest"
        >
          取消后续测试
        </el-button>
        <el-button @click="testVisible = false">关闭</el-button>
      </div>
    </section>
    <section v-if="impactVisible" class="inline-section">
      <h3>在线应用影响</h3>
      <el-button @click="impactVisible = false">收起</el-button>
      <el-empty v-if="impact.length === 0" description="无在线应用引用" />
      <el-table v-else :data="impact">
        <el-table-column prop="name" label="应用" />
        <el-table-column prop="appId" label="应用ID" />
        <el-table-column prop="appVersionId" label="版本" />
      </el-table>
    </section>
    <section v-if="versionsVisible" class="inline-section">
      <h3>历史配置版本</h3>
      <el-button @click="versionsVisible = false">收起</el-button>
      <el-table :data="versions">
        <el-table-column prop="configVersion" label="版本" />
        <el-table-column prop="createdAt" label="创建时间" />
        <el-table-column label="状态">
          <template #default="{ row }">
            {{ row.activated ? '已启用过' : '草稿' }}
          </template>
        </el-table-column>
        <el-table-column label="准入搭配">
          <template #default="{ row }">{{ row.admittedPairs.length }}</template>
        </el-table-column>
      </el-table>
    </section>
    <section v-if="legacyVisible" class="inline-section">
      <h3>导入原有模型为未测试草稿</h3>
      <el-button @click="legacyVisible = false">收起</el-button>
      <el-alert
        title="保留旧模型和凭据引用；导入后需重新测试、明确启用。"
        type="info"
        closable
      />
      <el-table :data="legacyRows">
        <el-table-column prop="providerCode" label="提供商" />
        <el-table-column prop="modelCode" label="模型" />
        <el-table-column label="操作">
          <template #default="{ row }">
            <el-button link @click="importLegacy(row.id)">导入</el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>
  </div>
</template>
