<script setup lang="ts">
import type { ChannelKeyDraft } from './channel-state';

import type {
  CatalogModel,
  ModelCatalogPage,
} from '#/api/system/ai-model-catalog';
import type {
  AiSettingsChange,
  AiSettingsView,
  ConnectionStatus,
  SettingsProvider,
  SettingsTestRun,
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

import { useAccessStore } from '@vben/stores';

import {
  ElAlert,
  ElButton,
  ElCheckbox,
  ElDrawer,
  ElEmpty,
  ElForm,
  ElFormItem,
  ElInput,
  ElMessageBox,
  ElOption,
  ElPagination,
  ElPopconfirm,
  ElSelect,
  ElTable,
  ElTableColumn,
  ElTag,
} from 'element-plus';

import {
  activateConfiguration,
  disableConfiguration,
  getConfiguration,
} from '#/api/system/ai-configuration';
import {
  catalogError,
  scanDraftModels,
  scanSavedModels,
} from '#/api/system/ai-model-catalog';
import {
  createAiSettings,
  getAiSettings,
  getAiSettingsTest,
  listAiSettings,
  settingsProviders,
  testAiSettings,
  updateAiSettings,
} from '#/api/system/ai-settings';

import {
  channelDraft,
  channelError,
  channelKey,
  channelMetadata,
  channelPayload,
} from './channel-state';

const access = useAccessStore();
const can = (action: string) =>
  access.accessCodes.includes(`ai:config:${action}`) ||
  (['add', 'edit', 'list', 'query', 'test'].includes(action) &&
    access.accessCodes.includes(`ai:model:${action}`));
const rows = ref<AiSettingsView[]>([]);
const providers = ref<SettingsProvider[]>([]);
const current = ref<AiSettingsView>();
const form = reactive(channelDraft());
const baseline = ref('');
const query = ref('');
const page = ref(1);
const total = ref('0');
const loading = ref(false);
const busy = ref(false);
const editorOpen = ref(false);
const confirmedCosts = ref(false);
const saveUnconfirmed = ref(false);
const error = ref('');
const message = ref('');
const test = ref<SettingsTestRun>();
interface KeyCatalog {
  filteredCount?: number;
  error: string;
  generation: number;
  labels: Record<string, CatalogModel>;
  loading: boolean;
  page: number;
  records: CatalogModel[];
  refreshedAt: string;
  request: number;
  search: string;
  seenCodes: Set<string>;
  source: string;
  status: 'ERROR' | 'READY' | 'STALE' | 'UNSCANNED';
  total: number;
}
const catalogs = reactive<Record<string, KeyCatalog>>({});
const catalogTimers = new Map<string, ReturnType<typeof setTimeout>>();
const catalogControllers = new Map<string, AbortController>();
const readonly = computed(
  () =>
    busy.value ||
    saveUnconfirmed.value ||
    !(current.value ? can('edit') : can('add')),
);
const dirty = computed(
  () =>
    channelMetadata(form) !== baseline.value ||
    form.keys.some((key) => key.apiKey !== ''),
);
function modelChoices(key: ChannelKeyDraft): CatalogModel[] {
  const state = getCatalog(key);
  const choices = new Map<string, string>();
  for (const model of state.records) choices.set(model.code, model.name);
  const search = state.search.trim().toLocaleLowerCase();
  for (const sibling of form.keys) {
    if (sibling.localId === key.localId) continue;
    const catalog = getCatalog(sibling);
    for (const code of sibling.modelCodes) {
      const name =
        catalog.labels[code]?.name ??
        current.value?.models.find((model) => model.code === code)?.name ??
        code;
      if (!search || `${code} ${name}`.toLocaleLowerCase().includes(search))
        choices.set(code, name);
    }
  }
  for (const code of key.modelCodes)
    if (!choices.has(code))
      choices.set(
        code,
        state.labels[code]?.name ??
          current.value?.models.find((model) => model.code === code)?.name ??
          code,
      );
  return [...choices].map(
    ([code, name]) =>
      state.labels[code] ?? {
        code,
        name,
        contextLength: null,
        maxCompletionTokens: null,
        inputModalities: [],
        outputModalities: [],
        supportedParameters: [],
      },
  );
}
const notice = computed(() => {
  if (error.value) return { text: error.value, type: 'error' as const };
  if (message.value) return { text: message.value, type: 'success' as const };
  return undefined;
});
function dismissNotice() {
  error.value = '';
  message.value = '';
}
function getCatalog(key: ChannelKeyDraft): KeyCatalog {
  return (catalogs[key.localId] ??= {
    error: '',
    generation: 0,
    labels: {},
    loading: false,
    page: 1,
    records: [],
    refreshedAt: '',
    request: 0,
    search: '',
    seenCodes: new Set(),
    source: '',
    status: 'UNSCANNED',
    total: 0,
  });
}
function invalidateCatalog(key: ChannelKeyDraft) {
  const previous = getCatalog(key);
  catalogControllers.get(key.localId)?.abort();
  clearTimeout(catalogTimers.get(key.localId));
  const labels = Object.fromEntries(
    key.modelCodes.flatMap((code) =>
      previous.labels[code] ? [[code, previous.labels[code]]] : [],
    ),
  );
  catalogs[key.localId] = {
    ...previous,
    filteredCount: undefined,
    generation: previous.generation + 1,
    error: '',
    labels,
    loading: false,
    page: 1,
    records: [],
    refreshedAt: '',
    request: previous.request + 1,
    search: '',
    seenCodes: new Set(),
    source: '',
    status: key.modelCodes.length > 0 ? 'STALE' : 'UNSCANNED',
    total: 0,
  };
}
function resetCatalogs() {
  for (const controller of catalogControllers.values()) controller.abort();
  catalogControllers.clear();
  for (const timer of catalogTimers.values()) clearTimeout(timer);
  catalogTimers.clear();
  for (const id of Object.keys(catalogs)) delete catalogs[id];
}
function changeProvider() {
  form.endpointUrl =
    providers.value.find((provider) => provider.code === form.provider)
      ?.defaultEndpoint ?? form.endpointUrl;
  for (const key of form.keys) {
    key.apiKey = '';
    invalidateCatalog(key);
  }
}
function removeKey(index: number) {
  const key = form.keys[index];
  if (!key || readonly.value || form.keys.length <= 1) return;
  invalidateCatalog(key);
  delete catalogs[key.localId];
  form.keys.splice(index, 1);
}
function keyPending(key: ChannelKeyDraft) {
  const original = current.value?.keys.find((item) => item.keyId === key.keyId);
  return (
    !original ||
    Boolean(key.apiKey) ||
    JSON.stringify(original.modelCodes) !== JSON.stringify(key.modelCodes)
  );
}
const statusLabels: Record<ConnectionStatus, string> = {
  CANCELLED: '已取消',
  FAILED: '连接失败',
  INTERRUPTED: '已中断',
  NOT_TESTED: '待测试',
  PARTIAL: '部分可用',
  QUEUED: '等待测试',
  RUNNING: '正在测试',
  SUCCEEDED: '可用',
};
let alive = true;
let selection = 0;
let listGeneration = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let pendingSave:
  | undefined
  | { body: AiSettingsChange; configId: null | string };
let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(query, () => {
  page.value = 1;
  listGeneration++;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => void load(), 300);
});
function label(status?: ConnectionStatus) {
  return statusLabels[status ?? 'NOT_TESTED'];
}
function tone(
  status?: ConnectionStatus,
): 'danger' | 'info' | 'success' | 'warning' {
  if (status === 'SUCCEEDED') return 'success';
  if (status === 'FAILED') return 'danger';
  if (status === 'PARTIAL' || status === 'INTERRUPTED') return 'warning';
  return 'info';
}
function canScan(key: ChannelKeyDraft) {
  if (busy.value || saveUnconfirmed.value) return false;
  return key.apiKey.trim()
    ? can('add') || can('edit') || can('test')
    : Boolean(current.value && key.keyId && can('test'));
}
function keyCount(row: AiSettingsView) {
  return (row.keys ?? []).filter((key) =>
    key.models.some((model) => model.status === 'SUCCEEDED'),
  ).length;
}
function clearSecrets() {
  for (const key of form.keys) key.apiKey = '';
}
function apply(value?: AiSettingsView) {
  pendingSave = undefined;
  resetCatalogs();
  clearSecrets();
  current.value = value;
  Object.assign(form, channelDraft(value));
  baseline.value = channelMetadata(form);
  confirmedCosts.value = false;
  saveUnconfirmed.value = false;
  test.value = undefined;
  error.value = '';
  message.value = '';
}
async function load() {
  if (!can('list')) return;
  clearTimeout(searchTimer);
  const run = ++listGeneration;
  loading.value = true;
  try {
    const result = await listAiSettings({
      pageNum: page.value,
      pageSize: 20,
      search: query.value.trim() || undefined,
    });
    if (alive && run === listGeneration) {
      rows.value = result.records;
      total.value = result.total;
    }
  } catch {
    if (alive && run === listGeneration)
      error.value = '渠道列表读取失败，请重试。';
  } finally {
    if (alive && run === listGeneration) loading.value = false;
  }
}
async function open(value?: AiSettingsView) {
  if (
    busy.value ||
    (saveUnconfirmed.value && !value) ||
    (!value && !can('add'))
  )
    return;
  const run = ++selection;
  clearTimeout(timer);
  busy.value = true;
  try {
    const detail =
      value && can('query') ? await getAiSettings(value.configId) : value;
    if (!alive || run !== selection) return;
    apply(detail);
    editorOpen.value = true;
    const connection = detail?.connection;
    if (
      detail &&
      connection?.testId &&
      ['QUEUED', 'RUNNING'].includes(connection.status)
    )
      void poll(detail.configId, connection.testId, run);
  } catch {
    if (alive && run === selection) error.value = '渠道详情读取失败，请重试。';
  } finally {
    if (alive && run === selection) busy.value = false;
  }
}
function closeEditor() {
  selection++;
  clearTimeout(timer);
  clearSecrets();
  pendingSave = undefined;
  resetCatalogs();
  editorOpen.value = false;
}
async function requestClose(done?: () => void) {
  if (busy.value) return false;
  const run = selection;
  if (dirty.value || saveUnconfirmed.value) {
    try {
      await ElMessageBox.confirm(
        saveUnconfirmed.value
          ? '保存结果未确认。关闭后请先查询渠道，避免重复创建。'
          : '还有未保存的修改，关闭后将清空本次 Key 输入。',
        '关闭编辑',
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
  if (!alive || run !== selection) return false;
  closeEditor();
  done?.();
  return true;
}
onBeforeRouteLeave(() => (editorOpen.value ? requestClose() : true));
function beforeEditorClose(done: () => void) {
  void requestClose(done);
}
async function save() {
  if (readonly.value && !(saveUnconfirmed.value && pendingSave && !busy.value))
    return;
  const validation = channelError(form);
  if (validation) {
    error.value = validation;
    return;
  }
  const run = ++selection;
  clearTimeout(timer);
  busy.value = true;
  error.value = '';
  try {
    pendingSave ??= {
      body: channelPayload(form, current.value, crypto.randomUUID()),
      configId: current.value?.configId ?? null,
    };
    const attempt = pendingSave;
    const value = attempt.configId
      ? await updateAiSettings(attempt.configId, attempt.body)
      : await createAiSettings(attempt.body);
    if (!alive || run !== selection) return;
    const consent = confirmedCosts.value;
    apply(value);
    confirmedCosts.value = consent;
    message.value = '渠道已保存。测试连接后启用通过的 Key 与模型。';
    void load();
    return value;
  } catch (error_) {
    if (alive && run === selection) {
      const code = (error_ as { response?: { status?: number } })?.response
        ?.status;
      saveUnconfirmed.value = !code || code >= 500;
      if (!saveUnconfirmed.value) pendingSave = undefined;
      error.value = saveUnconfirmed.value
        ? '保存结果未确认，可重试原保存。'
        : '保存未通过，请检查 Key 与模型关联；原连接仍保留。';
    }
  } finally {
    if (alive && run === selection) busy.value = false;
  }
}
async function refreshCurrent(id: string, run: number) {
  if (can('query')) {
    const value = await getAiSettings(id);
    if (alive && run === selection) current.value = value;
  }
  await load();
  if (!can('query') && alive && run === selection)
    current.value =
      rows.value.find((row) => row.configId === id) ?? current.value;
}
async function poll(id: string, testId: string, run: number) {
  if (!alive || run !== selection) return;
  try {
    const value = await getAiSettingsTest(id, testId);
    if (!alive || run !== selection) return;
    test.value = value;
    if (['QUEUED', 'RUNNING'].includes(value.status))
      timer = setTimeout(() => void poll(id, testId, run), 1200);
    else await refreshCurrent(id, run);
  } catch {
    if (alive && run === selection)
      error.value = '测试状态暂未读到，请刷新渠道后查看。';
  }
}
async function connect() {
  if (!can('test') || busy.value || !confirmedCosts.value) return;
  let value = current.value;
  if (dirty.value) {
    if (readonly.value) return;
    value = await save();
  }
  if (!value || !alive) return;
  const run = selection;
  busy.value = true;
  error.value = '';
  try {
    const result = await testAiSettings(value.configId, {
      confirmedCosts: true,
      activateOnSuccess: can('enable'),
    });
    if (!alive || run !== selection) return;
    test.value = result;
    message.value = '';
    if (['QUEUED', 'RUNNING'].includes(result.status))
      timer = setTimeout(
        () => void poll(result.configId, result.testId, run),
        1200,
      );
    else await refreshCurrent(result.configId, run);
  } catch {
    if (alive && run === selection)
      error.value = '测试受理尚未确认，请刷新渠道查看。';
  } finally {
    if (alive && run === selection) busy.value = false;
  }
}
async function enable(row: AiSettingsView) {
  if (
    !can('enable') ||
    !can('query') ||
    busy.value ||
    !['PARTIAL', 'SUCCEEDED'].includes(row.connection?.status ?? '')
  )
    return;
  busy.value = true;
  error.value = '';
  try {
    const original = await getConfiguration(row.configId);
    await activateConfiguration(original.id, {
      revision: original.revision,
      configVersion: original.draft.configVersion,
      onlyAvailable: true,
    });
    if (alive) {
      message.value = '已启用通过验证的 Key 与模型，其他渠道继续保留。';
      await load();
    }
  } catch {
    if (alive) error.value = '渠道尚无可启用的验证结果，请先完成连接测试。';
  } finally {
    if (alive) busy.value = false;
  }
}
async function disable(row: AiSettingsView) {
  if (!can('enable') || !can('query') || busy.value) return;
  busy.value = true;
  try {
    const original = await getConfiguration(row.configId);
    await disableConfiguration(row.configId, original.revision);
    if (alive) {
      message.value = '渠道已停用，其他渠道继续保留。';
      await load();
    }
  } catch {
    if (alive) error.value = '停用结果尚未确认，请刷新渠道查看。';
  } finally {
    if (alive) busy.value = false;
  }
}
async function scanModels(key: ChannelKeyDraft, pageNum = 1) {
  if (!canScan(key) || !form.keys.some((item) => item.localId === key.localId))
    return;
  const state = getCatalog(key);
  const material = key.apiKey.trim();
  const saved = current.value;
  const savedKeyId = key.keyId;
  if (!material && (!saved || !savedKeyId)) {
    state.error = '请先填写 API Key。';
    return;
  }
  if (!material && !can('test')) {
    state.error = '读取已保存 Key 的目录需要连接测试权限。';
    return;
  }
  catalogControllers.get(key.localId)?.abort();
  const controller = new AbortController();
  catalogControllers.set(key.localId, controller);
  const run = selection;
  const provider = form.provider;
  const generation = state.generation;
  const request = ++state.request;
  const valid = () =>
    alive &&
    run === selection &&
    provider === form.provider &&
    form.keys.some((item) => item.localId === key.localId) &&
    catalogs[key.localId]?.generation === generation &&
    catalogs[key.localId]?.request === request;
  state.loading = true;
  state.error = '';
  try {
    const query = { search: state.search || undefined, pageNum, pageSize: 50 };
    let result: ModelCatalogPage;
    if (material)
      result = await scanDraftModels(
        { ...query, provider, apiKey: material },
        controller.signal,
      );
    else if (saved && savedKeyId)
      result = await scanSavedModels(
        {
          ...query,
          configId: saved.configId,
          keyId: savedKeyId,
          expectedRevision: saved.revision,
        },
        controller.signal,
      );
    else return;
    if (!valid() || result.provider !== provider) return;
    const labels: Record<string, CatalogModel> = {};
    for (const code of key.modelCodes)
      if (state.labels[code]) labels[code] = state.labels[code];
    for (const model of result.records) {
      labels[model.code] = model;
      state.seenCodes.add(model.code);
    }
    state.labels = labels;
    state.records = result.records;
    state.total = result.total;
    state.filteredCount = result.filteredCount;
    state.page = result.pageNum;
    state.refreshedAt = result.refreshedAt;
    state.source = result.source;
    state.status = 'READY';
  } catch (error_) {
    if (valid() && !controller.signal.aborted) {
      state.error = catalogError(error_);
      state.status = 'ERROR';
    }
  } finally {
    if (valid()) state.loading = false;
  }
}
function searchModels(key: ChannelKeyDraft, search: string) {
  const state = getCatalog(key);
  state.search = search.slice(0, 128);
  state.request++;
  clearTimeout(catalogTimers.get(key.localId));
  catalogTimers.set(
    key.localId,
    setTimeout(() => void scanModels(key, 1), 300),
  );
}
function catalogSource(source: string) {
  if (source === 'USER_FILTERED') return 'Key 筛选目录';
  if (source === 'PROVIDER_KEY') return '官方 Key 目录';
  return '模型目录';
}
function metadataTime(value: string) {
  return value
    ? new Date(value).toLocaleString('zh-CN', { hour12: false })
    : '';
}
function contextSize(value: CatalogModel['contextLength']) {
  if (value === null) return '';
  const text = String(value);
  if (!/^\d+$/.test(text) || text.length > 9) return text;
  const count = BigInt(text);
  return count >= 1024n ? `${count / 1024n}K` : text;
}
onMounted(async () => {
  try {
    const value = await settingsProviders();
    if (alive) providers.value = value;
  } catch {
    if (alive) error.value = '服务商选项暂不可用，请重试。';
  }
  await load();
});
watch(
  () => access.accessToken,
  () => {
    selection++;
    listGeneration++;
    clearTimeout(timer);
    clearTimeout(searchTimer);
    clearSecrets();
    resetCatalogs();
    pendingSave = undefined;
    editorOpen.value = false;
    current.value = undefined;
    rows.value = [];
    test.value = undefined;
    error.value = '';
    message.value = '';
    saveUnconfirmed.value = false;
    busy.value = false;
    if (access.accessToken) void load();
  },
);
onBeforeUnmount(() => {
  alive = false;
  selection++;
  listGeneration++;
  clearTimeout(timer);
  clearTimeout(searchTimer);
  clearSecrets();
  pendingSave = undefined;
  resetCatalogs();
});
</script>

<template>
  <section class="channel-workspace" aria-label="AI渠道管理">
    <header class="channel-header">
      <div>
        <h1>AI 配置</h1>
        <p>管理多个渠道、命名 Key 与可用模型，场景可按优先级自动切换。</p>
      </div>
      <ElButton
        v-if="can('add')"
        type="primary"
        :disabled="busy || saveUnconfirmed"
        @click="open()"
      >
        新增渠道
      </ElButton>
    </header>
    <ElAlert
      v-if="notice && !editorOpen"
      :title="notice.text"
      :type="notice.type"
      show-icon
      closable
      @close="dismissNotice"
    />
    <div class="channel-toolbar">
      <ElInput
        v-model="query"
        aria-label="搜索渠道"
        placeholder="搜索渠道"
        clearable
        class="channel-search"
      />
      <ElButton :loading="loading" @click="load">刷新</ElButton>
    </div>
    <ElTable
      v-loading="loading"
      :data="rows"
      row-key="configId"
      class="channel-table"
    >
      <ElTableColumn label="渠道名称" min-width="180">
        <template #default="{ row }">
          <strong>{{ row.name }}</strong>
          <p v-if="row.pendingChanges" class="channel-secondary">
            修改待测试，当前仍使用原配置
          </p>
        </template>
      </ElTableColumn>
      <ElTableColumn label="服务商" min-width="120">
        <template #default="{ row }">
          {{
            providers.find((item) => item.code === row.provider)?.name ??
            row.provider
          }}
        </template>
      </ElTableColumn>
      <ElTableColumn label="启用" width="95">
        <template #default="{ row }">
          <ElTag :type="row.active ? 'success' : 'info'" effect="light">
            {{ row.active ? '已启用' : '未启用' }}
          </ElTag>
        </template>
      </ElTableColumn>
      <ElTableColumn label="可用 Key" width="110">
        <template #default="{ row }">
          {{ keyCount(row) }} / {{ row.keys?.length ?? 0 }}
        </template>
      </ElTableColumn>
      <ElTableColumn label="模型" width="80">
        <template #default="{ row }">{{ row.models.length }}</template>
      </ElTableColumn>
      <ElTableColumn label="连接状态" min-width="130">
        <template #default="{ row }">
          <ElTag :type="tone(row.connection?.status)" effect="plain">
            {{ label(row.connection?.status) }}
          </ElTag>
        </template>
      </ElTableColumn>
      <ElTableColumn label="操作" min-width="210" fixed="right">
        <template #default="{ row }">
          <ElButton link type="primary" :disabled="busy" @click="open(row)">
            {{ can('edit') ? '编辑' : '查看' }}
          </ElButton>
          <ElButton
            v-if="
              can('enable') &&
              can('query') &&
              !row.active &&
              ['SUCCEEDED', 'PARTIAL'].includes(row.connection?.status ?? '')
            "
            link
            type="primary"
            :disabled="busy"
            @click="enable(row)"
          >
            启用已验证项
          </ElButton>
          <ElPopconfirm
            v-if="can('enable') && can('query') && row.active"
            title="停用此渠道？其他渠道不受影响。"
            confirm-button-text="停用"
            cancel-button-text="保留"
            @confirm="disable(row)"
          >
            <template #reference>
              <ElButton link type="danger" :disabled="busy">停用</ElButton>
            </template>
          </ElPopconfirm>
        </template>
      </ElTableColumn>
      <template #empty>
        <ElEmpty description="尚无可查看的渠道" :image-size="72" />
      </template>
    </ElTable>
    <ElPagination
      :current-page="page"
      :page-size="20"
      :total="Number(total)"
      layout="total, prev, pager, next"
      class="channel-pagination"
      @current-change="
        page = $event;
        load();
      "
    />
    <ElDrawer
      :model-value="editorOpen"
      :title="current ? `渠道 · ${current.name}` : '新增渠道'"
      size="min(820px, 100vw)"
      destroy-on-close
      :close-on-click-modal="false"
      :before-close="beforeEditorClose"
      @close="closeEditor"
    >
      <ElForm class="channel-form" label-position="top" @submit.prevent="save">
        <div class="channel-basics">
          <ElFormItem label="渠道名称" required>
            <ElInput
              v-model="form.name"
              :disabled="readonly"
              aria-label="渠道名称"
              maxlength="100"
              placeholder="例如：主渠道、备用渠道"
            />
          </ElFormItem>
          <ElFormItem label="服务商">
            <ElSelect
              v-model="form.provider"
              aria-label="渠道服务商"
              :disabled="readonly || Boolean(current)"
              @change="changeProvider"
            >
              <ElOption
                v-for="provider in providers"
                :key="provider.code"
                :label="provider.name"
                :value="provider.code"
              />
            </ElSelect>
          </ElFormItem>
        </div>
        <p class="channel-secondary">服务地址：{{ form.endpointUrl }}</p>
        <div class="channel-key-heading">
          <div>
            <h2>Key 与模型</h2>
            <p class="channel-secondary">
              每个 Key 可选择多个模型，同一模型也可使用不同 Key。
              可复用本渠道已选模型，新关联仍需独立测试。
            </p>
          </div>
          <ElButton
            :disabled="readonly || form.keys.length >= 16"
            @click="form.keys.push(channelKey(form.keys.length + 1))"
          >
            添加 Key
          </ElButton>
        </div>
        <section
          v-for="(key, index) in form.keys"
          :key="key.localId"
          class="channel-key"
          :aria-label="`Key ${index + 1}`"
        >
          <div class="channel-key-title">
            <strong>Key {{ index + 1 }}</strong>
            <ElPopconfirm
              v-if="form.keys.length > 1"
              title="保存后将移除此 Key 的模型关联，确认移除？"
              confirm-button-text="移除"
              cancel-button-text="保留"
              @confirm="removeKey(index)"
            >
              <template #reference>
                <ElButton type="danger" link :disabled="readonly">
                  移除
                </ElButton>
              </template>
            </ElPopconfirm>
          </div>
          <div class="channel-basics">
            <ElFormItem label="Key 名称" required>
              <ElInput
                v-model="key.name"
                :disabled="readonly"
                :aria-label="`Key ${index + 1} 名称`"
                maxlength="80"
                placeholder="例如：主账号、备用账号"
              />
            </ElFormItem>
            <ElFormItem label="API Key" :required="!key.keyConfigured">
              <ElInput
                v-model="key.apiKey"
                :disabled="readonly"
                :aria-label="`Key ${index + 1} 密钥`"
                type="password"
                autocomplete="new-password"
                show-password
                maxlength="8192"
                @input="invalidateCatalog(key)"
                :placeholder="
                  key.keyConfigured
                    ? `留空保留原 Key ${key.maskedKey}`
                    : '粘贴 API Key'
                "
              />
            </ElFormItem>
          </div>
          <ElFormItem label="可使用的模型" required>
            <div class="channel-model-picker">
              <ElSelect
                v-model="key.modelCodes"
                :disabled="readonly"
                :aria-label="`Key ${index + 1} 模型`"
                multiple
                filterable
                remote
                :remote-method="(value) => searchModels(key, value)"
                :loading="getCatalog(key).loading"
                collapse-tags
                collapse-tags-tooltip
                placeholder="搜索扫描目录并选择模型"
              >
                <ElOption
                  v-for="model in modelChoices(key)"
                  :key="model.code"
                  :value="model.code"
                  :label="model.name"
                >
                  <span>{{ model.name }}</span>
                  <small class="model-code">
                    {{ model.code
                    }}{{
                      model.contextLength
                        ? ` · 上下文 ${contextSize(model.contextLength)}`
                        : ''
                    }}
                  </small>
                </ElOption>
                <template #empty>
                  <div class="catalog-empty">
                    {{
                      getCatalog(key).status === 'UNSCANNED'
                        ? '填写 Key 后获取模型目录'
                        : getCatalog(key).status === 'STALE'
                          ? 'Key 已变化，请重新获取目录'
                          : '暂无匹配模型'
                    }}
                  </div>
                </template>
                <template #footer>
                  <div class="catalog-pager">
                    <ElButton
                      link
                      :disabled="
                        getCatalog(key).page <= 1 || getCatalog(key).loading
                      "
                      @click.stop="scanModels(key, getCatalog(key).page - 1)"
                    >
                      上一页
                    </ElButton>
                    <span>
                      可选 {{ getCatalog(key).total }} 项{{
                        getCatalog(key).filteredCount
                          ? ` · 忽略 ${getCatalog(key).filteredCount} 项`
                          : ''
                      }}
                      · 第 {{ getCatalog(key).page }} 页
                    </span>
                    <ElButton
                      link
                      :disabled="
                        getCatalog(key).page * 50 >= getCatalog(key).total ||
                        getCatalog(key).loading
                      "
                      @click.stop="scanModels(key, getCatalog(key).page + 1)"
                    >
                      下一页
                    </ElButton>
                  </div>
                </template>
              </ElSelect>
              <ElButton
                :loading="getCatalog(key).loading"
                :disabled="!canScan(key)"
                @click="scanModels(key)"
              >
                {{
                  getCatalog(key).status === 'READY'
                    ? '刷新目录'
                    : '获取模型目录'
                }}
              </ElButton>
            </div>
          </ElFormItem>
          <ElAlert
            v-if="getCatalog(key).error"
            :title="getCatalog(key).error"
            type="warning"
            closable
            show-icon
            @close="getCatalog(key).error = ''"
          />
          <p v-if="getCatalog(key).refreshedAt" class="channel-secondary">
            {{ catalogSource(getCatalog(key).source) }} ·
            {{ metadataTime(getCatalog(key).refreshedAt) }} ·
            目录不代表生成验证。
          </p>
          <p v-if="keyPending(key)" class="channel-secondary">
            当前 Key 或模型关联待保存与验证。
          </p>
          <div
            v-for="result in !keyPending(key)
              ? ((test?.keys ?? current?.keys ?? []).find(
                  (item) => item.keyId === key.keyId,
                )?.models ?? [])
              : []"
            :key="result.code"
            class="channel-proof"
          >
            <span>
              {{
                modelChoices(key).find((model) => model.code === result.code)
                  ?.name ?? result.code
              }}
            </span>
            <ElTag :type="tone(result.status)" size="small">
              {{ label(result.status) }}
            </ElTag>
            <span class="channel-secondary">{{ result.message }}</span>
          </div>
        </section>
      </ElForm>
      <p v-if="current?.pendingChanges" class="channel-secondary">
        修改待测试，原连接继续运行。
      </p>
      <p v-if="test" class="channel-test-status">
        <ElTag :type="tone(test.status)">{{ label(test.status) }}</ElTag>
        <span>{{ test.message }}</span>
      </p>
      <ElAlert
        v-if="notice"
        :title="notice.text"
        :type="notice.type"
        show-icon
        closable
        @close="dismissNotice"
      />
      <template #footer>
        <div class="channel-drawer-footer">
          <ElCheckbox
            v-if="can('test')"
            v-model="confirmedCosts"
            :disabled="busy"
          >
            确认连接测试可能产生模型费用
          </ElCheckbox>
          <div>
            <ElButton :disabled="busy" @click="requestClose()">关闭</ElButton>
            <ElButton
              v-if="can('test')"
              :disabled="busy || saveUnconfirmed || !confirmedCosts"
              @click="connect"
            >
              {{ dirty ? '保存并测试' : '测试连接' }}
            </ElButton>
            <ElButton
              v-if="current ? can('edit') : can('add')"
              type="primary"
              :loading="busy"
              :disabled="busy"
              @click="save"
            >
              {{ saveUnconfirmed ? '重试原保存' : '保存渠道' }}
            </ElButton>
          </div>
        </div>
      </template>
    </ElDrawer>
  </section>
</template>

<style scoped>
.channel-workspace {
  display: grid;
  gap: 20px;
  min-width: 0;
  padding: 24px;
  color: hsl(var(--foreground));
  background: hsl(var(--background));
  border-radius: 10px;
}

.channel-header,
.channel-toolbar,
.channel-key-heading,
.channel-key-title,
.channel-drawer-footer {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
}

h1 {
  margin-bottom: 6px;
  font-size: 22px;
  font-weight: 600;
}

h2 {
  font-size: 15px;
  font-weight: 600;
}

.channel-header p,
.channel-secondary {
  font-size: 13px;
  line-height: 1.6;
  color: hsl(var(--muted-foreground));
}

.channel-search {
  max-width: 340px;
}

.channel-pagination {
  justify-content: flex-end;
}

.channel-form {
  display: grid;
  gap: 12px;
}

.channel-basics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.channel-key {
  padding: 20px 0 8px;
  border-bottom: 1px solid hsl(var(--border));
}

.channel-key-heading {
  margin-top: 12px;
}

.channel-key-title {
  margin-bottom: 18px;
}

.channel-model-picker {
  display: flex;
  gap: 10px;
  width: 100%;
}

.channel-model-picker :deep(.el-select) {
  flex: 1;
  min-width: 0;
}

.model-code {
  margin-left: 12px;
  color: hsl(var(--muted-foreground));
}

.channel-proof {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 10px;
  font-size: 13px;
}

.catalog-pager {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
}

.catalog-empty {
  padding: 16px;
  font-size: 13px;
  color: hsl(var(--muted-foreground));
  text-align: center;
}

.channel-test-status {
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 12px 0;
  font-size: 13px;
}

.channel-drawer-footer {
  flex-wrap: wrap;
}

@media (max-width: 700px) {
  .channel-workspace {
    padding: 16px;
  }

  .channel-header {
    align-items: flex-start;
  }

  .channel-basics {
    grid-template-columns: 1fr;
    gap: 0;
  }

  .channel-model-picker {
    flex-direction: column;
  }

  .channel-drawer-footer {
    align-items: flex-start;
  }
}
</style>
