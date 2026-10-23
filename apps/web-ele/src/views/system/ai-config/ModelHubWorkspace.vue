<script setup lang="ts">
import type { HubSourceOption, ModelMetadata } from './model-hub-state';

import type { StoredCatalog } from '#/api/system/ai-model-catalog';
import type {
  HubModel,
  HubModelChange,
  HubModelSummary,
  HubModelTest,
} from '#/api/system/ai-model-hub';
import type {
  AiSettingsView,
  SettingsProvider,
} from '#/api/system/ai-settings';

import {
  computed,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue';
import { onBeforeRouteLeave } from 'vue-router';

import { useVbenDrawer, useVbenModal } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';

import {
  ElAlert,
  ElButton,
  ElCheckbox,
  ElEmpty,
  ElForm,
  ElFormItem,
  ElMessageBox,
  ElOption,
  ElSelect,
  ElTooltip,
} from 'element-plus';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  activateConfiguration,
  disableConfiguration,
  getConfiguration,
} from '#/api/system/ai-configuration';
import {
  getStoredCatalog,
  scanSavedModels,
} from '#/api/system/ai-model-catalog';
import {
  cancelHubModelTest,
  createHubModel,
  deleteHubModel,
  getHubModel,
  getHubModelSummary,
  getHubModelTest,
  listHubModels,
  setHubModelEnabled,
  startHubModelTest,
  updateHubModel,
} from '#/api/system/ai-model-hub';
import { aiErrorMessage } from '#/api/system/ai-runtime-errors';
import {
  getAiSettings,
  listAiSettings,
  settingsProviders,
} from '#/api/system/ai-settings';

import ChannelWorkspace from './ChannelWorkspace.vue';
import {
  hubModelChange,
  hubMutationMessage,
  mutationStatus,
} from './model-hub-state';
import ModelHubEditor from './ModelHubEditor.vue';
import ModelHubLayout from './ModelHubLayout.vue';
import ModelHubModel from './ModelHubModel.vue';
import ModelHubOverview from './ModelHubOverview.vue';
import ModelHubSupplier from './ModelHubSupplier.vue';

const emit = defineEmits<{ routing: [] }>();
const access = useAccessStore();
const can = (action: string) =>
  access.accessCodes.includes(`ai:config:${action}`);
const identity = computed(() =>
  JSON.stringify([access.accessToken, access.accessCodes]),
);
const view = ref<'models' | 'suppliers'>('models');
const query = ref('');
const selectedModelId = ref('');
const selectedChannelId = ref('');
const models = ref<HubModel[]>([]);
const summary = ref<HubModelSummary>();
const channels = ref<AiSettingsView[]>([]);
const providers = ref<SettingsProvider[]>([]);
const complete = ref(false);
const storedCatalogs = ref<Record<string, StoredCatalog>>({});
const catalogLoading = ref(false);
const catalogError = ref('');
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const message = ref('');
const editor = ref<InstanceType<typeof ChannelWorkspace>>();
const modelEditor = ref<InstanceType<typeof ModelHubEditor>>();
const modelEditorOpen = ref(false);
const editingModel = ref<HubModel>();
const editorError = ref('');
const routeEditorOpen = ref(false);
const editingRouteId = ref('');
const routeDraft = reactive({
  channelId: '',
  upstreamModel: '',
  enabled: true,
});
const pendingSave = ref<{ body: HubModelChange; modelId?: string }>();
const pendingToggle = ref<{
  body: {
    clientMutationId: string;
    enabled: boolean;
    expectedRevision: number;
  };
  modelId: string;
}>();
const unknown = ref(false);
const testOpen = ref(false);
const testModel = ref<HubModel>();
const testResult = ref<HubModelTest>();
const testError = ref('');
const testBusy = ref(false);
const testUnknown = ref(false);
let pendingTest:
  | undefined
  | {
      body: {
        clientMutationId: string;
        confirmedCosts: boolean;
        expectedRevision: number;
      };
      modelId: string;
    };
