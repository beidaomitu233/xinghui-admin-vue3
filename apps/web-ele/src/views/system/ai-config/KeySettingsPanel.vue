<script lang="ts" setup>
import type {
  AiConfiguration,
  ApplicationImpact,
  ConfigurationPage,
  ConfigurationRow,
  ConfigurationTest,
  ConfigurationVersion,
} from '#/api/system/ai-configuration';

import { computed, onUnmounted, reactive, ref, watch } from 'vue';

import { useVbenDrawer } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';

import { ElMessage, ElMessageBox } from 'element-plus';

import { useVbenForm } from '#/adapter/form';
import { useVbenVxeGrid } from '#/adapter/vxe-table';
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

function load() {
  ++refreshRevision;
  return gridApi.query();
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
  const values = await metadataFormApi.getValues();
  if (busy.value) return;
  Object.assign(editor, values);
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

onUnmounted(() => {
  alive = false;
  clearTimeout(timer);
  closeEditor();
});
let listGeneration = 0;
let refreshRevision = 0;
const text = (value: unknown) =>
  typeof value === 'string' ? value.trim() || undefined : undefined;
const queryFilters = (values: Record<string, unknown>) => ({
  name: text(values.name),
  providerCode: text(values.providerCode),
  environment: text(values.environment),
  status: text(values.status),
});
const queryParameters = (
  page: { currentPage: number; pageSize: number },
  sort: { field?: string; order?: null | string },
  values: Record<string, unknown>,
) => ({
  pageNum: page.currentPage,
  pageSize: page.pageSize,
  ...queryFilters(values),
  ...(sort.order === 'asc' || sort.order === 'desc'
    ? { orderBy: sort.field, order: sort.order as 'asc' | 'desc' }
    : {}),
});
type GridQuery = {
  page: { currentPage: number; pageSize: number };
  sort: { field: string; order: 'asc' | 'desc' | null };
};
const [Grid, gridApi] = useVbenVxeGrid<ConfigurationRow>({
  formOptions: {
    showCollapseButton: true,
    collapsedRows: 1,
    handleSubmit: async (values) => {
      gridApi.formApi.setLatestSubmissionValues(values);
      await gridApi.grid.setCurrentPage(1);
      await gridApi.query();
    },
    handleReset: async () => {
      await gridApi.formApi.resetForm();
      gridApi.formApi.setLatestSubmissionValues(
        await gridApi.formApi.getValues(),
      );
      await gridApi.grid.clearSort();
      await gridApi.grid.setCurrentPage(1);
      await gridApi.query();
    },
    schema: [
      ...[
        ['name', '名称'],
        ['providerCode', '提供商'],
        ['environment', '环境'],
      ].map(([fieldName, label]) => ({
        component: 'Input' as const,
        fieldName: fieldName!,
        label,
        componentProps: { clearable: true },
      })),
      {
        component: 'Select',
        fieldName: 'status',
        label: '状态',
        componentProps: {
          clearable: true,
          options: Object.entries(statusText).map(([value, label]) => ({
            value,
            label,
          })),
        },
      },
    ],
  },
  gridOptions: {
    columns: [
      { title: '配置名称', minWidth: 160, field: 'name', sortable: true },
      { title: '提供商', minWidth: 120, field: 'providerCode', sortable: true },
      { title: '环境', width: 110, field: 'environment', sortable: true },
      { title: '草稿模型数', width: 110, field: 'modelCount' },
      { title: '已启用Key数', width: 120, field: 'usableKeyCount' },
      {
        title: '状态',
        width: 90,
        field: 'status',
        sortable: true,
        slots: { default: 'cell5' },
      },
      { title: '最近测试', minWidth: 165, field: 'latestTestTime' },
      { title: '操作', minWidth: 350, slots: { default: 'cell7' } },
    ],
    pagerConfig: { pageSize: 10, pageSizes: [10, 20, 50, 100] },
    sortConfig: { remote: true },
    toolbarConfig: {
      refresh: true,
      refreshOptions: { code: 'query' },
      custom: true,
      search: true,
    },
    proxyConfig: {
      sort: true,
      ajax: {
        query: async (
          { page: pagination, sort }: GridQuery,
          values: Record<string, unknown>,
        ) => {
          const run = ++listGeneration;
          const token = access.accessToken;
          if (!can('list')) return { items: [], total: 0 };
          loading.value = true;
          failed.value = false;
          try {
            let observedRefresh = refreshRevision;
            let parameters = queryParameters(pagination, sort, values);
            let value:
              | Awaited<ReturnType<typeof listConfigurations>>
              | undefined;
            for (;;) {
              let failure: unknown;
              try {
                value = await listConfigurations(parameters);
              } catch (error_) {
                failure = error_;
              }
              if (run !== listGeneration)
                return {
                  items: page.value.records,
                  total: Number(page.value.total),
                };
              // 本仓 Vxe 在 loading 中忽略新的 query；返回前以原生页码、表头和最近提交值接续。
              if (gridApi.grid.getCurrentPage) {
                const submitted = gridApi.formApi.getLatestSubmissionValues();
                if (
                  JSON.stringify(queryFilters(submitted)) !==
                  JSON.stringify(queryFilters(parameters))
                )
                  await gridApi.grid.setCurrentPage(1);
                const current = queryParameters(
                  {
                    currentPage: gridApi.grid.getCurrentPage(),
                    pageSize: gridApi.grid.getPageSize(),
                  },
                  gridApi.grid.getSortColumns()[0] ?? {},
                  submitted,
                );
                if (
                  JSON.stringify(current) !== JSON.stringify(parameters) ||
                  observedRefresh !== refreshRevision
                ) {
                  parameters = current;
                  observedRefresh = refreshRevision;
                  continue;
                }
              }
              if (failure) throw failure;
              if (!value) throw new Error('列表未返回结果');
              break;
            }

            if (run !== listGeneration || token !== access.accessToken)
              return {
                items: page.value.records,
                total: Number(page.value.total),
              };
            const total = Number(value.total);
            if (!Number.isSafeInteger(total) || total < 0)
              throw new Error('Invalid total');
            page.value = value;
            jsonObjectModels.value = value.jsonObjectModels ?? [];
            return { items: value.records, total };
          } catch (error) {
            if (run === listGeneration) {
              failed.value = true;
              page.value.records = [];
              page.value.total = 0;
            }
            throw error;
          } finally {
            if (run === listGeneration) loading.value = false;
          }
        },
      },
    },
  },
});
const [PairsGrid, pairsGridApi] = useVbenVxeGrid<
  ConfigurationTest['pairs'][number]
>({
  gridOptions: {
    columns: [
      { title: '模型', minWidth: 160, field: 'modelCode', sortable: true },
      { title: 'Key标签', field: 'keyLabel' },
      { title: '结果', slots: { default: 'cell2' } },
      { title: '原因', minWidth: 160, slots: { default: 'cell3' } },
      { title: '耗时(ms)', field: 'elapsedMs' },
    ],
    pagerConfig: { enabled: false },
    proxyConfig: { enabled: false },
    toolbarConfig: { custom: true },
  },
});
watch(
  () => test.value?.pairs ?? [],
  (data) => pairsGridApi.setGridOptions({ data }),
  { immediate: true },
);
const [ImpactGrid, impactGridApi] = useVbenVxeGrid<ApplicationImpact>({
  gridOptions: {
    columns: [
      { title: '应用', field: 'name', sortable: true },
      { title: '应用ID', field: 'appId' },
      { title: '版本', field: 'appVersionId' },
    ],
    pagerConfig: { enabled: false },
    proxyConfig: { enabled: false },
    toolbarConfig: { custom: true },
  },
});
watch(
  () => impact.value,
  (data) => impactGridApi.setGridOptions({ data }),
  { immediate: true },
);
const [VersionsGrid, versionsGridApi] = useVbenVxeGrid<ConfigurationVersion>({
  gridOptions: {
    columns: [
      { title: '版本', field: 'configVersion' },
      { title: '创建时间', field: 'createdAt', sortable: true },
      { title: '状态', slots: { default: 'cell2' } },
      { title: '准入搭配', slots: { default: 'cell3' } },
    ],
    pagerConfig: { enabled: false },
    proxyConfig: { enabled: false },
    toolbarConfig: { custom: true },
  },
});
watch(
  () => versions.value,
  (data) => versionsGridApi.setGridOptions({ data }),
  { immediate: true },
);
const [LegacyGrid, legacyGridApi] = useVbenVxeGrid<
  ConfigurationPage['legacyModels'][number]
>({
  gridOptions: {
    columns: [
      { title: '提供商', field: 'providerCode', sortable: true },
      { title: '模型', field: 'modelCode', sortable: true },
      { title: '操作', slots: { default: 'cell2' } },
    ],
    pagerConfig: { enabled: false },
    proxyConfig: { enabled: false },
    toolbarConfig: { custom: true },
  },
});
watch(
  () => legacyRows.value,
  (data) => legacyGridApi.setGridOptions({ data }),
  { immediate: true },
);
const metadataValues = () => ({
  name: editor.name,
  environment: editor.environment,
  providerCode: editor.providerCode,
  modelCodes: editor.modelCodes,
});
const [MetadataForm, metadataFormApi] = useVbenForm({
  showDefaultActions: false,
  layout: 'vertical',
  wrapperClass: 'grid-cols-1 md:grid-cols-2',
  commonConfig: {
    componentProps: () => ({ class: 'w-full', disabled: editorLocked.value }),
  },
  handleValuesChange: (values) => {
    Object.assign(editor, values);
  },
  schema: [
    {
      component: 'Input',
      fieldName: 'name',
      label: '配置名称',
      componentProps: { maxlength: 100, placeholder: '留空自动生成' },
    },
    {
      component: 'Input',
      fieldName: 'environment',
      label: '环境',
      componentProps: { maxlength: 32 },
    },
    {
      component: 'Select',
      fieldName: 'providerCode',
      label: '提供商',
      componentProps: () => ({
        disabled: editorLocked.value || !!current.value,
        options: [{ label: 'OpenRouter', value: 'openrouter' }],
      }),
    },
    {
      component: 'Select',
      fieldName: 'modelCodes',
      label: '模型（可搜索或手动添加）',
      componentProps: () => ({
        multiple: true,
        filterable: true,
        allowCreate: true,
        defaultFirstOption: true,
        reserveKeyword: false,
        options: modelOptions.value.map((value) => ({ value, label: value })),
        placeholder: '输入模型代号后回车',
      }),
    },
  ],
});
watch(
  () => JSON.stringify(metadataValues()),
  () => {
    if (visible.value) void metadataFormApi.setValues(metadataValues());
  },
);
const [EditorDrawer, editorDrawerApi] = useVbenDrawer({
  footer: false,
  closeOnClickModal: false,
  onBeforeClose: () => {
    if (busy.value) return false;
    closeEditor();
    visible.value = false;
    return true;
  },
});
watch(visible, (open) => {
  editorDrawerApi.setState({ isOpen: open });
  if (open) void metadataFormApi.setValues(metadataValues());
});
onUnmounted(() => {
  ++listGeneration;
});
</script>

<template>
  <div class="key-settings-panel">
    <div class="space-y-4">
      <el-alert
        title="草稿保存不调用模型；测试通过后再明确启用。"
        type="info"
        closable
        show-icon
      />

      <el-alert
        v-if="failed"
        title="加载失败，可重新查询"
        type="error"
        closable
      />
      <Grid>
        <template #toolbar-actions>
          <el-button v-if="can('add')" @click="openLegacy">
            导入原有模型
          </el-button>
          <el-button v-if="can('add')" type="primary" @click="create">
            新建配置
          </el-button>
        </template>
        <template #cell5="{ row }">
          {{ statusText[row.status as keyof typeof statusText] }}
        </template>
        <template #cell7="{ row }">
          <el-button v-if="can('query')" link type="primary" @click="edit(row)">
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
      </Grid>
    </div>
    <EditorDrawer
      :title="current ? current.name : '新建配置'"
      class="w-full max-w-[1000px]"
    >
      <el-alert
        v-if="current?.activeVersion"
        :title="`线上版本 ${current.activeVersion}；编辑及测试不会覆盖线上配置。`"
        type="info"
        closable
        class="mb-4"
      />
      <MetadataForm />
      <el-form label-position="top" :disabled="editorLocked">
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
        <el-checkbox v-if="can('test')" v-model="confirmedCosts" class="mb-3">
          我确认主动测试可能产生模型费用
        </el-checkbox>
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
    </EditorDrawer>
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
      <PairsGrid>
        <template #cell2="{ row }">
          {{ pairText[row.status as keyof typeof pairText] }}
        </template>
        <template #cell3="{ row }">
          {{
            row.errorCode ? (errorText[row.errorCode] ?? row.errorCode) : '—'
          }}
        </template>
      </PairsGrid>
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
      <ImpactGrid />
    </section>
    <section v-if="versionsVisible" class="inline-section">
      <h3>历史配置版本</h3>
      <el-button @click="versionsVisible = false">收起</el-button>
      <VersionsGrid>
        <template #cell2="{ row }">
          {{ row.activated ? '已启用过' : '草稿' }}
        </template>
        <template #cell3="{ row }">{{ row.admittedPairs.length }}</template>
      </VersionsGrid>
    </section>
    <section v-if="legacyVisible" class="inline-section">
      <h3>导入原有模型为未测试草稿</h3>
      <el-button @click="legacyVisible = false">收起</el-button>
      <el-alert
        title="保留旧模型和凭据引用；导入后需重新测试、明确启用。"
        type="info"
        closable
      />
      <LegacyGrid>
        <template #cell2="{ row }">
          <el-button link @click="importLegacy(row.id)">导入</el-button>
        </template>
      </LegacyGrid>
    </section>
  </div>
</template>
