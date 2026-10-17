<script setup lang="ts">
import type {
  AiSettingsView,
  ConnectionStatus,
  SettingsProvider,
  SettingsTestRun,
} from '#/api/system/ai-settings';

import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';

import { useAccessStore } from '@vben/stores';

import {
  activateConfiguration,
  disableConfiguration,
  getConfiguration,
} from '#/api/system/ai-configuration';
import {
  createAiSettings,
  getAiSettings,
  getAiSettingsTest,
  listAiSettings,
  OPENROUTER_SUGGESTED_MODELS,
  settingsProviders,
  testAiSettings,
  updateAiSettings,
} from '#/api/system/ai-settings';

const emit = defineEmits<{ changed: []; close: [] }>();
const access = useAccessStore();
const can = (action: string) =>
  access.accessCodes.includes(`ai:config:${action}`) ||
  (['add', 'edit', 'list', 'query', 'test'].includes(action) &&
    access.accessCodes.includes(`ai:model:${action}`));
const rows = ref<AiSettingsView[]>([]);
const providers = ref<SettingsProvider[]>([]);
const current = ref<AiSettingsView>();
const form = reactive({
  name: '',
  provider: 'openrouter',
  endpointUrl: 'https://openrouter.ai/api/v1/chat/completions',
  apiKey: '',
  modelCodes: OPENROUTER_SUGGESTED_MODELS.map((model) => model.code),
});
const customModel = ref('');
const busy = ref(false);
const loading = ref(false);
const error = ref('');
const status = ref('');
const confirmedCosts = ref(false);
const saveUnconfirmed = ref(false);
const activationConfirmed = ref(false);
const test = ref<SettingsTestRun>();
const page = ref(1);
const total = ref('0');
const readonly = computed(
  () =>
    busy.value ||
    saveUnconfirmed.value ||
    !(current.value ? can('edit') : can('add')),
);
const provider = computed(() =>
  providers.value.find((item) => item.code === form.provider),
);
const modelChoices = computed(() => {
  const values = new Map(
    (provider.value?.suggestedModels ?? OPENROUTER_SUGGESTED_MODELS).map(
      (model) => [model.code, model.name],
    ),
  );
  for (const model of current.value?.models ?? [])
    values.set(model.code, model.name || values.get(model.code) || model.code);
  for (const code of form.modelCodes)
    if (!values.has(code)) values.set(code, code);
  return [...values].map(([code, name]) => ({
    code,
    name:
      OPENROUTER_SUGGESTED_MODELS.find((model) => model.code === code)?.name ??
      name,
  }));
});
const labels: Record<ConnectionStatus, string> = {
  CANCELLED: '测试已取消',
  FAILED: '连接未通过',
  INTERRUPTED: '测试已中断',
  NOT_TESTED: '尚未测试',
  PARTIAL: '部分模型未通过',
  QUEUED: '等待连接测试',
  RUNNING: '正在测试连接',
  SUCCEEDED: '连接通过',
};
let alive = true;
let selection = 0;
let listRun = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
function clearSecret() {
  form.apiKey = '';
}
function apply(value?: AiSettingsView) {
  activationConfirmed.value = false;
  clearTimeout(timer);
  current.value = value;
  saveUnconfirmed.value = false;
  clearSecret();
  customModel.value = '';
  confirmedCosts.value = false;
  test.value = undefined;
  error.value = '';
  status.value = '';
  Object.assign(form, {
    name: value?.name ?? '',
    provider: value?.provider ?? providers.value[0]?.code ?? 'openrouter',
    endpointUrl:
      value?.endpointUrl ??
      providers.value[0]?.defaultEndpoint ??
      'https://openrouter.ai/api/v1/chat/completions',
    modelCodes: value
      ? value.models.map((model) => model.code)
      : OPENROUTER_SUGGESTED_MODELS.map((model) => model.code),
  });
}
async function load() {
  if (!can('list')) return;
  const run = ++listRun;
  loading.value = true;
  try {
    const result = await listAiSettings({ pageNum: page.value, pageSize: 20 });
    if (alive && run === listRun) {
      rows.value = result.records;
      total.value = result.total;
    }
  } catch {
    if (alive && run === listRun) error.value = '配置列表读取失败，请重试。';
  } finally {
    if (alive && run === listRun) loading.value = false;
  }
}
async function choose(id: string) {
  const run = ++selection;
  try {
    const listed = rows.value.find((row) => row.configId === id);
    const value = can('query') ? await getAiSettings(id) : listed;
    if (alive && run === selection && value) apply(value);
  } catch {
    if (alive && run === selection) error.value = '配置读取失败，请重试。';
  }
}
function addModel() {
  const code = customModel.value.trim();
  if (readonly.value || !code || form.modelCodes.includes(code)) return;
  form.modelCodes.push(code);
  customModel.value = '';
}
function dirty() {
  return (
    !current.value ||
    Boolean(form.apiKey) ||
    form.name !== current.value.name ||
    form.provider !== current.value.provider ||
    form.endpointUrl !== current.value.endpointUrl ||
    JSON.stringify(form.modelCodes) !==
      JSON.stringify(current.value.models.map((model) => model.code))
  );
}
async function save() {
  if (
    readonly.value ||
    form.modelCodes.length === 0 ||
    (!current.value?.keyConfigured && !form.apiKey.trim())
  ) {
    error.value = '请填写 API Key 并至少选择一个模型。';
    return;
  }
  busy.value = true;
  error.value = '';
  const run = ++selection;
  clearTimeout(timer);
  try {
    const input = {
      expectedRevision: current.value?.revision ?? null,
      name: form.name,
      provider: form.provider,
      endpointUrl: form.endpointUrl,
      apiKey: form.apiKey || null,
      modelCodes: [...form.modelCodes],
    };
    const value = current.value
      ? await updateAiSettings(current.value.configId, input)
      : await createAiSettings(input);
    if (!alive || run !== selection) return;
    const consent = confirmedCosts.value;
    apply(value);
    confirmedCosts.value = consent;
    status.value = '已保存；测试连接才会调用模型。';
    emit('changed');
    await load();
    return value;
  } catch (error_) {
    if (alive && run === selection) {
      const code = (error_ as null | { response?: { status?: number } })
        ?.response?.status;
      saveUnconfirmed.value = !code || code >= 500;
      error.value = saveUnconfirmed.value
        ? '保存结果尚未确认，请刷新并选择实际配置后继续，避免重复创建。'
        : '保存未通过，请检查配置；原可用连接继续保留。';
    }
  } finally {
    if (alive && run === selection) busy.value = false;
  }
}
async function poll(configId: string, testId: string, run: number) {
  if (!alive || run !== selection) return;
  try {
    const result = await getAiSettingsTest(configId, testId);
    if (!alive || run !== selection) return;
    test.value = result;
    if (['QUEUED', 'RUNNING'].includes(result.status))
      timer = setTimeout(() => void poll(configId, testId, run), 1200);
    else {
      await refreshConnection(configId, run);
      if (alive && run === selection) {
        emit('changed');
        void load();
      }
    }
  } catch {
    if (alive && run === selection)
      error.value = '连接结果暂未读到，可刷新配置查看原测试。';
  }
}
async function refreshConnection(configId: string, run: number) {
  if (can('query')) {
    const updated = await getAiSettings(configId);
    if (alive && run === selection) current.value = updated;
  } else if (can('list')) {
    await load();
    const updated = rows.value.find((row) => row.configId === configId);
    if (updated && alive && run === selection) current.value = updated;
  }
}
async function connect() {
  if (!can('test') || busy.value || !confirmedCosts.value) return;
  let value = current.value;
  if (dirty()) {
    if (readonly.value) {
      error.value = '请由有编辑权限的管理员保存修改后再测试。';
      return;
    }
    value = await save();
  }
  if (!value || !alive) return;
  busy.value = true;
  error.value = '';
  const run = selection;
  try {
    const result = await testAiSettings(value.configId, {
      confirmedCosts: true,
      activateOnSuccess: can('enable'),
    });
    if (!alive || run !== selection) return;
    test.value = result;
    status.value = '';
    if (['QUEUED', 'RUNNING'].includes(result.status))
      timer = setTimeout(
        () => void poll(result.configId, result.testId, run),
        1200,
      );
    else {
      await refreshConnection(result.configId, run);
      emit('changed');
      void load();
    }
  } catch {
    if (alive && run === selection)
      error.value = '连接测试未确认，原可用配置继续保留，请刷新查询。';
  } finally {
    if (alive && run === selection) busy.value = false;
  }
}
async function enableVerified() {
  if (!current.value || !can('enable') || busy.value || dirty()) return;
  busy.value = true;
  try {
    const value = await getConfiguration(current.value.configId);
    await activateConfiguration(value.id, {
      configVersion: value.draft.configVersion,
      revision: value.revision,
      onlyAvailable: true,
    });
    if (!alive) return;
    current.value = await getAiSettings(value.id);
    activationConfirmed.value = true;
    status.value = '已启用通过验证的连接。';
    emit('changed');
    void load();
  } catch {
    if (alive) error.value = '尚无可启用的已验证模型，请先完成连接测试。';
  } finally {
    if (alive) busy.value = false;
  }
}
async function disable() {
  if (!current.value?.active || !can('enable') || busy.value) return;
  const previous = current.value;
  const id = previous.configId;
  const run = selection;
  busy.value = true;
  try {
    const value = await getConfiguration(id);
    await disableConfiguration(id, value.revision);
    if (!alive || run !== selection) return;
    current.value = { ...previous, active: false };
    status.value = '配置已停用。';
    emit('changed');
    void load();
  } catch {
    if (alive && run === selection)
      error.value = '停用结果尚未确认，请刷新配置查看。';
  } finally {
    if (alive && run === selection) busy.value = false;
  }
}
function close() {
  clearSecret();
  emit('close');
}
onMounted(async () => {
  try {
    const result = await settingsProviders();
    if (alive) providers.value = result;
  } catch {
    if (alive) error.value = '服务商选项读取失败。';
  }
  await load();
  if (alive && rows.value[0]) await choose(rows.value[0].configId);
});
onBeforeUnmount(() => {
  alive = false;
  selection++;
  listRun++;
  clearTimeout(timer);
  clearSecret();
});
</script>
<template>
  <section class="simple-ai-settings" aria-label="Key 与模型设置">
    <header>
      <h2>Key 与模型</h2>
      <button type="button" @click="close">关闭</button>
    </header>
    <div class="settings-chooser">
      <select
        aria-label="选择配置"
        :value="current?.configId ?? ''"
        :disabled="busy || loading"
        @change="choose(($event.target as HTMLSelectElement).value)"
      >
        <option value="" disabled>选择已有配置</option>
        <option v-for="row in rows" :key="row.configId" :value="row.configId">
          {{ row.name || '未命名配置' }} ·
          {{ row.active ? '已启用' : '未启用' }}
        </option>
      </select>
      <button
        v-if="can('add')"
        type="button"
        :disabled="busy"
        @click="
          selection++;
          apply();
        "
      >
        新建配置
      </button>
      <button type="button" :disabled="loading" @click="load">刷新</button>
    </div>
    <form @submit.prevent="save">
      <label>
        配置名称
        <input
          v-model="form.name"
          :readonly="readonly"
          placeholder="例如：日常问答"
        />
      </label>
      <label>
        服务商
        <select
          v-model="form.provider"
          :disabled="readonly"
          @change="
            form.endpointUrl = provider?.defaultEndpoint ?? form.endpointUrl
          "
        >
          <option v-for="item in providers" :key="item.code" :value="item.code">
            {{ item.name }}
          </option>
        </select>
      </label>
      <label>
        API 地址
        <input v-model="form.endpointUrl" readonly type="url" />
      </label>
      <label>
        API Key
        <input
          v-model="form.apiKey"
          aria-label="API Key"
          :readonly="readonly"
          type="password"
          autocomplete="new-password"
          :placeholder="
            current?.keyConfigured ? '已配置，留空保持原 Key' : '粘贴 API Key'
          "
        />
      </label>
      <p v-if="current?.keyConfigured" class="muted">
        已配置 {{ current.maskedKey }}
      </p>
      <fieldset :disabled="readonly">
        <legend>选择模型</legend>
        <label
          v-for="model in modelChoices"
          :key="model.code"
          class="model-option"
        >
          <input
            v-model="form.modelCodes"
            type="checkbox"
            :value="model.code"
          />
          {{ model.name }}
        </label>
        <div class="custom-model">
          <input
            v-model="customModel"
            aria-label="添加模型名称或代码"
            placeholder="也可输入其他模型名称或服务商代码"
            @keydown.enter.prevent="addModel"
          />
          <button type="button" @click="addModel">添加模型</button>
        </div>
      </fieldset>
      <p v-if="error" role="alert">{{ error }}</p>
      <p v-if="status" role="status">{{ status }}</p>
      <p v-if="current?.pendingChanges" role="status">
        修改待测试，当前仍使用原配置。
      </p>
      <section v-if="test || current?.connection">
        <h3>
          {{
            labels[
              (test?.status ?? current?.connection?.status) || 'NOT_TESTED'
            ]
          }}
        </h3>
        <p>{{ test?.message ?? current?.connection?.message }}</p>
        <p v-for="model in test?.models ?? []" :key="model.code">
          {{
            modelChoices.find((item) => item.code === model.code)?.name ??
            model.code
          }}：{{ labels[model.status] }} · {{ model.message }}
        </p>
        <p v-if="!current?.pendingChanges && current?.active">
          <span v-if="activationConfirmed">
            已启用通过验证的模型；未通过的模型未启用。
          </span>
          <span v-else>
            {{
              test?.status === 'SUCCEEDED'
                ? '测试通过的连接已启用'
                : test
                  ? '原可用连接继续保留'
                  : '已启用的连接可继续使用'
            }}
          </span>
        </p>
      </section>
      <label v-if="can('test')" class="cost-confirmation">
        <input v-model="confirmedCosts" type="checkbox" />
        我确认测试连接可能产生模型费用
      </label>
      <footer>
        <button
          v-if="current ? can('edit') : can('add')"
          type="submit"
          :disabled="busy"
        >
          保存配置
        </button>
        <button
          v-if="can('test')"
          type="button"
          :disabled="busy || !confirmedCosts"
          @click="connect"
        >
          {{ current && !dirty() ? '测试连接' : '保存并测试连接' }}
        </button>
        <button
          v-if="current && can('enable')"
          type="button"
          :disabled="busy || dirty()"
          @click="enableVerified"
        >
          启用已验证连接
        </button>
        <button
          v-if="current?.active && can('enable')"
          type="button"
          :disabled="busy"
          @click="disable"
        >
          停用配置
        </button>
      </footer>
    </form>
    <div v-if="BigInt(total) > 20n" class="settings-pages">
      <button
        type="button"
        :disabled="page <= 1"
        @click="
          page--;
          load();
        "
      >
        上一页
      </button>
      <span>第 {{ page }} 页</span>
      <button
        type="button"
        :disabled="BigInt(page * 20) >= BigInt(total)"
        @click="
          page++;
          load();
        "
      >
        下一页
      </button>
    </div>
  </section>
</template>
<style scoped>
.simple-ai-settings {
  padding: 8px;
}

header,
footer,
.settings-chooser,
.custom-model,
.settings-pages {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
  margin-bottom: 20px;
}

header {
  justify-content: space-between;
}

h2 {
  font-size: 20px;
  font-weight: 600;
}

form {
  display: grid;
  gap: 18px;
}

label {
  display: grid;
  gap: 8px;
  font-size: 13px;
}

input:not([type='checkbox']),
select {
  width: 100%;
  padding: 10px 12px;
  background: hsl(var(--background));
  border: 1px solid hsl(var(--border));
  border-radius: 7px;
}

.settings-chooser select {
  flex: 1;
}

fieldset {
  display: grid;
  gap: 12px;
  padding: 16px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.model-option,
.cost-confirmation {
  display: flex;
  gap: 8px;
  align-items: center;
}

.custom-model input {
  flex: 1;
}

.muted {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

button {
  color: hsl(var(--primary));
}

button:disabled {
  opacity: 0.5;
}

[role='alert'] {
  font-size: 13px;
  color: hsl(var(--destructive));
}
</style>