let requestId = '';
let generation = 0;
let selection = 0;
let catalogGeneration = 0;
let testGeneration = 0;
let pollTimer: ReturnType<typeof setTimeout> | undefined;
let alive = true;
const busy = computed(
  () =>
    loading.value ||
    saving.value ||
    unknown.value ||
    editor.value?.busy === true,
);
const selectedModel = computed(() =>
  models.value.find((model) => model.modelId === selectedModelId.value),
);
const selectedChannel = computed(() =>
  channels.value.find(
    (channel) => channel.configId === selectedChannelId.value,
  ),
);
const boundModelCount = computed(() => {
  const channelId = selectedChannel.value?.configId;
  if (!channelId) return 0;
  return models.value.filter((model) =>
    model.routes.some((route) => route.channelId === channelId),
  ).length;
});
const filteredModels = computed(() =>
  models.value.filter((model) =>
    `${model.name} ${model.slug}`
      .toLocaleLowerCase()
      .includes(query.value.trim().toLocaleLowerCase()),
  ),
);
const filteredChannels = computed(() =>
  channels.value.filter((channel) =>
    `${providerName(channel.provider)} ${channel.name}`
      .toLocaleLowerCase()
      .includes(query.value.trim().toLocaleLowerCase()),
  ),
);
const count = computed(() =>
  String(view.value === 'models' ? models.value.length : channels.value.length),
);
const routeChannel = computed(() =>
  channels.value.find((channel) => channel.configId === routeDraft.channelId),
);
const modalityLabels: Record<string, string> = {
  text: '文本',
  image: '图像',
  audio: '音频',
  video: '视频',
};
const sourceOptions = computed<HubSourceOption[]>(() => {
  const options = new Map<string, HubSourceOption>(
    channels.value.flatMap((channel) =>
      channel.models.map(
        (model) =>
          [
            model.code,
            { ...model, capabilities: '', contextWindow: '' },
          ] as const,
      ),
    ),
  );
  for (const stored of Object.values(storedCatalogs.value)) {
    const channel = channels.value.find(
      (item) => item.configId === stored.configId,
    );
    if (
      !channel ||
      channel.revision !== stored.revision ||
      !['FETCHED', 'PARTIAL'].includes(stored.state) ||
      !stored.sources.some((source) => source.current)
    )
      continue;
    for (const model of stored.catalog.records)
      options.set(model.code, {
        code: model.code,
        name: model.name,
        capabilities: model.inputModalities
          .map((modality) => modalityLabels[modality] ?? '')
          .filter(Boolean)
          .join(' / '),
        contextWindow:
          model.contextLength === null ? '' : String(model.contextLength),
      });
  }
  return [...options.values()];
});
const currentCatalog = computed(() =>
  selectedChannelId.value
    ? storedCatalogs.value[selectedChannelId.value]
    : undefined,
);
const testRunning = computed(() =>
  Boolean(
    testResult.value &&
    ['ACCEPTED', 'QUEUED', 'RUNNING'].includes(testResult.value.status),
  ),
);
function testStatus(status: string) {
  const labels: Record<string, string> = {
    QUEUED: '等待调用',
    ACCEPTED: '已受理',
    RUNNING: '调用中',
    SUCCEEDED: '调用成功',
    FAILED: '调用失败',
    CANCELLED: '已取消',
    TIMED_OUT: '调用超时',
    INTERRUPTED: '调用已中断',
    INCOMPLETE: '调用未完整完成',
  };
  return labels[status] ?? '状态待确认';
}
function switchReason(reason: string) {
  if (reason === 'FIRST') return '首次尝试';
  if (reason === 'NEXT_KEY') return '切换同模型 Key';
  if (reason === 'FALLBACK_MODEL') return '切换备用接入';
  return reason ? '已记录切换原因' : '—';
}
const canRouting = computed(
  () => can('query') && access.accessCodes.includes('ai:scene:query'),
);
function providerName(code: string) {
  return (
    providers.value.find((provider) => provider.code === code)?.name ?? code
  );
}

