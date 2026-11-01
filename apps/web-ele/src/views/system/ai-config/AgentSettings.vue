<script setup lang="ts">
import type { HubModel } from '#/api/system/ai-model-hub';
import type {
  SceneDefinition,
  SceneDetail,
  SceneModelOption,
  SceneSummary,
} from '#/api/system/ai-scene';

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';

import { useAccessStore } from '@vben/stores';

import {
  ElAlert,
  ElButton,
  ElEmpty,
  ElForm,
  ElFormItem,
  ElInput,
  ElMessage,
  ElMessageBox,
  ElSkeleton,
  ElSwitch,
} from 'element-plus';

import {
  createScene,
  getScene,
  getSceneWorkspace,
  saveScene,
  sceneModels,
  setSceneEnabled,
} from '#/api/system/ai-scene';

import ModelPriorityEditor from '../ai-template/workspace/ModelPriorityEditor.vue';
import { promptDocument } from '../ai-template/workspace/prompt-document';
import {
  cloneScene,
  sceneSaveProblem,
} from '../ai-template/workspace/scene-save-adapter';

defineProps<{ models: HubModel[] }>();
const access = useAccessStore();
const can = (action: string) =>
  access.accessCodes.includes(`ai:scene:${action}`);
const identity = computed(() =>
  JSON.stringify([access.accessToken, access.accessCodes]),
);
let generation = 0;
let disposed = false;
const live = (actor: string, run: number) =>
  !disposed && actor === identity.value && run === generation;
const detail = ref<SceneDetail>();
const draft = ref<SceneDefinition>();
const legacyModels = ref<SceneModelOption[]>([]);
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const fields = ref<Record<string, string>>({});
const confirmed = ref('');
const dirty = computed(() =>
  Boolean(draft.value && JSON.stringify(draft.value) !== confirmed.value),
);
let pending: Parameters<typeof saveScene>[1] | undefined;
let createId = crypto.randomUUID();
function assign(value: SceneDetail) {
  detail.value = value;
  draft.value = cloneScene(
    value.definition || {
      name: 'AI 中台',
      purpose: '处理当前账号可访问的业务数据与系统配置',
      promptText:
        '你是业务助手。理解用户的简短要求和图片，自主发现可用业务、字段与数据，完成查询和管理任务。回答简洁，优先呈现业务结果。',
      outputRequirement: '',
      dataObjects: [],
      dataBindings: [],
      sqlBindings: [],
      businessModels: [],
      modelPolicy: {
        mode: 'FIXED',
        models: [],
        fallback: true,
        outputFormat: 'TEXT',
        timeoutSeconds: 120,
        maxAttempts: 8,
        maxConcurrent: 2,
        maxTokens: 4096,
      },
    },
  );
  confirmed.value = value.definition ? JSON.stringify(draft.value) : '';
  pending = undefined;
  fields.value = {};
}
async function load() {
  if (!can('list') || !can('query')) return;
  const actor = identity.value;
  const run = ++generation;
  loading.value = true;
  error.value = '';
  try {
    const found: SceneSummary[] = [];
    let complete = false;
    for (let pageNum = 1; pageNum <= 50; pageNum++) {
      const page = await getSceneWorkspace({ pageNum, pageSize: 20 });
      if (!live(actor, run)) return;
      found.push(...page.scenes.records);
      if (BigInt(found.length) >= BigInt(page.scenes.total)) {
        complete = true;
        break;
      }
      if (page.scenes.records.length === 0) break;
    }
    if (!complete) throw new Error('Incomplete configuration list');
    // Match the workbench's stable first configured Agent; old ordinary scenes are preserved.
    const agents = found
      .filter((scene) => scene.kind === 'AGENT')
      .toSorted((a, b) => a.sceneKey.localeCompare(b.sceneKey));
    const current =
      agents.find((scene) => scene.enabled && scene.currentVersionId) ||
      agents[0];
    const options = await sceneModels('TEXT');
    if (!live(actor, run)) return;
    legacyModels.value = options;
    if (current) {
      const value = await getScene(current.sceneKey);
      if (live(actor, run)) assign(value);
    }
  } catch {
    if (live(actor, run)) error.value = '中台配置读取失败，请重试。';
  } finally {
    if (live(actor, run)) loading.value = false;
  }
}
async function initialize() {
  if (!can('add') || saving.value) return;
  const actor = identity.value;
  const run = ++generation;
  saving.value = true;
  try {
    const value = await createScene({
      clientMutationId: createId,
      kind: 'AGENT',
      formId: null,
      name: 'AI 中台',
      purpose: '处理当前账号可访问的业务数据与系统配置',
    });
    if (!live(actor, run)) return;
    assign(value);
    createId = crypto.randomUUID();
  } catch {
    if (live(actor, run)) error.value = '初始化未完成，可重试原操作。';
  } finally {
    if (live(actor, run)) saving.value = false;
  }
}
async function save() {
  if (!draft.value || !detail.value || !can('edit') || saving.value) return;
  const actor = identity.value;
  const run = generation;
  saving.value = true;
  error.value = '';
  fields.value = {};
  try {
    if (!pending) {
      const { modelPolicy: _policy, ...definition } = cloneScene(draft.value);
      pending = {
        clientMutationId: crypto.randomUUID(),
        expectedRevision: detail.value.scene.revision,
        definition,
      };
    }
    const result = await saveScene(detail.value.scene.sceneKey, pending);
    if (!live(actor, run)) return;
    assign(result.detail);
    ElMessage.success('中台配置已保存，新任务使用此配置');
  } catch (error_) {
    if (!live(actor, run)) return;
    const problem = sceneSaveProblem(error_);
    error.value = problem.message;
    fields.value = problem.fields || {};
    // Retry an unknown network outcome with the same mutation identity and payload.
    const status = (error_ as { response?: { status?: number } })?.response
      ?.status;
    if (status && [400, 401, 403, 404, 409, 422].includes(status))
      pending = undefined;
  } finally {
    if (live(actor, run)) saving.value = false;
  }
}
async function enable(value: unknown) {
  if (!detail.value || !can('enable') || saving.value || dirty.value || pending)
    return;
  const actor = identity.value;
  const run = generation;
  saving.value = true;
  try {
    const result = await setSceneEnabled(detail.value.scene.sceneKey, {
      enabled: Boolean(value),
      expectedRevision: detail.value.scene.revision,
      clientMutationId: crypto.randomUUID(),
    });
    if (!live(actor, run)) return;
    assign(result.detail);
    ElMessage.success(value ? '中台已启用' : '中台已停用');
  } catch {
    if (live(actor, run))
      error.value = '启用状态未确认，请重新读取配置后重试。';
  } finally {
    if (live(actor, run)) saving.value = false;
  }
}
function editModels(models: string[]) {
  if (draft.value)
    edit({
      ...draft.value,
      businessModels: models,
      businessModel: null,
      initialModel: null,
    });
}
function editPrompt(value: string) {
  if (draft.value)
    edit({ ...draft.value, promptText: value, outputRequirement: '' });
}
function edit(value: SceneDefinition) {
  if (saving.value || pending || !can('edit')) return;
  draft.value = value;
}
async function requestLeave() {
  if (saving.value) return false;
  if (!dirty.value && !pending) return true;
  try {
    await ElMessageBox.confirm(
      '中台配置尚未保存，离开后放弃本地修改？',
      '未保存的修改',
      {
        type: 'warning',
        confirmButtonText: '放弃修改',
        cancelButtonText: '继续编辑',
      },
    );
    if (detail.value) assign(detail.value);
    return true;
  } catch {
    return false;
  }
}
async function reload() {
  if (await requestLeave()) await load();
}
onBeforeRouteLeave(requestLeave);
onMounted(load);
watch(identity, () => {
  generation++;
  detail.value = undefined;
  draft.value = undefined;
  legacyModels.value = [];
  confirmed.value = '';
  error.value = '';
  fields.value = {};
  pending = undefined;
  saving.value = false;
  loading.value = false;
  createId = crypto.randomUUID();
  void load();
});
onBeforeUnmount(() => {
  disposed = true;
  generation++;
});
defineExpose({ requestLeave });
</script>

