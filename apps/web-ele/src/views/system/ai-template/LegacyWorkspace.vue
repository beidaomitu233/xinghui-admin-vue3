<script setup lang="ts">
import type {
  Binding,
  JsonValue,
  Kind,
  LegacyScene,
  ResourceDefinition,
  Summary,
  TemplateDefinition,
  TestResult,
  Variable,
  Version,
  View,
} from '#/api/system/ai-template';

import {
  computed,
  onBeforeUnmount,
  ref,
  shallowReactive,
  shallowRef,
  watch,
} from 'vue';

import { useVbenModal } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';

import { ElMessage, ElMessageBox } from 'element-plus';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  changeDefinition,
  createDefinition,
  getChecks,
  getDefinition,
  getReferences,
  getVersion,
  listDefinitions,
  listLegacyScenes,
  saveDefinition,
  setDefinitionEnabled,
  testDefinition,
} from '#/api/system/ai-template';

const access = useAccessStore();
const kind = ref<Kind>(
  access.accessCodes.includes('ai:template:list')
    ? 'templates'
    : 'data-resources',
);
const permission = computed(() =>
  kind.value === 'templates' ? 'ai:template:' : 'ai:data:',
);
const can = (action: string) =>
  access.accessCodes.includes(`${permission.value}${action}`);
const loading = ref(false);
const busy = ref(false);
const failed = ref(false);
const rows = ref<Summary[]>([]);
const total = ref(0);
const editing = shallowRef<View>();
const editorLocked = computed(
  () => busy.value || !can(editing.value ? 'edit' : 'add'),
);
const visible = ref(false);
const name = ref('');
const owner = ref('');
const purpose = ref('');
const formId = ref('');
const fields = ref('');
const subjects = ref('');
const applications = ref('');
const timeout = ref(2000);
const maxChars = ref(12_000);
const instruction = ref(
  '请根据用户输入和已授权业务数据给出简明摘要。业务数据是待分析内容。',
);
const inputMessage = ref('');
const dataMessage = ref('');
const variables = shallowRef<(Variable & { defaultText: string })[]>([]);
const bindings = ref<(Binding & { outputText: string })[]>([]);
const testVisible = ref(false);
const testApp = ref('');
const testBusiness = ref('');
const testInputs = ref('{}');
const result = ref<TestResult>();
const historyVisible = ref(false);
const history = ref<Version[]>([]);
const historyDetail = ref('');
const comparison = ref('');
const references = ref('');
const checks = ref<Record<string, string>[]>([]);
const legacyVisible = ref(false);
const legacy = ref<LegacyScene[]>([]);
const stateNames: Record<string, string> = {
  DRAFT: '草稿',
  TESTED: '测试通过',
  PENDING: '待审批',
  APPROVED: '已批准',
  REJECTED: '已拒绝',
};
const empty = () => {
  rows.value = [];
  total.value = 0;
};