async function collectPages<T>(
  read: (page: number) => Promise<{ records: T[]; total: string }>,
  current: () => boolean,
) {
  const records: T[] = [];
  let total = 0n;
  for (let page = 1; page <= 50; page++) {
    if (!current()) throw new Error('Stale configuration read');
    const value = await read(page);
    records.push(...value.records);
    total = /^\d+$/.test(value.total)
      ? BigInt(value.total)
      : BigInt(records.length + 1);
    if (BigInt(records.length) >= total) return { records, complete: true };
    if (value.records.length === 0) break;
  }
  return { records, complete: false };
}
async function load() {
  if (!can('list')) return;
  const run = ++generation;
  loading.value = true;
  const results = await Promise.allSettled([
    collectPages(
      (pageNum) => listHubModels({ pageNum, pageSize: 20 }),
      () => alive && run === generation,
    ),
    collectPages(
      (pageNum) => listAiSettings({ pageNum, pageSize: 20 }),
      () => alive && run === generation,
    ),
    settingsProviders(),
    getHubModelSummary(),
  ] as const);
  if (!alive || run !== generation) return;
  const [modelResult, channelResult, providerResult] = results;
  if (results[3].status === 'fulfilled') summary.value = results[3].value;
  if (modelResult.status === 'fulfilled')
    models.value = modelResult.value.records;
  if (channelResult.status === 'fulfilled')
    channels.value = channelResult.value.records;
  if (providerResult.status === 'fulfilled')
    providers.value = providerResult.value;
  complete.value =
    modelResult.status === 'fulfilled' &&
    modelResult.value.complete &&
    channelResult.status === 'fulfilled' &&
    channelResult.value.complete;
  if (results.some((result) => result.status === 'rejected'))
    error.value = '部分配置读取失败，请重试；未读到的健康状态不计为可用。';
  loading.value = false;
}
function replaceModel(model: HubModel) {
  const index = models.value.findIndex(
    (item) => item.modelId === model.modelId,
  );
  if (index === -1) models.value.push(model);
  else models.value[index] = model;
}
async function refreshSummary() {
  const actor = identity.value;
  try {
    const value = await getHubModelSummary();
    if (alive && actor === identity.value) summary.value = value;
  } catch {
    if (alive && actor === identity.value)
      error.value = '模型配置已处理，汇总暂未刷新，请重新读取。';
  }
}
async function selectModel(id: string) {
  if (busy.value) return;
  if (id && !can('query')) {
    error.value = '当前无模型详情读取权限。';
    return;
  }
  view.value = 'models';
  selectedModelId.value = id;
  if (!id || !can('query')) return;
  const run = ++selection;
  try {
    const value = await getHubModel(id);
    if (alive && run === selection && selectedModelId.value === id)
      replaceModel(value);
  } catch {
    if (alive && run === selection)
      error.value = '模型详情暂未读到，请重新选择后重试。';
  }
}
async function selectSupplier(id: string) {
  if (busy.value) return;
  if (!can('query')) {
    error.value = '当前无渠道详情读取权限。';
    return;
  }
  view.value = 'suppliers';
  query.value = '';
  selectedChannelId.value = id;
  if (!can('query')) return;
  const run = ++selection;
  try {
    const value = await getAiSettings(id);
    if (!alive || run !== selection || selectedChannelId.value !== id) return;
    const index = channels.value.findIndex(
      (channel) => channel.configId === id,
    );
    if (index === -1) channels.value.push(value);
    else channels.value[index] = value;
    void readCatalog(id);
  } catch {
    if (alive && run === selection) error.value = '渠道详情暂未读到，请重试。';
  }
}
async function readCatalog(id: string, pageNum = 1) {
  if (!can('query')) return;
  const actor = identity.value;
  const run = ++catalogGeneration;
  catalogLoading.value = true;
  catalogError.value = '';
  try {
    const value = await getStoredCatalog(id, { pageNum, pageSize: 20 });
    if (alive && actor === identity.value && run === catalogGeneration)
      storedCatalogs.value[id] = value;
  } catch {
    if (alive && actor === identity.value && run === catalogGeneration)
      catalogError.value = '已保存模型目录暂未读到，请重试。';
  } finally {
    if (alive && actor === identity.value && run === catalogGeneration)
      catalogLoading.value = false;
  }
}
async function refreshCatalog() {
  const channel = selectedChannel.value;
  if (!channel || !can('test') || busy.value || catalogLoading.value) return;
  const keys = channel.keys.filter((key) => key.keyConfigured);
  if (keys.length === 0) {
    await editor.value?.open(channel, true);
    return;
  }
  const actor = identity.value;
  const run = ++catalogGeneration;
  catalogLoading.value = true;
  catalogError.value = '';
  let failures = 0;
  for (const key of keys) {
    if (!alive || actor !== identity.value || run !== catalogGeneration) return;
    try {
      await scanSavedModels({
        configId: channel.configId,
        expectedRevision: channel.revision,
        keyId: key.keyId,
        pageNum: 1,
        pageSize: 20,
      });
    } catch {
      failures++;
    }
  }
  if (!alive || actor !== identity.value || run !== catalogGeneration) return;
  await readCatalog(channel.configId);
  if (alive && actor === identity.value && failures)
    catalogError.value =
      '部分 Key 的目录未能获取，已保留读取到的结果；目录不代表连接验证。';
}
function changeView(next: 'models' | 'suppliers') {
  if (busy.value) return;
  selection++;
  query.value = '';
  view.value = next;
  if (next === 'suppliers' && !selectedChannelId.value && channels.value[0])
    void selectSupplier(channels.value[0].configId);
}
function openModel(model?: HubModel) {
  if (busy.value || !(model ? can('edit') : can('add'))) return;
  editingModel.value = model;
  editorError.value = '';
  modelEditorOpen.value = true;
}
async function closeModel() {
  if (saving.value) return false;
  const actor = identity.value;
  if (modelEditor.value?.hasUnsaved()) {
    try {
      await ElMessageBox.confirm(
        unknown.value
          ? '保存结果未确认，服务端可能已经保存。关闭后请重新读取状态。'
          : '模型设置尚有未保存内容，确认放弃？',
        '关闭模型设置',
        {
          confirmButtonText: '放弃并关闭',
          cancelButtonText: '继续编辑',
          type: 'warning',
        },
      );
    } catch {
      return false;
    }
  }
  if (!alive || actor !== identity.value) return false;
  pendingSave.value = undefined;
  unknown.value = false;
  modelEditorOpen.value = false;
  return true;
}
async function saveModel(body?: HubModelChange, modelId?: string) {
  const targetId = pendingSave.value?.modelId ?? modelId;
  if (
    saving.value ||
    (!can('edit') && Boolean(targetId)) ||
    (!can('add') && !targetId)
  )
    return false;
  if (!pendingSave.value) {
    if (!body) return false;
    pendingSave.value = { body, modelId };
  }
  const attempt = pendingSave.value;
  const actor = identity.value;
  saving.value = true;
  error.value = '';
  editorError.value = '';
  try {
    const value = attempt.modelId
      ? await updateHubModel(attempt.modelId, attempt.body)
      : await createHubModel(attempt.body);
    if (!alive || actor !== identity.value) return false;
    replaceModel(value);
    selectedModelId.value = value.modelId;
    view.value = 'models';
    pendingSave.value = undefined;
    unknown.value = false;
    modelEditorOpen.value = false;
    routeEditorOpen.value = false;
    message.value = '模型配置已保存。';
    void refreshSummary();
    return true;
  } catch (error_) {
    if (!alive || actor !== identity.value) return false;
    const status = mutationStatus(error_);
    unknown.value = !status || status >= 500;
    if (!unknown.value) pendingSave.value = undefined;
    const text = hubMutationMessage(error_);
    error.value = text;
    editorError.value = text;
    return false;
  } finally {
    if (alive && actor === identity.value) saving.value = false;
  }
}
async function toggleModel(enabled?: boolean) {
  if (saving.value || !can('enable')) return;
  if (!pendingToggle.value) {
    const model = selectedModel.value;
    if (!model || busy.value || enabled === undefined) return;
    pendingToggle.value = {
      modelId: model.modelId,
      body: {
        expectedRevision: model.revision,
        enabled,
        clientMutationId: crypto.randomUUID(),
      },
    };
  }
  const attempt = pendingToggle.value;
  const actor = identity.value;
  saving.value = true;
  try {
    const value = await setHubModelEnabled(attempt.modelId, attempt.body);
    if (!alive || actor !== identity.value) return;
    replaceModel(value);
    pendingToggle.value = undefined;
    unknown.value = false;
    message.value = value.enabled ? '模型已启用。' : '模型已停用。';
    void refreshSummary();
  } catch (error_) {
    if (!alive || actor !== identity.value) return;
    const status = mutationStatus(error_);
    unknown.value = !status || status >= 500;
    if (!unknown.value) pendingToggle.value = undefined;
    error.value = hubMutationMessage(error_);
  } finally {
    if (alive && actor === identity.value) saving.value = false;
  }
}
function retryMutation() {
  if (pendingToggle.value) void toggleModel();
  else void saveModel();
}
function saveMetadata(value: ModelMetadata) {
  if (unknown.value) {
    void saveModel();
    return;
  }
  if (!/^[a-z0-9][a-z0-9._:-]{0,79}$/.test(value.slug)) {
    editorError.value =
      '调用名称只支持小写字母、数字、点、短横线、下划线和冒号。';
    return;
  }
  const model = editingModel.value;
  const body: HubModelChange = {
    ...(model
      ? hubModelChange(model)
      : { strategy: 'PRIORITY' as const, fallback: true, routes: [] }),
    ...value,
    clientMutationId: crypto.randomUUID(),
  };
  void saveModel(body, model?.modelId);
}
function mutateModel(change: Partial<HubModelChange>) {
  const model = selectedModel.value;
  if (!model || busy.value || !can('edit')) return;
  void saveModel(
    {
      ...hubModelChange(model),
      ...change,
      clientMutationId: crypto.randomUUID(),
    },
    model.modelId,
  );
}
async function removeModel() {
  const model = editingModel.value;
  if (!model || busy.value || !can('edit')) return;
  const actor = identity.value;
  try {
    await ElMessageBox.confirm(
      `删除 ${model.name} 及其供应商绑定？渠道与 Key 会保留。`,
      '删除模型',
      {
        confirmButtonText: '确认删除',
        cancelButtonText: '保留',
        type: 'warning',
      },
    );
  } catch {
    return;
  }
  if (!alive || actor !== identity.value) return;
  saving.value = true;
  try {
    await deleteHubModel(model.modelId, model.revision);
    if (!alive || actor !== identity.value) return;
    models.value = models.value.filter(
      (item) => item.modelId !== model.modelId,
    );
    selectedModelId.value = '';
    modelEditorOpen.value = false;
    message.value = '模型已删除。';
    void refreshSummary();
  } catch (error_) {
    if (alive && actor === identity.value)
      editorError.value =
        mutationStatus(error_) && mutationStatus(error_) !== 500
          ? hubMutationMessage(error_)
          : '删除结果尚未确认，请关闭后重新读取模型状态。';
  } finally {
    if (alive && actor === identity.value) saving.value = false;
  }
}
function openRoute(routeId = '') {
  if (busy.value || !can('edit')) return;
  if (!routeId && (selectedModel.value?.routes.length ?? 0) >= 16) {
    error.value = '每个模型最多配置 16 个供应商接入。';
    return;
  }
  const route = selectedModel.value?.routes.find(
    (item) => item.routeId === routeId,
  );
  editingRouteId.value = routeId;
  routeDraft.channelId = route?.channelId ?? '';
  routeDraft.upstreamModel = route?.upstreamModel ?? '';
  routeDraft.enabled = route?.enabled ?? true;
  routeEditorOpen.value = true;
}
function saveRoute() {
  const model = selectedModel.value;
  if (
    !model ||
    !routeDraft.channelId ||
    !routeDraft.upstreamModel ||
    busy.value
  )
    return;
  if (
    !routeChannel.value?.models.some(
      (item) => item.code === routeDraft.upstreamModel,
    )
  ) {
    error.value = '请先为该渠道 Key 配置所选上游模型。';
    return;
  }
  const routes = hubModelChange(model).routes;
  const values = { ...routeDraft };
  if (
    routes.some(
      (route) =>
        route.routeId !== editingRouteId.value &&
        route.channelId === values.channelId &&
        route.upstreamModel === values.upstreamModel,
    )
  ) {
    error.value = '当前模型已配置相同渠道与上游模型。';
    return;
  }
  const index = routes.findIndex(
    (route) => route.routeId === editingRouteId.value,
  );
  if (index === -1) {
    routes.push(values);
  } else {
    routes[index] = { ...values, routeId: editingRouteId.value };
  }
  mutateModel({ routes });
}
function moveRoute(index: number, direction: number) {
  const model = selectedModel.value;
  if (!model) return;
  const routes = hubModelChange(model).routes;
  const next = index + direction;
  const route = routes[index];
  const other = routes[next];
  if (!route || !other) return;
  routes[index] = other;
  routes[next] = route;
  mutateModel({ routes });
}
function toggleRoute(routeId: string, enabled: boolean) {
  const model = selectedModel.value;
  if (model)
    mutateModel({
      routes: hubModelChange(model).routes.map((route) =>
        route.routeId === routeId ? { ...route, enabled } : route,
      ),
    });
}
async function removeRoute(routeId: string) {
  const model = selectedModel.value;
  if (!model || busy.value) return;
  const actor = identity.value;
  try {
    await ElMessageBox.confirm(
      '从本模型中移除此供应商？渠道与 Key 会保留。',
      '移除供应商',
      { confirmButtonText: '移除', cancelButtonText: '保留', type: 'warning' },
    );
  } catch {
    return;
  }
  if (!alive || actor !== identity.value) return;
  if (
    selectedModel.value?.modelId === model.modelId &&
    selectedModel.value.revision === model.revision
  )
    mutateModel({
      routes: hubModelChange(model).routes.filter(
        (route) => route.routeId !== routeId,
      ),
    });
}
async function toggleChannel(enabled: boolean) {
  const channel = selectedChannel.value;
  if (!channel || busy.value || !can('enable')) return;
  const actor = identity.value;
  saving.value = true;
  try {
    const configuration = await getConfiguration(channel.configId);
    if (!alive || actor !== identity.value) return;
    await (enabled
      ? activateConfiguration(channel.configId, {
          revision: configuration.revision,
          configVersion: configuration.draft.configVersion,
          onlyAvailable: true,
        })
      : disableConfiguration(channel.configId, configuration.revision));
    if (alive && actor === identity.value) await load();
  } catch {
    if (alive && actor === identity.value)
      error.value = '渠道操作结果未确认，请重新读取状态。';
  } finally {
    if (alive && actor === identity.value) saving.value = false;
  }
}
function openTest(model: HubModel) {
  if (!can('test') || busy.value) return;
  testGeneration++;
  clearTimeout(pollTimer);
  testModel.value = model;
  testResult.value = undefined;
  testError.value = '';
  pendingTest = undefined;
  requestId = '';
  testBusy.value = false;
  testUnknown.value = false;
  testOpen.value = true;
}
async function pollTest(run = testGeneration) {
  const model = testModel.value;
  if (!model || !requestId) return;
  clearTimeout(pollTimer);
  try {
    const result = await getHubModelTest(model.modelId, requestId);
    if (!alive || run !== testGeneration || !testOpen.value) return;
    if (result.requestId !== requestId) {
      testError.value = '原测试状态尚未确认，请重新查询。';
      return;
    }
    testResult.value = result;
    if (['ACCEPTED', 'QUEUED', 'RUNNING'].includes(result.status)) {
      if (!result.deadline || Date.now() < Date.parse(result.deadline))
        pollTimer = setTimeout(() => void pollTest(run), 1200);
      else testError.value = '已到测试期限，请查询原状态。';
    }
  } catch {
    if (alive && run === testGeneration)
      testError.value = '测试状态暂未读到，可查询原状态；不会重新发起调用。';
  }
}
async function runTest() {
  const model = testModel.value;
  if (!model || !can('test') || testBusy.value || testRunning.value) return;
  pendingTest ??= {
    modelId: model.modelId,
    body: {
      expectedRevision: model.revision,
      confirmedCosts: true,
      clientMutationId: crypto.randomUUID(),
    },
  };
  const attempt = pendingTest;
  const run = testGeneration;
  testBusy.value = true;
  testError.value = '';
  try {
    const result = await startHubModelTest(attempt.modelId, attempt.body);
    if (!alive || run !== testGeneration || !testOpen.value) return;
    requestId = result.requestId;
    testResult.value = result;
    testUnknown.value = false;
    pendingTest = undefined;
    await pollTest(run);
  } catch (error_) {
    if (!alive || run !== testGeneration) return;
    const status = mutationStatus(error_);
    testUnknown.value = !status || status >= 500;
    if (!testUnknown.value) pendingTest = undefined;
    testError.value = testUnknown.value
      ? '测试受理未确认，可重试原请求。'
      : '测试未能受理，请检查模型状态与当前权限。';
  } finally {
    if (alive && run === testGeneration) testBusy.value = false;
  }
}
async function cancelTest() {
  const model = testModel.value;
  if (!model || !requestId || testBusy.value || !can('test')) return;
  const run = testGeneration;
  testBusy.value = true;
  clearTimeout(pollTimer);
  try {
    const result = await cancelHubModelTest(model.modelId, requestId);
    if (!alive || run !== testGeneration || !testOpen.value) return;
    if (result.requestId === requestId) testResult.value = result;
    await pollTest(run);
  } catch {
    if (alive && run === testGeneration)
      testError.value = '取消尚未确认，请查询原测试状态。';
  } finally {
    if (alive && run === testGeneration) testBusy.value = false;
  }
}
async function closeTest() {
  if (testBusy.value) return false;
  const run = testGeneration;
  if (testUnknown.value) {
    try {
      await ElMessageBox.confirm(
        '测试受理尚未确认。关闭不会取消已受理请求，请先保留原请求的查询信息。',
        '关闭测试',
        {
          confirmButtonText: '关闭',
          cancelButtonText: '继续查询',
          type: 'warning',
        },
      );
    } catch {
      return false;
    }
  }
  if (!alive || run !== testGeneration) return false;
  testGeneration++;
  clearTimeout(pollTimer);
  testOpen.value = false;
  return true;
}
async function leave() {
  if (saving.value || testBusy.value) return false;
  const actor = identity.value;
  if (unknown.value && !modelEditorOpen.value) {
    try {
      await ElMessageBox.confirm(
        '配置保存结果尚未确认，服务端可能已经保存。离开后请重新读取状态。',
        '离开配置',
        {
          confirmButtonText: '离开',
          cancelButtonText: '留在当前页',
          type: 'warning',
        },
      );
    } catch {
      return false;
    }
  }
  if (!alive || actor !== identity.value) return false;
  if (testOpen.value && !(await closeTest())) return false;
  if (!(await closeModel())) return false;
  if (editor.value?.isOpen && !(await editor.value.requestClose()))
    return false;
  return true;
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (
    saving.value ||
    unknown.value ||
    modelEditor.value?.hasUnsaved() ||
    testUnknown.value
  ) {
    event.preventDefault();
    event.returnValue = '';
  }
}
async function showRouting() {
  if (await leave()) emit('routing');
}
onBeforeRouteLeave(leave);
watch(identity, () => {
  generation++;
  selection++;
  testGeneration++;
  catalogGeneration++;
  clearTimeout(pollTimer);
  models.value = [];
  channels.value = [];
  providers.value = [];
  summary.value = undefined;
  storedCatalogs.value = {};
  catalogLoading.value = false;
  catalogError.value = '';
  modelEditorOpen.value = false;
  routeEditorOpen.value = false;
  testOpen.value = false;
  pendingSave.value = undefined;
  pendingToggle.value = undefined;
  pendingTest = undefined;
  saving.value = false;
  unknown.value = false;
  loading.value = false;
  selectedModelId.value = '';
  selectedChannelId.value = '';
  error.value = '';
  message.value = '';
  if (can('list')) void load();
});
onMounted(() => {
  window.addEventListener('beforeunload', beforeUnload);
  void load();
});
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', beforeUnload);
  alive = false;
  generation++;
  selection++;
  testGeneration++;
  catalogGeneration++;
  clearTimeout(pollTimer);
  pendingTest = undefined;
  pendingSave.value = undefined;
});
const [RouteModal, routeModalApi] = useVbenModal({
  onBeforeClose: () => !saving.value,
  onOpenChange: (open) => {
    routeEditorOpen.value = open;
  },
});
watch(routeEditorOpen, (open) => routeModalApi.setState({ isOpen: open }), {
  immediate: true,
});
const [TestDrawer, testDrawerApi] = useVbenDrawer({ onBeforeClose: closeTest });
watch(testOpen, (open) => testDrawerApi.setState({ isOpen: open }), {
  immediate: true,
});
const [AttemptsGrid, attemptsGridApi] = useVbenVxeGrid<
  HubModelTest['attempts'][number]