<template>
  <section class="agent-settings" aria-label="中台设置">
    <header class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h2 class="text-lg font-semibold">中台设置</h2>
        <p class="mt-2 text-sm text-muted-foreground">
          设置助手职责、执行偏好与模型调用顺序
        </p>
      </div>
      <ElButton
        v-if="draft && can('edit')"
        type="primary"
        :loading="saving"
        :disabled="!dirty && !pending"
        @click="save"
      >
        {{ pending ? '重试保存' : '保存设置' }}
      </ElButton>
    </header>
    <div v-if="detail" class="mt-5 flex items-center gap-3 text-sm">
      <span>启用中台</span>
      <ElSwitch
        :model-value="detail.scene.enabled"
        aria-label="启用中台"
        :disabled="!can('enable') || saving || dirty || Boolean(pending)"
        @change="enable"
      />
    </div>
    <ElAlert
      v-if="error"
      :title="error"
      type="error"
      :closable="false"
      class="my-4"
    >
      <ElButton link @click="reload">重新读取</ElButton>
    </ElAlert>
    <ElSkeleton v-if="loading" :rows="8" animated class="mt-6" />
    <ElEmpty
      v-else-if="!can('list') || !can('query')"
      description="当前账号无中台设置查看权限"
    />
    <div v-else-if="draft" class="mt-6 flex flex-1 flex-col gap-6">
      <section>
        <h3 class="mb-3 text-sm font-medium">模型调用顺序</h3>
        <ModelPriorityEditor
          :value="draft"
          :models="models"
          :legacy-models="legacyModels"
          :readonly="!can('edit') || saving || Boolean(pending)"
          @change="editModels"
        />
        <p
          v-if="
            fields.businessModels || fields.businessModel || fields.modelPolicy
          "
          class="mt-2 text-sm text-destructive"
        >
          {{
            fields.businessModels || fields.businessModel || fields.modelPolicy
          }}
        </p>
      </section>
      <ElForm label-position="top" class="flex-1">
        <ElFormItem label="Agent 系统提示词" :error="fields.promptText">
          <ElInput
            :model-value="promptDocument(draft)"
            aria-label="中台系统提示词"
            type="textarea"
            :autosize="{ minRows: 10, maxRows: 24 }"
            :maxlength="32768"
            :readonly="!can('edit') || saving || Boolean(pending)"
            placeholder="设置助手的职责、业务背景和执行偏好"
            @update:model-value="editPrompt"
          />
        </ElFormItem>
      </ElForm>
    </div>
    <ElEmpty v-else description="尚未设置中台助手">
      <ElButton
        v-if="can('add')"
        type="primary"
        :loading="saving"
        @click="initialize"
      >
        初始化中台设置
      </ElButton>
    </ElEmpty>
  </section>
</template>

<style scoped>
.agent-settings {
  display: flex;
  flex-direction: column;
  max-width: 1120px;
  min-height: 100%;
  margin: 0 auto;
}
</style>
