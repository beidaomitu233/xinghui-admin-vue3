<script setup lang="ts">
import type {
  AiInvocationInput,
  AiPage,
  ApplicationDraft,
  ApplicationPreview,
  ApplicationVersion,
  ApplicationView,
  AvailableModel,
  ModelBinding,
  ModelReference,
  PublishedTemplateOption,
  RequestStatus,
} from '#/api/system/ai-application';

import { computed, onBeforeUnmount, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';

import { ElMessage, ElMessageBox } from 'element-plus';

import {
  applicationHealth,
  applicationModels,
  applicationTemplateOptions,
  applicationTestEvidence,
  cancelAiRequest,
  createApplication,
  getAiRequest,
  getApplication,
  listApplications,
  listApplicationVersions,
  previewApplication,
  publishApplication,
  rollbackApplication,
  setApplicationEnabled,
  submitApplicationTest,
  subscribeAiRequest,
  updateApplicationDraft,
} from '#/api/system/ai-application';
import { aiErrorMessage, aiFailureInfo } from '#/api/system/ai-runtime-errors';

import RequestLogPanel from '../ai-request/RequestLogPanel.vue';
import KeyPolicyEditor from './KeyPolicyEditor.vue';

const access = useAccessStore();
const can = (action: string) =>
  access.accessCodes.includes(`ai:application:${action}`);
const pageNum = ref(1);
const pageSize = ref(20);
const searchText = ref('');
const result = ref<AiPage<ApplicationView>>({
  records: [],
  total: 0,
  pageNum: 1,
  pageSize: 20,
});
const dialog = ref(false);
const error = ref('');
const loading = ref(false);
const saving = ref(false);
const saved = ref<ApplicationView>();
function empty(): ApplicationDraft {
  return {
    entryKey: '',
    name: '',
    purpose: '',
    policy: {
      modelMode: 'FIXED',
      models: [],
      modelFallback: false,
      template: null,
      inputNames: ['user_request'],
      requirements: { outputFormat: 'TEXT', streaming: true, tools: false },
      scope: 'FRONTEND',
      allowedSubjects: [],
      allowedAuthorities: [],
      formId: null,
      timeoutSeconds: 30,
      maxAttempts: 2,
      maxConcurrent: 2,
      maxTokens: 1024,
    },
  };
}
const draft = ref<ApplicationDraft>(empty());
const entryKind = ref<'GENERAL' | 'SUMMARY'>('GENERAL');
const baseline = ref('');
const dirty = computed(() => JSON.stringify(draft.value) !== baseline.value);
const editable = computed(() => (saved.value ? can('edit') : can('add')));
const modelOptions = ref<AvailableModel[]>([]);
const templates = ref<PublishedTemplateOption[]>([]);
const templateKeyword = ref('');
const evidence = ref<{ model: ModelReference; requestId: string }[]>([]);
const sampleJson = ref('{\n  "user_request": "请概括记录的主要信息。"\n}');
const sampleRecordId = ref('');
const sampleBusinessType = ref('');
const sampleBusinessId = ref('');
const preview = ref<ApplicationPreview>();
const previewLoading = ref(false);
const compareVersion = ref<ApplicationVersion>();
const versionDialog = ref(false);
const versions = ref<ApplicationVersion[]>([]);
const historyApp = ref<ApplicationView>();
const health = ref<Record<string, { revision: number; text: string }>>({});
const logAppId = ref('');
const logsOpen = ref(false);
const stopSeries = ref(false);
const testing = ref(false);
const testRows = ref<
  {
    complete: boolean;
    error: string;
    index: number;
    model: string;
    requestId: string;
    status: RequestStatus;
    text: string;
  }[]
>([]);
let editGeneration = 0;
let modelSerial = 0;
let serial = 0;
let templateSerial = 0;
let testGeneration = 0;
const activeTestId = ref<string>();
const pendingTest = ref<{
  appId: string;
  index: number;
  input: AiInvocationInput;
  revision: number;
}>();
let testAbort: AbortController | undefined;
const refKey = (model: ModelReference) =>
  `${model.modelRef}/${model.configVersion}`;
const templateKey = (template: {
  templateId: string;
  templateVersionId: string;
}) => `${template.templateId}/${template.templateVersionId}`;
const chosenModels = computed(() =>
  draft.value.policy.models.map((binding) => refKey(binding.model)),
);
const chosenTemplate = computed(() =>
  draft.value.policy.template ? templateKey(draft.value.policy.template) : '',
);
const selectedTemplate = computed(() =>
  templates.value.find((item) => templateKey(item) === chosenTemplate.value),
);
const perAttempt = computed(() =>
  Math.floor(
    draft.value.policy.maxTokens /
      Math.min(draft.value.policy.maxAttempts, draft.value.policy.maxTokens),
  ),
);
const testIds = computed(() => [
  ...new Set(evidence.value.map((item) => item.requestId)),
]);
const allTested = computed(
  () =>
    draft.value.policy.models.length > 0 &&
    draft.value.policy.models.every((binding) =>
      evidence.value.some(
        (item) => refKey(item.model) === refKey(binding.model),
      ),
    ),
);
const readOnly = computed(
  () =>
    !editable.value ||
    saving.value ||
    testing.value ||
    !!activeTestId.value ||
    !!pendingTest.value,
);
const csv = (value: string) => [
  ...new Set(
    value
      .split(/[,，\s]+/)
      .map((part) => part.trim())
      .filter(Boolean),
  ),
];
const modelLabel = (binding: ModelBinding) => {
  const option = modelOptions.value.find(
    (item) => refKey(item.model) === refKey(binding.model),
  );
  return option
    ? `${option.configName} · ${option.modelCode}`
    : `模型 ${binding.model.modelRef} · 配置版本 ${binding.model.configVersion}`;
};

async function load() {
  if (!can('list')) return;
  const run = ++serial;
  loading.value = true;
  try {
    const value = await listApplications({
      pageNum: pageNum.value,
      pageSize: pageSize.value,
      search: searchText.value,
    });
    if (run === serial) result.value = value;
  } catch {
    if (run === serial) error.value = '应用读取失败。';
  } finally {
    if (run === serial) loading.value = false;
  }
}
function search() {
  pageNum.value = 1;
  void load();
}
function adopt(view: ApplicationView) {
  saved.value = view;
  draft.value = {
    name: view.name,
    purpose: view.purpose,
    entryKey: view.entryKey,
    policy: structuredClone(view.draft),
  };
  entryKind.value = view.draft.formId === null ? 'GENERAL' : 'SUMMARY';
  baseline.value = JSON.stringify(draft.value);
}
async function refreshModels() {
  const run = ++modelSerial;
  try {
    const value = await applicationModels(
      draft.value.policy.requirements.streaming,
      draft.value.policy.requirements.outputFormat,
    );
    if (run === modelSerial) modelOptions.value = value;
  } catch {
    if (run === modelSerial) error.value = '模型候选读取失败。';
  }
}
async function refreshTemplates() {
  const run = ++templateSerial;
  try {
    const value = await applicationTemplateOptions({
      appId: saved.value?.appId,
      pageNum: 1,
      pageSize: 100,
      keyword: templateKeyword.value,
    });
    if (run === templateSerial) templates.value = value.records;
  } catch {
    if (run === templateSerial) error.value = '模板候选读取失败。';
  }
}
async function refreshEvidence() {
  if (!saved.value) return;
  const generation = editGeneration;
  const id = saved.value.appId;
  try {
    const value = await applicationTestEvidence(id);
    if (generation === editGeneration && saved.value?.appId === id)
      evidence.value = value;
  } catch {
    if (generation === editGeneration) error.value = '测试证据读取失败。';
  }
}
async function open(row?: ApplicationView) {
  const generation = ++editGeneration;
  testGeneration++;
  error.value = '';
  preview.value = undefined;
  testRows.value = [];
  evidence.value = [];
  saved.value = undefined;
  draft.value = empty();
  entryKind.value = 'GENERAL';
  baseline.value = '';
  sampleRecordId.value = '';
  sampleBusinessType.value = '';
  sampleBusinessId.value = '';
  compareVersion.value = undefined;
  try {
    if (row) {
      const value = await getApplication(row.appId);
      if (generation !== editGeneration) return;
      adopt(value);
    }
    dialog.value = true;
    await Promise.all([refreshModels(), refreshTemplates(), refreshEvidence()]);
  } catch {
    if (generation === editGeneration) error.value = '应用详情读取失败。';
  }
}
function selectModels(values: string[]) {
  const previous = new Map(
    draft.value.policy.models.map((binding) => [
      refKey(binding.model),
      binding,
    ]),
  );
  draft.value.policy.models = values.map(
    (value) =>
      previous.get(value) ??
      (() => {
        const option = modelOptions.value.find(
          (item) => refKey(item.model) === value,
        );
        if (!option) throw new Error('Unknown model');
        return {
          model: option.model,
          keyMode: 'AUTO' as const,
          allowedKeys: [],
          fixedKey: null,
          fallbackKeys: [],
        };
      })(),
  );
}
function moveModel(index: number, direction: number) {
  const values = [...draft.value.policy.models];
  const next = index + direction;
  const source = values[index];
  const target = values[next];
  if (!source || !target) return;
  values[index] = target;
  values[next] = source;
  draft.value.policy.models = values;
}
function selectTemplate(value: string) {
  const selected = templates.value.find((item) => templateKey(item) === value);
  if (!selected) return;
  draft.value.policy.template = {
    templateId: selected.templateId,
    templateVersionId: selected.templateVersionId,
  };
  draft.value.policy.inputNames = selected.inputVariables.map(
    (variable) => variable.name,
  );
  preview.value = undefined;
}
function chooseEntryKind(kind: 'GENERAL' | 'SUMMARY') {
  if (saved.value || readOnly.value) return;
  entryKind.value = kind;
  draft.value.policy.formId = kind === 'SUMMARY' ? '' : null;
  draft.value.entryKey = '';
}
function positiveId(value: string) {
  return (
    /^[1-9]\d{0,18}$/.test(value) &&
    (value.length < 19 || value <= '9223372036854775807')
  );
}
async function save() {
  if (
    !editable.value ||
    saving.value ||
    testing.value ||
    activeTestId.value ||
    pendingTest.value
  )
    return;
  if (!draft.value.name.trim() || !draft.value.purpose.trim()) {
    ElMessage.warning('请填写名称和用途。');
    return;
  }
  if (entryKind.value === 'SUMMARY') {
    if (!draft.value.policy.formId || !positiveId(draft.value.policy.formId)) {
      ElMessage.warning('请填写有效表单 ID。');
      return;
    }
    draft.value.entryKey = `lowcode.record.summary/${draft.value.policy.formId}`;
  } else {
    if (
      !/^[a-z][a-z0-9_.:/-]{0,127}$/.test(draft.value.entryKey) ||
      draft.value.entryKey.startsWith('lowcode.record.summary/')
    ) {
      ElMessage.warning(
        '请填写有效普通入口标识，表单摘要前缀仅供表单摘要使用。',
      );
      return;
    }
    draft.value.policy.formId = null;
  }
  saving.value = true;
  error.value = '';
  try {
    // eslint-disable-next-line unicorn/prefer-structured-clone -- Serialize the reactive draft into the JSON API envelope.
    const value = JSON.parse(JSON.stringify(draft.value)) as ApplicationDraft;
    if (saved.value)
      adopt(
        await updateApplicationDraft(
          saved.value.appId,
          saved.value.revision,
          value,
        ),
      );
    else {
      const id = await createApplication(value);
      adopt(await getApplication(id));
    }
    evidence.value = [];
    testRows.value = [];
    preview.value = undefined;
    await Promise.all([refreshEvidence(), refreshTemplates(), load()]);
    ElMessage.success('草稿已保存');
  } catch (error_) {
    error.value = aiErrorMessage(aiFailureInfo(error_).code);
  } finally {
    saving.value = false;
  }
}
function sample(): Omit<AiInvocationInput, 'idempotencyKey'> | undefined {
  if (!saved.value || dirty.value) {
    ElMessage.warning('请先保存当前草稿。');
    return;
  }
  if (entryKind.value === 'SUMMARY' && !positiveId(sampleRecordId.value)) {
    ElMessage.warning('请输入有权查看的记录 ID。');
    return;
  }
  if (
    entryKind.value === 'GENERAL' &&
    (!/^[a-z][a-z0-9_.-]{0,63}$/.test(sampleBusinessType.value) ||
      !/^[A-Z0-9][\w.:/-]{0,127}$/i.test(sampleBusinessId.value))
  ) {
    ElMessage.warning('请填写有效业务类型和关联 ID。');
    return;
  }
  try {
    const value: unknown = JSON.parse(sampleJson.value);
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Invalid sample');
    return {
      businessRef:
        entryKind.value === 'SUMMARY'
          ? {
              type: 'lowcode.record',
              id: `${draft.value.policy.formId}:${sampleRecordId.value}`,
            }
          : { type: sampleBusinessType.value, id: sampleBusinessId.value },
      inputs: value as Record<string, unknown>,
    };
  } catch {
    ElMessage.warning('样本输入须为 JSON 对象。');
  }
}
async function showPreview() {
  const input = sample();
  if (!input || !saved.value || !can('test') || previewLoading.value) return;
  const generation = editGeneration;
  previewLoading.value = true;
  try {
    const value = await previewApplication(
      saved.value.appId,
      saved.value.revision,
      input,
    );
    if (generation === editGeneration) preview.value = value;
  } catch (error_) {
    if (generation === editGeneration)
      error.value = aiErrorMessage(aiFailureInfo(error_).code);
  } finally {
    if (generation === editGeneration) previewLoading.value = false;
  }
}
async function runTests() {
  if (activeTestId.value || pendingTest.value) {
    error.value = '原测试仍未确认终态，请先查询或取消原请求。';
    return;
  }
  const input = sample();
  if (
    !input ||
    !saved.value ||
    testing.value ||
    !can('test') ||
    draft.value.policy.models.length === 0
  )
    return;
  const app = saved.value;
  const bindings = [...draft.value.policy.models];
  const generation = editGeneration;
  try {
    await ElMessageBox.confirm(
      `将测试 ${bindings.length} 个候选，最多 ${bindings.length * draft.value.policy.maxAttempts} 次模型尝试，可能产生费用。`,
      '测试当前草稿',
    );
  } catch {
    return;
  }
  if (generation !== editGeneration || dirty.value) return;
  const run = ++testGeneration;
  testing.value = true;
  stopSeries.value = false;
  testRows.value = [];
  for (const [index, binding] of bindings.entries()) {
    if (run !== testGeneration || stopSeries.value) break;
    const row = {
      index,
      model: modelLabel(binding),
      requestId: '',
      status: 'QUEUED' as RequestStatus,
      text: '',
      error: '',
      complete: false,
    };
    testRows.value.push(row);
    const current = testRows.value[index];
    if (!current) break;
    const submission = {
      appId: app.appId,
      index,
      input: { ...input, idempotencyKey: crypto.randomUUID() },
      revision: app.revision,
    };
    try {
      const accepted = await submitApplicationTest(
        submission.appId,
        submission.revision,
        submission.index,
        submission.input,
      );
      current.requestId = accepted.requestId;
      current.status = accepted.status;
      activeTestId.value = accepted.requestId;
      if (run !== testGeneration || stopSeries.value) {
        const state = await cancelAiRequest(accepted.requestId);
        current.status = state.status;
        break;
      }
      testAbort = new AbortController();
      await subscribeAiRequest(
        accepted.requestId,
        (event) => {
          if (
            run !== testGeneration ||
            stopSeries.value ||
            current.complete ||
            ['CANCELLED', 'FAILED', 'INCOMPLETE', 'TIMED_OUT'].includes(
              current.status,
            )
          )
            return;
          if (event.type === 'delta') {
            if (current.text.length + (event.text?.length ?? 0) > 65_536)
              throw new Error('Output bound');
            current.text += event.text ?? '';
            current.status = 'RUNNING';
          }
          if (event.type === 'completed') {
            current.status = 'SUCCEEDED';
            current.complete = true;
          }
          if (event.type === 'failed' || event.type === 'cancelled') {
            current.status = event.status as RequestStatus;
            current.error = aiErrorMessage(event.errorCode);
          }
        },
        testAbort.signal,
      );
    } catch (error_) {
      if (run !== testGeneration) break;
      const info = aiFailureInfo(error_);
      current.error = aiErrorMessage(info.code);
      current.requestId ||= info.requestId ?? '';
      if (!/^[1-9]\d{0,18}$/.test(current.requestId) && !info.code) {
        pendingTest.value = submission;
        current.error = '测试受理未确认，请确认原测试受理；将沿用原提交标识。';
      }
      if (/^[1-9]\d{0,18}$/.test(current.requestId)) {
        try {
          const state = await getAiRequest(current.requestId);
          if (run === testGeneration) {
            current.status = state.status;
            if (state.status === 'QUEUED' || state.status === 'RUNNING') {
              activeTestId.value = state.requestId;
              stopSeries.value = true;
            }
          }
        } catch {
          activeTestId.value = current.requestId;
          stopSeries.value = true;
        }
      } else if (!pendingTest.value) current.status = 'FAILED';
      // An interrupted candidate is never followed automatically by another model call.
      stopSeries.value = true;
    } finally {
      if (run === testGeneration) {
        if (!['QUEUED', 'RUNNING'].includes(current.status))
          activeTestId.value = undefined;
        testAbort = undefined;
      }
    }
  }
  if (run === testGeneration) {
    testing.value = false;
    await refreshEvidence();
  }
}
async function confirmOriginalTest() {
  const pending = pendingTest.value;
  if (!pending || !can('test') || testing.value) return;
  const generation = editGeneration;
  testing.value = true;
  try {
    const state = await submitApplicationTest(
      pending.appId,
      pending.revision,
      pending.index,
      pending.input,
    );
    if (generation !== editGeneration) return;
    pendingTest.value = undefined;
    const row = testRows.value.find((item) => item.index === pending.index);
    if (row) {
      row.requestId = state.requestId;
      row.status = state.status;
      row.error = '已确认原请求；刷新查询终态，不重复运行候选。';
    }
    if (['QUEUED', 'RUNNING'].includes(state.status))
      activeTestId.value = state.requestId;
    await refreshEvidence();
  } catch (error_) {
    const info = aiFailureInfo(error_);
    if (generation === editGeneration) error.value = aiErrorMessage(info.code);
  } finally {
    if (generation === editGeneration) testing.value = false;
  }
}
async function cancelTests() {
  stopSeries.value = true;
  if (activeTestId.value) {
    try {
      const state = await cancelAiRequest(activeTestId.value);
      const row = testRows.value.find(
        (item) => item.requestId === activeTestId.value,
      );
      if (row) row.status = state.status;
      if (!['QUEUED', 'RUNNING'].includes(state.status))
        activeTestId.value = undefined;
    } catch {
      error.value = '取消未确认，请保留请求 ID。';
    }
  }
  testAbort?.abort();
}
async function refreshTests() {
  const generation = editGeneration;
  if (activeTestId.value) {
    const id = activeTestId.value;
    try {
      const state = await getAiRequest(id);
      if (generation !== editGeneration || id !== activeTestId.value) return;
      const row = testRows.value.find((item) => item.requestId === id);
      if (row) row.status = state.status;
      if (!['QUEUED', 'RUNNING'].includes(state.status))
        activeTestId.value = undefined;
    } catch {
      error.value = '原测试状态未确认，请保留请求 ID。';
    }
  }
  await refreshEvidence();
}
async function publish() {
  if (
    !saved.value ||
    dirty.value ||
    !allTested.value ||
    !can('publish') ||
    activeTestId.value ||
    pendingTest.value
  )
    return;
  try {
    await ElMessageBox.confirm(
      '将发布当前精确绑定与策略，原请求继续原版本。',
      '发布应用',
    );
  } catch {
    return;
  }
  if (
    !saved.value ||
    dirty.value ||
    !allTested.value ||
    !can('publish') ||
    activeTestId.value ||
    pendingTest.value
  )
    return;
  saving.value = true;
  try {
    await publishApplication(
      saved.value.appId,
      saved.value.revision,
      testIds.value,
    );
    adopt(await getApplication(saved.value.appId));
    await load();
    ElMessage.success('应用已发布');
  } catch (error_) {
    error.value = aiErrorMessage(aiFailureInfo(error_).code);
  } finally {
    saving.value = false;
  }
}
async function enabled(row: ApplicationView) {
  if (!can('enable')) return;
  try {
    await setApplicationEnabled(row.appId, row.revision, !row.enabled);
    await load();
  } catch (error_) {
    error.value = aiErrorMessage(aiFailureInfo(error_).code);
  }
}
async function checkHealth(row: ApplicationView) {
  if (!can('query')) return;
  try {
    const value = await applicationHealth(row.appId);
    if (
      !can('query') ||
      !result.value.records.some(
        (item) => item.appId === row.appId && item.revision === value.revision,
      )
    )
      return;
    const labels = {
      AVAILABLE: '绑定可用',
      DISABLED: '已停用',
      UNAVAILABLE: '绑定不可用',
      UNPUBLISHED: '未发布',
    };
    health.value[row.appId] = {
      revision: value.revision,
      text:
        labels[value.state] +
        (value.reason ? ` · ${aiErrorMessage(value.reason)}` : ''),
    };
  } catch {
    error.value = '配置健康检查失败。';
  }
}
async function history(row: ApplicationView) {
  if (!can('query')) return;
  try {
    historyApp.value = await getApplication(row.appId);
    versions.value = await listApplicationVersions(row.appId);
    compareVersion.value = versions.value[0];
    versionDialog.value = true;
  } catch {
    error.value = '版本读取失败。';
  }
}
async function rollback(version: ApplicationVersion) {
  if (!historyApp.value || !can('publish')) return;
  try {
    await ElMessageBox.confirm(
      `恢复到版本 ${version.versionNumber}，仅影响新请求。`,
      '回滚应用',
    );
  } catch {
    return;
  }
  try {
    await rollbackApplication(
      version.appId,
      historyApp.value.revision,
      version.appVersionId,
    );
    historyApp.value = await getApplication(version.appId);
    await load();
    ElMessage.success('新请求已切换版本');
  } catch (error_) {
    error.value = aiErrorMessage(aiFailureInfo(error_).code);
  }
}
async function close() {
  if (saving.value) return;
  if (pendingTest.value) {
    error.value = '测试受理尚未确认，请先确认原测试受理。';
    return;
  }
  if (testing.value || activeTestId.value) await cancelTests();
  if (activeTestId.value) {
    error.value = '原测试取消未确认，请先查询原请求状态。';
    return;
  }
  if (dirty.value) {
    try {
      await ElMessageBox.confirm('未保存内容将丢失，仍要关闭？', '关闭配置');
    } catch {
      return;
    }
  }
  editGeneration++;
  testGeneration++;
  modelSerial++;
  templateSerial++;
  testAbort?.abort();
  dialog.value = false;
  testing.value = false;
}
onBeforeUnmount(() => {
  serial++;
  editGeneration++;
  testGeneration++;
  modelSerial++;
  templateSerial++;
  testAbort?.abort();
  if (activeTestId.value)
    void cancelAiRequest(activeTestId.value).catch(() => {});
});
void load();
</script>

<template>
  <Page title="AI 应用中心">
    <el-card class="m-4">
      <el-alert
        v-if="!can('list')"
        title="没有应用列表权限。"
        type="warning"
        closable
      />
      <template v-else>
        <el-form inline @submit.prevent="search">
          <el-form-item label="名称">
            <el-input v-model="searchText" maxlength="128" clearable />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="loading" @click="search">
              查询
            </el-button>
            <el-button v-if="can('add')" @click="open()">新建应用</el-button>
          </el-form-item>
        </el-form>
        <el-alert
          v-if="error && !dialog"
          :title="error"
          type="error"
          closable
          @close="error = ''"
        />
        <el-table
          v-loading="loading"
          :data="result.records"
          row-key="appId"
          border
        >
          <el-table-column prop="name" label="名称" min-width="150" />
          <el-table-column prop="appId" label="应用 ID" min-width="120" />
          <el-table-column
            prop="purpose"
            label="用途"
            min-width="180"
            show-overflow-tooltip
          />
          <el-table-column prop="ownerId" label="负责人" min-width="120" />
          <el-table-column label="发布版本" min-width="120">
            <template #default="{ row }">
              {{ row.publishedVersionId ?? '未发布' }}
            </template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              {{ row.enabled ? '启用' : '停用' }}
            </template>
          </el-table-column>
          <el-table-column label="配置健康" min-width="180">
            <template #default="{ row }">
              <span>
                {{
                  health[row.appId]?.revision === row.revision
                    ? health[row.appId]?.text
                    : '未检查'
                }}
              </span>
              <el-button v-if="can('query')" link @click="checkHealth(row)">
                检查绑定
              </el-button>
            </template>
          </el-table-column>
          <el-table-column label="操作" min-width="290">
            <template #default="{ row }">
              <el-button v-if="can('query')" link @click="open(row)">
                配置 / 测试
              </el-button>
              <el-button v-if="can('query')" link @click="history(row)">
                版本
              </el-button>
              <el-button
                v-if="can('enable') && row.publishedVersionId"
                link
                @click="enabled(row)"
              >
                {{ row.enabled ? '停用' : '启用' }}
              </el-button>
              <el-button
                v-if="access.accessCodes.includes('ai:request:list')"
                link
                @click="
                  logAppId = row.appId;
                  logsOpen = true;
                "
              >
                日志
              </el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-pagination
          v-model:current-page="pageNum"
          v-model:page-size="pageSize"
          :total="Number(result.total)"
          :page-sizes="[10, 20, 50, 100]"
          layout="total,sizes,prev,pager,next"
          class="mt-3"
          @current-change="load"
          @size-change="search"
        />
      </template>
    </el-card>
    <el-dialog
      v-model="dialog"
      :title="saved ? `${saved.name} · 配置与测试` : '新建应用'"
      width="min(1040px,95vw)"
      :close-on-click-modal="false"
      :before-close="close"
    >
      <el-alert
        v-if="error"
        :title="error"
        type="error"
        closable
        class="mb-3"
        @close="error = ''"
      />
      <el-alert
        v-if="saved"
        :title="`应用 ID ${saved.appId} · 草稿 ${saved.draftRevision} · 发布 ${saved.publishedVersionId ?? '无'}`"
        type="info"
        closable
        class="mb-3"
      />
      <el-form label-position="top" :disabled="readOnly">
        <el-form-item label="入口类型">
          <el-select
            :model-value="entryKind"
            :disabled="!!saved"
            @change="chooseEntryKind"
          >
            <el-option label="普通 AI 应用" value="GENERAL" />
            <el-option label="低代码表单摘要" value="SUMMARY" />
          </el-select>
        </el-form-item>
        <el-form-item label="稳定入口标识" required>
          <el-input
            v-if="entryKind === 'GENERAL'"
            v-model="draft.entryKey"
            :disabled="!!saved"
            maxlength="128"
            placeholder="业务研发使用的入口标识，保存后不可更改"
          />
          <el-input
            v-else
            :model-value="`lowcode.record.summary/${draft.policy.formId ?? ''}`"
            disabled
          />
        </el-form-item>
        <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
          <el-form-item label="名称" required>
            <el-input v-model="draft.name" maxlength="128" />
          </el-form-item>
          <el-form-item
            v-if="entryKind === 'SUMMARY'"
            label="目标表单 ID"
            required
          >
            <el-input
              v-model="draft.policy.formId"
              :disabled="!!saved"
              maxlength="19"
              placeholder="填写实际低代码表单 ID"
            />
          </el-form-item>
        </div>
        <el-form-item label="用途" required>
          <el-input v-model="draft.purpose" type="textarea" maxlength="512" />
        </el-form-item>
        <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
          <el-form-item label="使用范围">
            <el-select v-model="draft.policy.scope">
              <el-option label="前台业务页面" value="FRONTEND" />
              <el-option label="后台服务" value="BACKGROUND" />
              <el-option label="前台及后台" value="BOTH" />
            </el-select>
          </el-form-item>
          <el-form-item label="允许动作权限（任一匹配）">
            <el-input
              :model-value="draft.policy.allowedAuthorities.join(', ')"
              @update:model-value="
                draft.policy.allowedAuthorities = csv($event)
              "
            />
          </el-form-item>
        </div>
        <el-form-item label="或允许的指定主体（逗号分隔，不扩大数据权限）">
          <el-input
            :model-value="draft.policy.allowedSubjects.join(', ')"
            @update:model-value="draft.policy.allowedSubjects = csv($event)"
          />
        </el-form-item>
        <el-form-item label="模型候选（保存顺序决定轮流及备用顺序）">
          <el-select
            :model-value="chosenModels"
            multiple
            class="w-full"
            @change="selectModels"
          >
            <el-option
              v-for="item in modelOptions"
              :key="refKey(item.model)"
              :value="refKey(item.model)"
              :label="`${item.configName} · ${item.modelCode} · ${item.usableKeyCount} 个可用 Key`"
            />
          </el-select>
        </el-form-item>
        <div class="flex flex-wrap items-center gap-3">
          <el-select v-model="draft.policy.modelMode" class="w-48">
            <el-option label="固定使用首个模型" value="FIXED" />
            <el-option label="按保存顺序轮流" value="ROUND_ROBIN" />
          </el-select>
          <el-checkbox v-model="draft.policy.modelFallback">
            明确允许切换其他候选模型
          </el-checkbox>
          <el-button @click="refreshModels">刷新候选</el-button>
        </div>
        <div
          v-for="(binding, index) in draft.policy.models"
          :key="refKey(binding.model)"
          class="my-3 rounded border p-3"
        >
          <div class="flex flex-wrap items-center gap-2">
            <strong>{{ index + 1 }}. {{ modelLabel(binding) }}</strong>
            <el-button
              :disabled="index === 0"
              size="small"
              @click="moveModel(index, -1)"
            >
              上移
            </el-button>
            <el-button
              :disabled="index === draft.policy.models.length - 1"
              size="small"
              @click="moveModel(index, 1)"
            >
              下移
            </el-button>
            <span class="text-sm">
              {{
                evidence.some(
                  (item) => refKey(item.model) === refKey(binding.model),
                ) && !dirty
                  ? '当前草稿测试已通过'
                  : '需测试'
              }}
            </span>
          </div>
          <KeyPolicyEditor
            :model-value="binding"
            :disabled="readOnly"
            @update:model-value="draft.policy.models[index] = $event"
          />
        </div>
        <el-form-item label="已发布提示词精确版本">
          <el-input
            v-model="templateKeyword"
            placeholder="搜索模板名称"
            class="mb-2"
            @keyup.enter="refreshTemplates"
          />
          <el-select
            :model-value="chosenTemplate"
            class="w-full"
            @change="selectTemplate"
          >
            <el-option
              v-if="draft.policy.template && !selectedTemplate"
              :label="`已绑定 ${chosenTemplate}（可搜索加载元数据）`"
              :value="chosenTemplate"
            />
            <el-option
              v-for="item in templates"
              :key="templateKey(item)"
              :value="templateKey(item)"
              :disabled="!item.available"
              :label="`${item.name} · v${item.versionNumber}${item.available ? '' : ` · ${item.unavailableReasons.join('/')}`}`"
            />
          </el-select>
          <el-button class="mt-2" @click="refreshTemplates">刷新模板</el-button>
        </el-form-item>
        <div v-if="selectedTemplate" class="mb-3 text-sm">
          输入变量：{{
            selectedTemplate.inputVariables
              .map(
                (item) =>
                  `${item.name} (${item.type}${item.required ? ', 必填' : ''})`,
              )
              .join('；') || '无'
          }}
          · 资源版本：{{
            selectedTemplate.resources
              .map((item) => `${item.resourceId}/${item.resourceVersionId}`)
              .join('，') || '无'
          }}
        </div>
        <details class="my-3 rounded border p-3">
          <summary class="cursor-pointer">输出与调用保护</summary>
          <div class="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
            <el-form-item label="输出格式">
              <el-select
                v-model="draft.policy.requirements.outputFormat"
                @change="refreshModels"
              >
                <el-option label="文本" value="TEXT" />
                <el-option label="JSON 对象" value="JSON_OBJECT" />
              </el-select>
            </el-form-item>
            <el-form-item label="流式输出">
              <el-switch
                v-model="draft.policy.requirements.streaming"
                @change="refreshModels"
              />
            </el-form-item>
            <el-form-item label="工具调用">
              <el-checkbox :model-value="false" disabled>
                第二期支持
              </el-checkbox>
            </el-form-item>
            <el-form-item label="总超时（秒）">
              <el-input-number
                v-model="draft.policy.timeoutSeconds"
                :min="1"
                :max="120"
              />
            </el-form-item>
            <el-form-item label="总尝试上限">
              <el-input-number
                v-model="draft.policy.maxAttempts"
                :min="1"
                :max="8"
              />
            </el-form-item>
            <el-form-item label="并发上限">
              <el-input-number
                v-model="draft.policy.maxConcurrent"
                :min="1"
                :max="10"
              />
            </el-form-item>
            <el-form-item label="总输出 Token 预算">
              <el-input-number
                v-model="draft.policy.maxTokens"
                :min="draft.policy.maxAttempts"
                :max="4096"
              />
              <span class="mt-1 block text-sm">
                单次保守上限 {{ perAttempt }} Token；重试不会再次获得整份预算。
              </span>
            </el-form-item>
          </div>
        </details>
      </el-form>
      <div v-if="saved && can('test')" class="mt-4 rounded border p-3">
        <h3 class="mb-2 font-semibold">授权样本测试</h3>
        <el-alert
          title="使用当前真实身份；预览不计作模型测试通过。"
          type="info"
          closable
          class="mb-3"
        />
        <el-form label-position="top" :disabled="testing">
          <el-form-item
            v-if="entryKind === 'SUMMARY'"
            label="有权查看的记录 ID"
          >
            <el-input v-model="sampleRecordId" maxlength="19" />
          </el-form-item>
          <template v-else>
            <el-form-item label="业务类型">
              <el-input v-model="sampleBusinessType" maxlength="64" />
            </el-form-item>
            <el-form-item label="业务关联 ID">
              <el-input v-model="sampleBusinessId" maxlength="128" />
            </el-form-item>
            <p class="mb-3 text-sm">
              业务关联仅用于追踪；引用数据仍按当前身份和已批准资源校验权限。
            </p>
          </template>
          <el-form-item label="样本输入 JSON（仅本次使用，不随草稿保存）">
            <el-input
              v-model="sampleJson"
              type="textarea"
              :rows="4"
              maxlength="16000"
            />
          </el-form-item>
        </el-form>
        <div class="flex flex-wrap gap-2">
          <el-button
            :disabled="dirty || testing"
            :loading="previewLoading"
            @click="showPreview"
          >
            脱敏预览
          </el-button>
          <el-button
            type="primary"
            :disabled="dirty || testing"
            @click="runTests"
          >
            依次测试全部候选
          </el-button>
          <el-button v-if="testing || activeTestId" @click="cancelTests">
            取消后续测试
          </el-button>
          <el-button
            v-if="pendingTest"
            :loading="testing"
            @click="confirmOriginalTest"
          >
            确认原测试受理
          </el-button>
          <el-button :disabled="testing" @click="refreshTests">
            刷新测试记录
          </el-button>
          <span v-if="dirty" class="text-sm">先保存当前草稿。</span>
        </div>
        <div v-if="preview" class="mt-3">
          <h4 class="font-semibold">模板原文（脱敏）</h4>
          <pre
            v-for="(message, index) in preview.originalMessages"
            :key="`o${index}`"
            class="my-2 whitespace-pre-wrap break-words rounded border p-2"
          ><span>{{ message.role }}: </span><span>{{ message.content }}</span></pre>
          <h4 class="font-semibold">渲染消息（脱敏）</h4>
          <pre
            v-for="(message, index) in preview.renderedMessages"
            :key="`r${index}`"
            class="my-2 whitespace-pre-wrap break-words rounded border p-2"
          ><span>{{ message.role }}: </span><span>{{ message.content }}</span></pre>
          <details>
            <summary class="cursor-pointer">变量、资源与缺省说明</summary>
            <pre class="whitespace-pre-wrap break-words">{{
              JSON.stringify(
                {
                  inputs: preview.inputSummary,
                  resources: preview.resourceSummary,
                  notices: preview.notices,
                },
                null,
                2,
              )
            }}</pre>
          </details>
        </div>
        <div
          v-for="row in testRows"
          :key="row.index"
          class="my-3 rounded border p-3"
        >
          <p>
            {{ row.model }} · {{ row.status }} · 请求 ID
            {{ row.requestId || '尚未受理' }}
          </p>
          <el-alert
            v-if="row.error"
            :title="row.error"
            type="warning"
            closable
          />
          <pre class="mt-2 whitespace-pre-wrap break-words">{{ row.text }}</pre>
          <span
            v-if="row.status === 'SUCCEEDED' && !row.complete"
            class="text-sm"
          >
            状态已成功，正文未完整接收。
          </span>
        </div>
      </div>
      <template #footer>
        <el-button :disabled="saving" @click="close">关闭</el-button>
        <el-button
          v-if="editable"
          :loading="saving"
          :disabled="testing || !!activeTestId || !!pendingTest"
          @click="save"
        >
          保存草稿
        </el-button>
        <el-button
          v-if="saved && can('publish')"
          type="primary"
          :loading="saving"
          :disabled="
            dirty || testing || !!activeTestId || !!pendingTest || !allTested
          "
          @click="publish"
        >
          发布当前版本
        </el-button>
      </template>
    </el-dialog>
    <el-dialog
      v-model="versionDialog"
      title="应用版本与回滚"
      width="min(1000px,95vw)"
    >
      <el-table :data="versions" border>
        <el-table-column prop="versionNumber" label="版本" width="80" />
        <el-table-column prop="appVersionId" label="版本 ID" min-width="120" />
        <el-table-column prop="draftRevision" label="来源草稿" width="100" />
        <el-table-column label="操作">
          <template #default="{ row }">
            <el-button link @click="compareVersion = row">比较配置</el-button>
            <el-button v-if="can('publish')" link @click="rollback(row)">
              恢复此版本
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <details v-if="compareVersion" class="mt-3" open>
        <summary class="cursor-pointer">所选发布配置 / 当前草稿</summary>
        <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
          <pre class="whitespace-pre-wrap break-words rounded border p-3">{{
            JSON.stringify(compareVersion.snapshot.policy, null, 2)
          }}</pre>
          <pre class="whitespace-pre-wrap break-words rounded border p-3">{{
            JSON.stringify(historyApp?.draft, null, 2)
          }}</pre>
        </div>
      </details>
      <template #footer>
        <el-button @click="versionDialog = false">关闭</el-button>
      </template>
    </el-dialog>
    <el-dialog v-model="logsOpen" title="应用请求日志" width="min(1200px,96vw)">
      <RequestLogPanel v-if="logsOpen" :app-id="logAppId" />
      <template #footer>
        <el-button @click="logsOpen = false">关闭</el-button>
      </template>
    </el-dialog>
  </Page>
</template>