>({
  gridOptions: {
    columns: [
      { title: '次序', width: 65, field: 'number', sortable: true },
      { title: '供应商 / 模型', minWidth: 160, slots: { default: 'cell1' } },
      { title: '状态', minWidth: 100, slots: { default: 'cell2' } },
      { title: '切换记录', minWidth: 120, slots: { default: 'cell3' } },
      { title: '耗时', width: 90, slots: { default: 'cell4' } },
    ],
    pagerConfig: { enabled: false },
    proxyConfig: { enabled: false },
    toolbarConfig: { custom: true },
  },
});
watch(
  () => testResult.value?.attempts ?? [],
  (data) => attemptsGridApi.setGridOptions({ data }),
  { immediate: true },
);
</script>

<template>
  <ModelHubLayout
    :view="view"
    :query="query"
    :count="count"
    :can-add-channel="can('add')"
    :can-add-model="can('add')"
    :busy="busy"
    @select-view="changeView"
    @search="query = $event"
    @add-channel="editor?.open()"
    @add-model="openModel()"
  >
    <template #header-actions>
      <ElButton v-if="canRouting" link :disabled="busy" @click="showRouting">
        场景调用顺序
      </ElButton>
      <ElButton :loading="loading" :disabled="busy" @click="load">
        刷新
      </ElButton>
    </template>
    <template #sidebar>
      <template v-if="view === 'models'">
        <button
          type="button"
          class="hub-list-item hub-summary-item"
          :class="{ active: !selectedModelId }"
          :aria-pressed="!selectedModelId"
          :disabled="busy"
          @click="selectModel('')"
        >
          <span class="hub-list-icon" aria-hidden="true">▦</span>
          <span>
            <strong>汇总</strong>
            <small>模型状态与接入保障</small>
          </span>
        </button>
        <button
          v-for="model in filteredModels"
          :key="model.modelId"
          type="button"
          class="hub-list-item"
          :class="{ active: selectedModelId === model.modelId }"
          :aria-pressed="selectedModelId === model.modelId"
          :disabled="busy"
          @click="selectModel(model.modelId)"
        >
          <span class="hub-list-icon" aria-hidden="true">◇</span>
          <span>
            <strong>{{ model.name }}</strong>
            <small>
              {{ model.routes.length }} 个接入 ·
              {{ model.contextWindow || '上下文未填写' }}
            </small>
          </span>
          <i
            :class="{
              off: !model.enabled,
              ready: model.enabled && model.health.ready,
            }"
            :aria-label="
              model.enabled && model.health.ready ? '可调用' : '未就绪'
            "
          ></i>
        </button>
      </template>
      <template v-else>
        <button
          v-for="channel in filteredChannels"
          :key="channel.configId"
          type="button"
          class="hub-list-item"
          :class="{ active: selectedChannelId === channel.configId }"
          :aria-pressed="selectedChannelId === channel.configId"
          :disabled="busy"
          @click="selectSupplier(channel.configId)"
        >
          <span class="hub-list-icon" aria-hidden="true">↔</span>
          <span>
            <strong>{{ providerName(channel.provider) }}</strong>
            <small>
              {{ channel.name }} · {{ channel.models.length }} 个模型
            </small>
          </span>
          <i
            :class="{
              off: !channel.active,
              ready:
                channel.active &&
                ['SUCCEEDED', 'PARTIAL'].includes(
                  channel.connection?.status ?? '',
                ),
            }"
          ></i>
        </button>
      </template>
    </template>
    <template #sidebar-footer>
      {{ count }} 个{{ view === 'models' ? '模型' : '渠道' }} ·
      {{
        view === 'models'
          ? models.filter((model) => model.enabled).length
          : channels.filter((channel) => channel.active).length
      }}
      个已启用{{ complete ? '' : '（已读取）' }}
    </template>
    <ElAlert
      v-if="error"
      :title="error"
      type="error"
      closable
      @close="error = ''"
    />
    <ElAlert
      v-if="message"
      :title="message"
      type="success"
      closable
      @close="message = ''"
    />
    <div v-if="unknown && !modelEditorOpen" class="hub-recovery">
      <ElButton type="primary" :loading="saving" @click="retryMutation">
        重试原保存
      </ElButton>
      <ElButton
        :disabled="saving"
        @click="
          pendingSave = undefined;
          pendingToggle = undefined;
          unknown = false;
          load();
        "
      >
        重新读取状态
      </ElButton>
    </div>
    <ModelHubOverview
      v-if="view === 'models' && !selectedModelId"
      :models="models"
      :summary="summary"
      :channels="channels"
      :complete="complete"
      :can-add-model="can('add')"
      @add-model="openModel()"
      @select-model="selectModel"
      @select-supplier="selectSupplier"
      @suppliers="changeView('suppliers')"
      @test-model="
        (id) => {
          const model = models.find((item) => item.modelId === id);
          if (model) openTest(model);
        }
      "
    />
    <ModelHubModel
      v-else-if="view === 'models' && selectedModel"
      :model="selectedModel"
      :channels="channels"
      :providers="providers"
      :can-edit="can('edit')"
      :can-enable="can('enable')"
      :can-test="can('test')"
      :busy="busy"
      @edit="openModel(selectedModel)"
      @toggle="toggleModel"
      @strategy="mutateModel({ strategy: $event })"
      @fallback="mutateModel({ fallback: $event })"
      @add-route="openRoute()"
      @edit-route="openRoute"
      @remove-route="removeRoute"
      @move="moveRoute"
      @route-enabled="toggleRoute"
      @test="openTest(selectedModel)"
    />
    <ModelHubSupplier
      v-else-if="view === 'suppliers' && selectedChannel"
      :channel="selectedChannel"
      :provider-name="providerName(selectedChannel.provider)"
      :bound-models="boundModelCount"
      :can-edit="can('edit')"
      :can-enable="can('enable')"
      :can-scan="can('test')"
      :can-test="can('test')"
      :busy="busy"
      :catalog="currentCatalog?.catalog"
      :catalog-stale="currentCatalog?.state === 'STALE'"
      :catalog-loading="catalogLoading"
      :catalog-error="catalogError"
      @configure="editor?.open(selectedChannel)"
      @configure-keys="editor?.open(selectedChannel, true)"
      @scan="refreshCatalog"
      @test="editor?.open(selectedChannel)"
      @toggle="toggleChannel"
    />
    <ElEmpty
      v-else
      :description="loading ? '正在读取配置' : '请选择模型或添加供应商渠道'"
      :image-size="64"
    />
  </ModelHubLayout>
  <ChannelWorkspace ref="editor" editor-only @changed="load" />
  <ModelHubEditor
    ref="modelEditor"
    :open="modelEditorOpen"
    :model="editingModel"
    :sources="sourceOptions"
    :busy="saving"
    :unknown="unknown"
    :error="editorError"
    @save="saveMetadata"
    @close="closeModel"
    @remove="removeModel"
    @suppliers="
      async () => {
        if (await closeModel()) changeView('suppliers');
      }
    "
  />
  <RouteModal
    :title="editingRouteId ? '编辑供应商' : '添加供应商'"
    class="w-full max-w-[560px]"
    :close-on-click-modal="false"
    :close-on-press-escape="!saving"
  >
    <p class="hub-dialog-model">
      {{ selectedModel?.name }}
      <code>{{ selectedModel?.slug }}</code>
    </p>
    <ElForm label-position="top" :disabled="saving || unknown">
      <ElFormItem label="接入渠道" required>
        <ElSelect
          v-model="routeDraft.channelId"
          aria-label="业务模型接入渠道"
          filterable
          @change="routeDraft.upstreamModel = ''"
        >
          <ElOption
            v-for="channel in channels"
            :key="channel.configId"
            :value="channel.configId"
            :label="`${providerName(channel.provider)} · ${channel.name}`"
          />
        </ElSelect>
      </ElFormItem>
      <ElFormItem label="上游模型" required>
        <ElSelect
          v-model="routeDraft.upstreamModel"
          aria-label="供应商上游模型"
          filterable
        >
          <ElOption
            v-for="model in routeChannel?.models ?? []"
            :key="model.code"
            :value="model.code"
            :label="`${model.name} — ${model.code}`"
          />
        </ElSelect>
      </ElFormItem>
      <p v-if="routeChannel" class="hub-dialog-help">
        {{ routeChannel.endpointUrl }} ·
        {{ routeChannel.active ? '渠道已启用' : '渠道未启用' }}
      </p>
      <ElCheckbox v-model="routeDraft.enabled">启用此供应商</ElCheckbox>
    </ElForm>
    <ElAlert v-if="error" :title="error" type="error" :closable="false" />
    <template #footer>
      <ElButton :disabled="saving" @click="routeEditorOpen = false">
        取消
      </ElButton>
      <ElButton
        type="primary"
        :loading="saving"
        :disabled="
          saving ||
          (!unknown && (!routeDraft.channelId || !routeDraft.upstreamModel))
        "
        @click="unknown ? saveModel() : saveRoute()"
      >
        {{ unknown ? '重试原保存' : '保存配置' }}
      </ElButton>
    </template>
  </RouteModal>
  <TestDrawer
    title="测试调用"
    class="w-full max-w-[620px]"
    :close-on-click-modal="false"
  >
    <h2 class="hub-test-name">{{ testModel?.name }}</h2>
    <p class="hub-dialog-help">调用名称 {{ testModel?.slug }}</p>
    <ElAlert
      v-if="testError"
      :title="testError"
      type="warning"
      :closable="false"
    />
    <dl v-if="testResult" class="hub-test-result">
      <div>
        <dt>真实请求状态</dt>
        <dd>{{ testStatus(testResult.status) }}</dd>
      </div>
      <div>
        <dt>已尝试次数</dt>
        <dd>{{ testResult.attemptCount }}</dd>
      </div>
    </dl>
    <AttemptsGrid v-if="testResult?.attempts?.length">
      <template #cell1="{ row }">
        <strong>
          {{
            row.providerCode ? providerName(row.providerCode) : '未记录供应商'
          }}
        </strong>
        <small>{{ row.upstreamModel || '未记录模型' }}</small>
      </template>
      <template #cell2="{ row }">
        {{ testStatus(row.status) }}
        <small v-if="row.errorCode">
          {{ aiErrorMessage(row.errorCode) }}
        </small>
      </template>
      <template #cell3="{ row }">
        {{ switchReason(row.switchReason) }}
      </template>
      <template #cell4="{ row }">
        {{ row.elapsedMs === null ? '未记录' : `${row.elapsedMs} ms` }}
      </template>
    </AttemptsGrid>
    <p v-if="!testResult" class="hub-dialog-help">
      使用当前模型已保存的供应商顺序与策略进行真实调用。
    </p>
    <p class="hub-dialog-help">
      关闭面板不会取消已受理的测试；需要停止时请点击“取消测试”。
    </p>
    <template #footer>
      <ElButton :disabled="testBusy" @click="closeTest">关闭</ElButton>
      <ElButton v-if="testRunning" :disabled="testBusy" @click="cancelTest">
        取消测试
      </ElButton>
      <ElButton v-if="testResult" :disabled="testBusy" @click="pollTest()">
        查询原状态
      </ElButton>
      <ElTooltip content="点击将真实调用模型，可能产生费用。">
        <ElButton
          type="primary"
          :loading="testBusy"
          :disabled="testBusy || testRunning"
          @click="runTest"
        >
          {{ testUnknown ? '重试原测试请求' : '开始测试' }}
        </ElButton>
      </ElTooltip>
    </template>
  </TestDrawer>