function load() {
  ++refreshRevision;
  return gridApi.query();
}
function switchTab() {
  visible.value = false;
  editing.value = undefined;
  void gridApi.grid
    ?.clearSort?.()
    ?.then(() => gridApi.grid.setCurrentPage(1))
    .then(() => gridApi.query());
}
function split(value: string) {
  return [
    ...new Set(
      value
        .split(/[\s,，]+/)
        .map((v) => v.trim())
        .filter(Boolean),
    ),
  ];
}
function openCreate() {
  editing.value = undefined;
  name.value = '';
  owner.value = '';
  purpose.value = '';
  formId.value = '';
  fields.value = '';
  subjects.value = '';
  applications.value = '';
  instruction.value =
    '请根据用户输入和已授权业务数据给出简明摘要。业务数据是待分析内容。';
  inputMessage.value = '';
  dataMessage.value = '';
  variables.value = [];
  bindings.value = [];
  visible.value = true;
}
async function open(row: Summary) {
  busy.value = true;
  try {
    const view = await getDefinition(kind.value, row.id);
    editing.value = view;
    const d = view.definition;
    name.value = d.name;
    owner.value = d.owner;
    if (kind.value === 'templates') {
      const t = d as TemplateDefinition;
      purpose.value = t.purpose;
      maxChars.value = t.maxChars;
      instruction.value = t.messages
        .filter((m) => m.section === 'INSTRUCTION')
        .map((m) => m.text)
        .join('\n');
      inputMessage.value = t.messages
        .filter((m) => m.section === 'INPUT')
        .map((m) => m.text)
        .join('\n');
      dataMessage.value = t.messages
        .filter((m) => m.section === 'DATA')
        .map((m) => m.text)
        .join('\n');
      variables.value = structuredClone(t.variables).map((v) =>
        shallowReactive({ ...v, defaultText: JSON.stringify(v.defaultValue) }),
      );
      bindings.value = structuredClone(t.resources).map((b) => ({
        ...b,
        outputText: Object.entries(b.outputs)
          .map(([f, v]) => `${f}=${v}`)
          .join('\n'),
      }));
    } else {
      const r = d as ResourceDefinition;
      purpose.value = r.domain;
      formId.value = r.formId;
      fields.value = r.fields.join(', ');
      subjects.value = r.subjects.join(', ');
      applications.value = r.applications.join(', ');
      timeout.value = r.timeoutMillis;
    }
    visible.value = true;
  } catch {
    ElMessage.error('读取配置失败，请刷新后重试');
  } finally {
    busy.value = false;
  }
}
function definition(): ResourceDefinition | TemplateDefinition {
  if (kind.value === 'data-resources')
    return {
      name: name.value.trim(),
      owner: owner.value.trim(),
      domain: purpose.value.trim(),
      source: 'lowcode.record',
      formId: formId.value.trim(),
      fields: split(fields.value),
      subjects: split(subjects.value),
      applications: split(applications.value),
      timeoutMillis: timeout.value,
    };
  return {
    name: name.value.trim(),
    owner: owner.value.trim(),
    purpose: purpose.value.trim(),
    maxChars: maxChars.value,
    messages: [
      { section: 'INSTRUCTION', text: instruction.value },
      { section: 'INPUT', text: inputMessage.value },
      { section: 'DATA', text: dataMessage.value },
    ].filter((m) => m.text.trim()) as TemplateDefinition['messages'],
    variables: variables.value.map(({ defaultText, ...v }) => ({
      ...v,
      defaultValue: v.hasDefault
        ? (JSON.parse(defaultText || 'null') as JsonValue)
        : null,
    })),
    resources: bindings.value.map(({ outputText, ...b }) => ({
      ...b,
      outputs: Object.fromEntries(
        outputText
          .split('\n')
          .filter(Boolean)
          .map((line) => {
            const parts = line.split('=');
            if (parts.length !== 2 || !parts[0]?.trim() || !parts[1]?.trim())
              throw new Error('字段映射格式应为 字段=变量');
            return [parts[0].trim(), parts[1].trim()];
          }),
      ),
    })),
  };
}
async function save() {
  busy.value = true;
  try {
    let d: ResourceDefinition | TemplateDefinition;
    try {
      d = definition();
    } catch {
      ElMessage.error('请检查默认值JSON与字段映射格式');
      return;
    }
    if (!d.name || !d.owner) {
      ElMessage.warning('请填写名称和负责人');
      return;
    }
    if (editing.value)
      editing.value = await saveDefinition(
        kind.value,
        editing.value.id,
        editing.value.revision,
        d,
      );
    else await createDefinition(kind.value, d);
    visible.value = false;
    ElMessage.success('草稿已保存');
    await load();
  } catch {
    ElMessage.error('保存失败，草稿输入已保留');
  } finally {
    busy.value = false;
  }
}
async function action(
  row: Summary,
  action: 'approval' | 'publish' | 'submit',
  approved?: boolean,
) {
  const confirmationMessage = {
    approval: approved
      ? '批准当前配置并生成不可变资源版本？'
      : '拒绝当前资源配置？',
    publish: '发布当前模板？已绑定应用保持原版本，须由应用显式升级。',
    submit: '提交当前已测试配置审批？',
  }[action];
  if (!(await confirm(confirmationMessage))) return;
  busy.value = true;
  try {
    await changeDefinition(kind.value, row.id, action, row.revision, approved);
    ElMessage.success('操作成功');
    await load();
  } catch {
    ElMessage.error('操作失败，请刷新配置后重试');
  } finally {
    busy.value = false;
  }
}
async function toggle(row: Summary) {
  busy.value = true;
  try {
    const detail = await getDefinition(kind.value, row.id);
    const groups = await Promise.all(
      detail.versions.map((v) => getReferences(kind.value, row.id, v.id)),
    );
    const impacted = [...new Set(groups.flat().map((r) => r.name))];
    if (
      !(await confirm(
        row.enabled
          ? `停用后将阻止后续请求。当前引用应用：${impacted.join('、') || '暂无'}。确认继续？`
          : '重新启用已发布版本？',
      ))
    )
      return;
    await setDefinitionEnabled(kind.value, row.id, row.revision, !row.enabled);
    await load();
  } catch {
    ElMessage.error('无法完成启停或核对引用，请刷新后重试');
  } finally {
    busy.value = false;
  }
}
async function confirm(message: string) {
  try {
    await ElMessageBox.confirm(message, '确认操作');
    return true;
  } catch {
    return false;
  }
}
async function openTest(row: Summary) {
  busy.value = true;
  try {
    editing.value = await getDefinition(kind.value, row.id);
    result.value = undefined;
    testVisible.value = true;
  } catch {
    ElMessage.error('读取测试配置失败，请刷新后重试');
  } finally {
    busy.value = false;
  }
}
async function test(preview: boolean) {
  if (!editing.value) return;
  let inputs: Record<string, JsonValue>;
  try {
    const parsed: unknown = JSON.parse(testInputs.value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error('测试输入须为JSON对象');
    inputs = parsed as Record<string, JsonValue>;
  } catch {
    ElMessage.warning('测试输入须为JSON对象');
    return;
  }
  busy.value = true;
  result.value = undefined;
  try {
    result.value = await testDefinition(
      kind.value,
      editing.value.id,
      {
        revision: editing.value.revision,
        appId: testApp.value.trim(),
        businessRef: testBusiness.value.trim(),
        inputs,
      },
      preview,
    );
    editing.value = await getDefinition(kind.value, editing.value.id);
    await load();
  } catch {
    ElMessage.error('预览或测试失败，请核对权限、版本和输入');
  } finally {
    busy.value = false;
  }
}
async function openHistory(row: Summary) {
  busy.value = true;
  try {
    editing.value = await getDefinition(kind.value, row.id);
    history.value = editing.value.versions;
    historyDetail.value = '';
    comparison.value = '';
    references.value = '';
    checks.value = [];
    if (kind.value === 'data-resources') checks.value = await getChecks(row.id);
    historyVisible.value = true;
  } catch {
    ElMessage.error('读取版本或审批证据失败，请重试');
  } finally {
    busy.value = false;
  }
}
async function inspect(version: Version, compare = false) {
  if (!editing.value) return;
  busy.value = true;
  try {
    const exact = await getVersion(kind.value, editing.value.id, version.id);
    const text = JSON.stringify(exact.definition, null, 2);
    if (compare) comparison.value = text;
    else historyDetail.value = text;
  } catch {
    ElMessage.error('读取精确版本失败，请重试');
  } finally {
    busy.value = false;
  }
}
async function inspectReferences(version: Version) {
  if (!editing.value) return;
  busy.value = true;
  references.value = '';
  try {
    const refs = await getReferences(kind.value, editing.value.id, version.id);
    references.value =
      refs.length > 0
        ? refs
            .map((r) => `${r.name}（应用 ${r.appId}，版本 ${r.appVersionId}）`)
            .join('\n')
        : '此版本暂无应用引用';
  } catch {
    ElMessage.error('引用服务不可用，不能判断为无引用');
  } finally {
    busy.value = false;
  }
}
function loadLegacy() {
  legacyVisible.value = true;
}
function addVariable() {
  variables.value = [
    ...variables.value,
    shallowReactive({
      name: '',
      type: 'STRING',
      required: true,
      hasDefault: false,
      defaultValue: null,
      maxChars: 2000,
      sensitive: false,
      truncate: false,
      defaultText: '',
    }),
  ];
}
function addBinding() {
  bindings.value.push({
    name: '',
    resourceId: '',
    resourceVersionId: '',
    required: true,
    omitOnMissing: false,
    parameters: {
      formId: { source: 'BUSINESS_REF', key: 'formId' },
      recordId: { source: 'BUSINESS_REF', key: 'recordId' },
    },
    outputs: {},
    outputText: '',
  });
}

const queryParameters = (
  page: { currentPage: number; pageSize: number },
  sort: { field?: string; order?: null | string },
) => ({
  pageNum: page.currentPage,
  pageSize: page.pageSize,
  ...(sort.order === 'asc' || sort.order === 'desc'
    ? { orderBy: sort.field, order: sort.order as 'asc' | 'desc' }
    : {}),
});
let listGeneration = 0;
let refreshRevision = 0;
let legacyGeneration = 0;
const legacyTotal = ref(0);
type GridQuery = {
  page: { currentPage: number; pageSize: number };
  sort: { field: string; order: 'asc' | 'desc' | null };
};
const [Grid, gridApi] = useVbenVxeGrid<Summary>({
  gridOptions: {
    columns: [
      { title: '名称', minWidth: 150, field: 'name', sortable: true },
      { title: 'ID', minWidth: 170, field: 'id' },
      {
        title: '启用',
        width: 80,
        field: 'enabled',
        sortable: true,
        slots: { default: 'cell2' },
      },
      {
        title: '审批状态',
        field: 'state',
        width: 110,
        visible: kind.value === 'data-resources',
        slots: { default: 'cell3' },
      },
      { title: '修订', width: 70, field: 'revision', sortable: true },
      {
        title: '更新时间',
        minWidth: 160,
        field: 'update_time',
        sortable: true,
      },
      { title: '操作', minWidth: 380, slots: { default: 'cell6' } },
    ],
    pagerConfig: { pageSize: 20, pageSizes: [10, 20, 50, 100] },
    sortConfig: { remote: true },
    toolbarConfig: {
      refresh: true,
      refreshOptions: { code: 'query' },
      custom: true,
    },
    proxyConfig: {
      sort: true,
      ajax: {
        query: async ({ page, sort }: GridQuery) => {
          const run = ++listGeneration;
          const token = access.accessToken;
          const resource = kind.value;
          if (!can('list')) return { items: [], total: 0 };
          loading.value = true;
          failed.value = false;
          try {
            let observedRefresh = refreshRevision;
            let parameters = queryParameters(page, sort);
            let value: Awaited<ReturnType<typeof listDefinitions>> | undefined;
            for (;;) {
              let failure: unknown;
              try {
                value = await listDefinitions(
                  kind.value,
                  parameters.pageNum,
                  parameters.pageSize,
                  parameters,
                );
              } catch (error_) {
                failure = error_;
              }
              if (run !== listGeneration)
                return { items: rows.value, total: total.value };
              const current = queryParameters(
                {
                  currentPage: gridApi.grid.getCurrentPage(),
                  pageSize: gridApi.grid.getPageSize(),
                },
                gridApi.grid.getSortColumns()[0] ?? {},
              );
              if (
                JSON.stringify(current) !== JSON.stringify(parameters) ||
                observedRefresh !== refreshRevision
              ) {
                parameters = current;
                observedRefresh = refreshRevision;
                continue;
              }
              if (failure) throw failure;
              if (!value) throw new Error('列表未返回结果');
              break;
            }
            if (
              run !== listGeneration ||
              token !== access.accessToken ||
              resource !== kind.value
            )
              return { items: rows.value, total: total.value };
            const count = Number(value.total);
            if (!Number.isSafeInteger(count) || count < 0)
              throw new Error('Invalid total');
            rows.value = value.records;
            total.value = count;
            return { items: value.records, total: count };
          } catch (error) {
            if (run === listGeneration) {
              failed.value = true;
              empty();
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
const [LegacyGrid, legacyGridApi] = useVbenVxeGrid<LegacyScene>({
  gridOptions: {
    columns: [
      { title: '旧场景ID', minWidth: 170, field: 'scene_id' },
      { title: '应用标识', field: 'app_key', sortable: true },
      { title: '场景标识', field: 'scene_key', sortable: true },
      { title: '原发布模型ID', minWidth: 170, field: 'published_model_id' },
      {
        title: '当前快照修订',
        width: 120,
        field: 'published_revision',
        sortable: true,
      },
    ],
    pagerConfig: { pageSize: 20, pageSizes: [10, 20, 50, 100] },
    sortConfig: { remote: true },
    toolbarConfig: {
      refresh: true,
      refreshOptions: { code: 'query' },
      custom: true,
    },
    proxyConfig: {
      sort: true,
      ajax: {
        query: async ({ page, sort }: GridQuery) => {
          const run = ++legacyGeneration;
          const token = access.accessToken;
          const resource = kind.value;
          try {
            let parameters = queryParameters(page, sort);
            let value: Awaited<ReturnType<typeof listLegacyScenes>> | undefined;
            for (;;) {
              let failure: unknown;
              try {
                value = await listLegacyScenes(
                  parameters.pageNum,
                  parameters.pageSize,
                  parameters,
                );
              } catch (error_) {
                failure = error_;
              }
              if (run !== legacyGeneration)
                return { items: legacy.value, total: legacyTotal.value };
              const current = queryParameters(
                {
                  currentPage: legacyGridApi.grid.getCurrentPage(),
                  pageSize: legacyGridApi.grid.getPageSize(),
                },
                legacyGridApi.grid.getSortColumns()[0] ?? {},
              );
              if (JSON.stringify(current) !== JSON.stringify(parameters)) {
                parameters = current;
                continue;
              }
              if (failure) throw failure;
              if (!value) throw new Error('列表未返回结果');
              break;
            }
            if (
              run !== legacyGeneration ||
              token !== access.accessToken ||
              resource !== kind.value
            )
              return { items: legacy.value, total: legacyTotal.value };
            const count = Number(value.total);
            if (!Number.isSafeInteger(count) || count < 0)
              throw new Error('Invalid total');
            legacy.value = value.records;
            legacyTotal.value = count;
            return { items: value.records, total: count };
          } catch (error) {
            if (run === legacyGeneration) {
              legacy.value = [];
              legacyTotal.value = 0;
            }
            throw error;
          }
        },
      },
    },
  },
});
const [HistoryGrid, historyGridApi] = useVbenVxeGrid<Version>({
  gridOptions: {
    columns: [
      { title: '版本', width: 70, field: 'version_no', sortable: true },
      { title: '精确版本ID', minWidth: 170, field: 'id' },
      {
        title: '发布时间',
        minWidth: 160,
        field: 'create_time',
        sortable: true,
      },
      { title: '操作', width: 200, slots: { default: 'cell3' } },
    ],
    pagerConfig: { enabled: false },
    proxyConfig: { enabled: false },
    toolbarConfig: { custom: true },
  },
});
watch(
  () => history.value,
  (data) => historyGridApi.setGridOptions({ data }),
  { immediate: true },
);
const [ChecksGrid, checksGridApi] = useVbenVxeGrid<Record<string, string>>({
  gridOptions: {
    columns: [
      { title: '动作', field: 'action', sortable: true },
      { title: '结果', field: 'outcome', sortable: true },
      { title: '操作者', field: 'subject_id' },
      { title: '时间', field: 'create_time', sortable: true },
    ],
    pagerConfig: { enabled: false },
    proxyConfig: { enabled: false },
    toolbarConfig: { custom: true },
  },
});
watch(
  () => checks.value,
  (data) => checksGridApi.setGridOptions({ data }),
  { immediate: true },
);
onBeforeUnmount(() => {
  ++listGeneration;
  ++legacyGeneration;
});
watch(kind, () => {
  ++listGeneration;
  empty();
  gridApi.grid?.loadData?.([]);
  if (kind.value === 'data-resources') void gridApi.grid?.showColumn?.('state');
  else void gridApi.grid?.hideColumn?.('state');
});
const [EditModal, editModalApi] = useVbenModal({
  footer: true,
  onBeforeClose: () => !busy.value,
  onOpenChange: (open) => {
    visible.value = open;
  },
});
watch(visible, (open) => editModalApi.setState({ isOpen: open }));
const [LegacyModal, legacyModalApi] = useVbenModal({
  footer: false,
  onBeforeClose: () => !busy.value,
  onOpenChange: (open) => {
    legacyVisible.value = open;
  },
});
watch(legacyVisible, (open) => legacyModalApi.setState({ isOpen: open }));
const [TestModal, testModalApi] = useVbenModal({
  footer: false,
  onBeforeClose: () => !busy.value,
  onOpenChange: (open) => {
    testVisible.value = open;
  },
});
watch(testVisible, (open) => testModalApi.setState({ isOpen: open }));
const [HistoryModal, historyModalApi] = useVbenModal({
  footer: false,
  onBeforeClose: () => !busy.value,
  onOpenChange: (open) => {
    historyVisible.value = open;
  },
});
watch(historyVisible, (open) => historyModalApi.setState({ isOpen: open }));
watch(
  () => [access.accessToken, ...access.accessCodes],
  () => {
    ++listGeneration;
    ++legacyGeneration;
    empty();
    legacy.value = [];
    gridApi.grid?.loadData?.([]);
    legacyGridApi.grid?.loadData?.([]);
    visible.value =
      legacyVisible.value =
      historyVisible.value =
      testVisible.value =
        false;
  },
);
</script>

<template>
  <section class="min-w-0">
    <el-tabs v-model="kind" @tab-change="switchTab">
      <el-tab-pane
        v-if="access.accessCodes.includes('ai:template:list')"
        :disabled="busy || loading"
        label="模板"
        name="templates"
      />
      <el-tab-pane
        v-if="access.accessCodes.includes('ai:data:list')"
        :disabled="busy || loading"
        label="数据引用"
        name="data-resources"
      />
    </el-tabs>

    <el-alert
      v-if="failed"
      title="加载失败，请重试"
      type="error"
      :closable="false"
      class="mb-4"
    />
    <Grid>
      <template #toolbar-actions>
        <el-button
          v-if="can('add')"
          :disabled="busy || loading"
          type="primary"
          @click="openCreate"
        >
          新增{{ kind === 'templates' ? '模板' : '数据引用' }}
        </el-button>
        <el-button :disabled="busy" :loading="loading" @click="load">
          刷新
        </el-button>
        <el-button
          v-if="kind === 'templates' && can('query')"
          :disabled="busy || loading"
          @click="loadLegacy"
        >
          旧场景兼容映射
        </el-button>
      </template>
      <template #cell2="{ row }">
        <el-tag :type="row.enabled ? 'success' : 'info'">
          {{ row.enabled ? '已启用' : '已停用' }}
        </el-tag>
      </template>
      <template #cell3="{ row }">
        {{ (row.state && stateNames[row.state]) || row.state }}
      </template>
      <template #cell6="{ row }">
        <el-button v-if="can('query')" :disabled="busy" link @click="open(row)">
          查看 / 编辑
        </el-button>
        <el-button
          v-if="can('test') || (kind === 'templates' && can('preview'))"
          :disabled="busy"
          link
          @click="openTest(row)"
        >
          测试 / 预览
        </el-button>
        <el-button
          v-if="can('query')"
          :disabled="busy"
          link
          @click="openHistory(row)"
        >
          版本与引用
        </el-button>
        <el-button
          v-if="kind === 'templates' && can('publish')"
          link
          type="primary"
          :disabled="busy"
          @click="action(row, 'publish')"
        >
          发布
        </el-button>
        <el-button
          v-if="kind === 'data-resources' && can('submit')"
          link
          :disabled="busy || row.state !== 'TESTED'"
          @click="action(row, 'submit')"
        >
          提交审批
        </el-button>
        <el-button
          v-if="
            kind === 'data-resources' &&
            can('approve') &&
            row.state === 'PENDING'
          "
          link
          type="success"
          :disabled="busy"
          @click="action(row, 'approval', true)"
        >
          批准
        </el-button>
        <el-button
          v-if="
            kind === 'data-resources' &&
            can('approve') &&
            row.state === 'PENDING'
          "
          link
          type="danger"
          :disabled="busy"
          @click="action(row, 'approval', false)"
        >
          拒绝
        </el-button>
        <el-button
          v-if="can('disable')"
          link
          :disabled="busy"
          @click="toggle(row)"
        >
          {{ row.enabled ? '停用' : '启用' }}
        </el-button>
      </template>
    </Grid>

    <EditModal
      :title="`${editing ? '配置草稿' : '新增配置'} · ${kind === 'templates' ? '模板' : '数据引用'}`"
      class="w-full max-w-[1100px]"
      :destroy-on-close="true"
      :close-on-click-modal="false"
    >
      <el-form label-width="110px" :disabled="editorLocked">
        <div class="grid gap-3 md:grid-cols-2">
          <el-form-item label="名称" required>
            <el-input v-model="name" maxlength="100" />
          </el-form-item>
          <el-form-item label="负责人" required>
            <el-input v-model="owner" maxlength="100" />
          </el-form-item>
        </div>
        <el-form-item
          :label="kind === 'templates' ? '用途' : '业务域'"
          required
        >
          <el-input v-model="purpose" maxlength="500" />
        </el-form-item>
        <template v-if="kind === 'templates'">
          <el-form-item label="系统指令">
            <el-input
              v-model="instruction"
              type="textarea"
              :rows="3"
              maxlength="12000"
              placeholder="固定指令，不接受变量占位符"
            />
          </el-form-item>
          <el-form-item label="用户输入">
            <el-input
              v-model="inputMessage"
              type="textarea"
              :rows="3"
              maxlength="12000"
              placeholder="使用 {{变量名}} 引用输入变量"
            />
          </el-form-item>
          <el-form-item label="业务数据">
            <el-input
              v-model="dataMessage"
              type="textarea"
              :rows="3"
              maxlength="12000"
              placeholder="使用 {{变量名}} 引用获批资源变量"
            />
          </el-form-item>
          <el-form-item label="消息总字数">
            <el-input-number v-model="maxChars" :min="256" :max="32000" />
          </el-form-item>
          <h3 class="mb-2 font-medium">变量</h3>
          <div
            v-for="(variable, index) in variables"
            :key="index"
            class="mb-3 rounded border p-3"
          >
            <div class="flex flex-wrap gap-2">
              <el-input
                v-model="variable.name"
                placeholder="变量名"
                style="width: 160px"
              />
              <el-select v-model="variable.type" style="width: 120px">
                <el-option
                  v-for="type in [
                    'STRING',
                    'NUMBER',
                    'BOOLEAN',
                    'OBJECT',
                    'ARRAY',
                  ]"
                  :key="type"
                  :value="type"
                  :label="type"
                />
              </el-select>
              <el-input-number
                v-model="variable.maxChars"
                :min="1"
                :max="8000"
              />
              <el-checkbox v-model="variable.required">必填</el-checkbox>
              <el-checkbox v-model="variable.sensitive">敏感</el-checkbox>
              <el-checkbox v-model="variable.truncate">
                允许截断文本
              </el-checkbox>
              <el-checkbox v-model="variable.hasDefault">
                显式默认值
              </el-checkbox>
              <el-button
                link
                type="danger"
                @click="variables = variables.filter((_, i) => i !== index)"
              >
                移除
              </el-button>
            </div>
            <el-input
              v-if="variable.hasDefault"
              v-model="variable.defaultText"
              class="mt-2"
              placeholder='JSON默认值，例如 "文本"、12、true'
            />
          </div>
          <el-button @click="addVariable">添加变量</el-button>
          <h3 class="mb-2 mt-5 font-medium">固定资源版本与字段映射</h3>
          <div
            v-for="(binding, index) in bindings"
            :key="index"
            class="mb-3 rounded border p-3"
          >
            <div class="flex flex-wrap gap-2">
              <el-input
                v-model="binding.name"
                placeholder="引用名"
                style="width: 140px"
              />
              <el-input
                v-model="binding.resourceId"
                placeholder="资源ID"
                style="width: 180px"
              />
              <el-input
                v-model="binding.resourceVersionId"
                placeholder="批准版本ID"
                style="width: 180px"
              />
              <el-checkbox
                v-model="binding.required"
                @change="binding.omitOnMissing = false"
              >
                必需
              </el-checkbox>
              <el-checkbox
                v-model="binding.omitOnMissing"
                :disabled="editorLocked || binding.required"
              >
                允许缺记录/空数据时省略
              </el-checkbox>
              <el-button link type="danger" @click="bindings.splice(index, 1)">
                移除
              </el-button>
            </div>
            <p class="my-2 text-sm text-gray-500">
              参数来自本次业务引用的 formId、recordId，服务端重新授权。
            </p>
            <el-input
              v-model="binding.outputText"
              type="textarea"
              :rows="2"
              placeholder="每行一个 批准字段=变量名"
            />
          </div>
          <el-button @click="addBinding">添加数据引用</el-button>
        </template>
        <template v-else>
          <el-form-item label="来源">
            <el-input model-value="低代码表单记录（只读）" disabled />
          </el-form-item>
          <el-form-item label="表单ID" required>
            <el-input v-model="formId" placeholder="精确十进制ID" />
          </el-form-item>
          <el-form-item label="批准字段" required>
            <el-input v-model="fields" placeholder="字段标识，以逗号分隔" />
          </el-form-item>
          <el-form-item label="允许主体ID" required>
            <el-input
              v-model="subjects"
              placeholder="用户ID，以逗号分隔；仍需业务读取权限"
            />
          </el-form-item>
          <el-form-item label="允许应用ID" required>
            <el-input v-model="applications" placeholder="应用ID，以逗号分隔" />
          </el-form-item>
          <el-form-item label="读取时限(ms)">
            <el-input-number v-model="timeout" :min="100" :max="5000" />
          </el-form-item>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="visible = false">关闭</el-button>
        <el-button
          v-if="can(editing ? 'edit' : 'add')"
          type="primary"
          :loading="busy"
          @click="save"
        >
          保存草稿
        </el-button>
      </template>
    </EditModal>
    <LegacyModal title="旧场景兼容映射" class="w-full max-w-[1000px]">
      <el-alert
        title="旧appKey/sceneKey继续使用原读取链路。当前publishedRevision只表示旧表快照，不是独立模板版本，也不自动迁入应用。"
        :closable="false"
        class="mb-3"
      />
      <LegacyGrid />
    </LegacyModal>

    <TestModal
      title="当前身份测试"
      class="w-full max-w-[900px]"
      :destroy-on-close="true"
      :close-on-click-modal="false"
    >
      <el-form label-width="115px">
        <el-form-item label="应用ID" required>
          <el-input v-model="testApp" />
        </el-form-item>
        <el-form-item label="业务引用" required>
          <el-input v-model="testBusiness" placeholder="formId:recordId" />
        </el-form-item>
        <el-form-item v-if="kind === 'templates'" label="变量输入JSON">
          <el-input v-model="testInputs" type="textarea" :rows="4" />
        </el-form-item>
      </el-form>
      <el-alert
        title="使用当前真实登录身份，资源值全部脱敏；配置管理权限不会授予业务读取权限。"
        :closable="false"
      />
      <div class="my-4 flex gap-2">
        <el-button
          v-if="kind === 'templates' && can('preview')"
          :loading="busy"
          @click="test(true)"
        >
          预览
        </el-button>
        <el-button
          v-if="can('test')"
          type="primary"
          :loading="busy"
          @click="test(false)"
        >
          执行准入测试
        </el-button>
      </div>
      <template v-if="result">
        <el-tag :type="result.outcome === 'SUCCESS' ? 'success' : 'danger'">
          {{ result.outcome }}
        </el-tag>
        <p v-if="kind === 'data-resources'" class="my-3">
          记录结构版本 {{ result.schemaVersion ?? '—' }} · 已授权字段：{{
            result.fields.join('、') || '无'
          }}
        </p>
        <el-collapse v-if="result.preview">
          <el-collapse-item
            v-if="result.details"
            title="模板原文"
            name="original"
          >
            <pre class="whitespace-pre-wrap break-all">{{
              JSON.stringify(result.details.original, null, 2)
            }}</pre>
          </el-collapse-item>
          <el-collapse-item
            v-if="result.details"
            title="输入（脱敏）"
            name="inputs"
          >
            <pre>{{ JSON.stringify(result.details.inputs, null, 2) }}</pre>
          </el-collapse-item>
          <el-collapse-item
            v-if="result.details"
            title="引用字段（脱敏）"
            name="resources"
          >
            <pre>{{ JSON.stringify(result.details.resources, null, 2) }}</pre>
          </el-collapse-item>
          <el-collapse-item title="最终消息（脱敏）" name="messages">
            <div
              v-for="(message, index) in result.preview.messages"
              :key="index"
              class="mb-3"
            >
              <strong>{{ message.section }}</strong>
              <pre
                class="whitespace-pre-wrap break-all rounded bg-gray-100 p-3 dark:bg-gray-800"
                v-text="message.text"
              ></pre>
            </div>
          </el-collapse-item>
          <el-collapse-item title="缺省与截断元数据" name="notices">
            <pre>{{ JSON.stringify(result.preview.notices, null, 2) }}</pre>
          </el-collapse-item>
        </el-collapse>
      </template>
    </TestModal>

    <HistoryModal
      title="不可变版本、比较与应用引用"
      class="w-full max-w-[1100px]"
      :destroy-on-close="true"
    >
      <el-alert
        title="新发布版本不会自动升级应用的固定绑定。旧场景仍在原“场景提示词”页面读取，不伪造历史版本。"
        :closable="false"
        class="mb-3"
      />
      <HistoryGrid>
        <template #cell3="{ row }">
          <el-button link @click="inspect(row)">查看</el-button>
          <el-button link @click="inspect(row, true)">对比</el-button>
          <el-button link @click="inspectReferences(row)">引用</el-button>
        </template>
      </HistoryGrid>
      <p v-if="references" class="my-3 whitespace-pre-wrap">{{ references }}</p>
      <div class="mt-3 grid gap-3 md:grid-cols-2">
        <pre
          v-if="historyDetail"
          class="max-h-96 overflow-auto rounded bg-gray-100 p-3 text-xs dark:bg-gray-800"
          v-text="historyDetail"
        ></pre>
        <pre
          v-if="comparison"
          class="max-h-96 overflow-auto rounded bg-gray-100 p-3 text-xs dark:bg-gray-800"
          v-text="comparison"
        ></pre>
      </div>
      <el-collapse v-if="checks.length > 0" class="mt-4">
        <el-collapse-item title="测试与审批证据">
          <ChecksGrid />
        </el-collapse-item>
      </el-collapse>
    </HistoryModal>
  </section>
</template>