</template>

<style scoped>
.hub-list-item {
  position: relative;
  display: flex;
  gap: 12px;
  align-items: center;
  width: 100%;
  min-width: 0;
  padding: 15px 10px;
  margin-bottom: 5px;
  text-align: left;
  border: 1px solid transparent;
  border-radius: 7px;
}

.hub-list-item.active {
  background: hsl(var(--primary) / 7%);
  border-color: hsl(var(--primary) / 24%);
}

.hub-list-item.active::before {
  position: absolute;
  top: 22px;
  bottom: 22px;
  left: -1px;
  width: 3px;
  content: '';
  background: hsl(var(--primary));
  border-radius: 0 2px 2px 0;
}

.hub-list-item > span:nth-child(2) {
  flex: 1;
  min-width: 0;
}

.hub-list-item strong,
.hub-list-item small {
  display: block;
  overflow-wrap: anywhere;
}

.hub-list-item strong {
  font-size: 13px;
  font-weight: 500;
}

.hub-list-item small {
  margin-top: 5px;
  font-size: 11px;
  color: hsl(var(--muted-foreground));
}

.hub-list-icon {
  display: grid;
  flex: 0 0 30px;
  place-items: center;
  width: 30px;
  height: 30px;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--muted) / 30%);
  border: 1px solid hsl(var(--border));
  border-radius: 7px;
}

.hub-list-item.active .hub-list-icon {
  color: var(--hub-accent, hsl(var(--primary)));
  background: hsl(var(--primary) / 8%);
}

.hub-list-item > i {
  width: 5px;
  height: 5px;
  background: hsl(var(--warning));
  border-radius: 50%;
}

.hub-list-item > i.off {
  background: hsl(var(--muted-foreground));
}

.hub-list-item > i.ready {
  background: hsl(var(--success));
}

.hub-summary-item {
  margin-bottom: 18px;
}

.hub-recovery {
  display: flex;
  gap: 12px;
  margin: 12px 0;
}

.hub-dialog-model {
  margin-bottom: 22px;
  font-weight: 500;
}

.hub-dialog-model code {
  margin-left: 10px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.hub-dialog-help {
  margin: 12px 0;
  font-size: 12px;
  line-height: 1.8;
  color: hsl(var(--muted-foreground));
  overflow-wrap: anywhere;
}

.hub-test-name {
  font-size: 18px;
  font-weight: 600;
}

.hub-test-result {
  display: flex;
  gap: 32px;
  margin-top: 20px;
}

.hub-test-result dt {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.hub-test-result dd {
  margin: 8px 0 0;
}

.hub-test-attempts {
  margin-top: 24px;
  font-size: 12px;
}

.hub-test-attempts strong {
  font-weight: 500;
}

.hub-test-attempts small {
  display: block;
  margin-top: 5px;
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  overflow-wrap: anywhere;
}
</style>
