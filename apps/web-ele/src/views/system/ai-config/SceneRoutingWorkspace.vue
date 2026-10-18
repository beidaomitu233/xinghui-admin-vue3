<script setup lang="ts">
import type { RouteKeyOption } from './scene-routing-state';

import type { HubModel } from '#/api/system/ai-model-hub';
import type {
  SceneModelOption,
  SceneModelPolicy,
  SceneSummary,
} from '#/api/system/ai-scene';
import type {
  SceneRoutingChange,
  SceneRoutingView,
} from '#/api/system/ai-scene-routing';

import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';

import { useAccessStore } from '@vben/stores';

import {
  ElAlert,
  ElButton,
  ElEmpty,
  ElMessageBox,
  ElOption,
  ElSelect,
  ElSkeleton,
} from 'element-plus';

import { listHubModels } from '#/api/system/ai-model-hub';
import {
  getSceneWorkspace,
  sceneKeys,
  sceneModels,
} from '#/api/system/ai-scene';
import {
  getSceneRouting,
  saveSceneRouting,
} from '#/api/system/ai-scene-routing';

import { copyRoute, routeModelId } from './scene-routing-state';
import SceneRouteEditor from './SceneRouteEditor.vue';

const props = defineProps<{ initialSceneKey?: string }>();
const access = useAccessStore();
const canRead = computed(() =>
  ['ai:config:query', 'ai:scene:query'].every((code) =>
    access.accessCodes.includes(code),
  ),
);
const canWrite = computed(
  () =>
    canRead.value &&
    ['ai:config:edit', 'ai:scene:edit'].every((code) =>
      access.accessCodes.includes(code),
    ),
);
const identity = computed(() =>
  JSON.stringify([access.accessToken, access.accessCodes]),
);
const selected = ref('');
const scenes = ref<SceneSummary[]>([]);
const current = ref<SceneRoutingView>();
const policy = ref<SceneModelPolicy>();
const models = ref<SceneModelOption[]>([]);
const keys = ref<Record<string, RouteKeyOption[]>>({});
const baseline = ref('');
const businessModel = ref('');
const baselineBusinessModel = ref('');
const businessModels = ref<HubModel[]>([]);
const loading = ref(false);
const saving = ref(false);
const unknown = ref(false);
const message = ref('');
const error = ref('');
let pending: undefined | { body: SceneRoutingChange; sceneKey: string };
let generation = 0;
let keyGeneration = 0;
let listGeneration = 0;
let selectionGeneration = 0;
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let alive = true;
const dirty = computed(
  () =>
    Boolean(policy.value && JSON.stringify(policy.value) !== baseline.value) ||
    businessModel.value !== baselineBusinessModel.value,
);
defineExpose({ canLeave: discardAllowed });
const sceneOptions = computed(() =>
  selected.value &&
  !scenes.value.some((scene) => scene.sceneKey === selected.value)
    ? [{ sceneKey: selected.value, name: '当前选中场景' }, ...scenes.value]
    : scenes.value,
);
async function discardAllowed() {
  if (saving.value) return false;
  if (!dirty.value && !unknown.value) return true;
  try {
    await ElMessageBox.confirm(
      unknown.value
        ? '保存结果尚未确认。离开后请重新读取，服务端可能已保存。'
        : '调用顺序有未保存修改，确认放弃？',
      '离开前确认',
      {
        confirmButtonText: '放弃并继续',
        cancelButtonText: '留在当前页',
        type: 'warning',
      },
    );
    return true;
  } catch {
    return false;
  }
}
async function loadScene(key: string) {
  const choice = ++selectionGeneration;
  if (
    !canRead.value ||
    !(await discardAllowed()) ||
    !alive ||
    choice !== selectionGeneration
  )
    return;
  selected.value = key;
  pending = undefined;
  unknown.value = false;
  policy.value = undefined;
  businessModel.value = '';
  baselineBusinessModel.value = '';
  current.value = undefined;
  baseline.value = '';
  error.value = '';
  message.value = '';
  keys.value = {};
  const run = ++generation;
  keyGeneration++;
  if (!key) return;
  loading.value = true;
  const results = await Promise.allSettled([
    getSceneRouting(key),
    sceneModels('TEXT'),
    listHubModels({ pageNum: 1, pageSize: 100 }),
  ]);
  if (!alive || run !== generation || !canRead.value) return;
  const routing = results[0];
  const options = results[1];
  if (routing.status === 'fulfilled') {
    current.value = routing.value;
    policy.value = routing.value.modelPolicy
      ? copyRoute(routing.value.modelPolicy)
      : undefined;
    baseline.value = policy.value ? JSON.stringify(policy.value) : '';
    businessModel.value = routing.value.businessModel ?? '';
    baselineBusinessModel.value = businessModel.value;
  } else error.value = '场景调用顺序未读到，请检查权限后重试。';
  models.value = options.status === 'fulfilled' ? options.value : [];
  const business = results[2];
  businessModels.value =
    business.status === 'fulfilled' ? business.value.records : [];
  if (options.status === 'rejected')
    error.value = '模型候选未读到，已保存的调用顺序继续保留。';
  loading.value = false;
}
async function loadScenes(search = '') {
  if (!canRead.value || !access.accessCodes.includes('ai:scene:list')) return;
  const run = ++listGeneration;
  try {
    const result = await getSceneWorkspace({
      pageNum: 1,
      pageSize: 100,
      search,
    });
    if (alive && run === listGeneration) scenes.value = result.scenes.records;
  } catch {
    if (alive && run === listGeneration)
      error.value = '场景候选未读到，请重试。';
  }
}
function searchScenes(value: string) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => void loadScenes(value.slice(0, 100)), 300);
}
async function loadKeys() {
  const run = ++keyGeneration;
  const missing =
    policy.value?.models.filter(
      (binding) => !keys.value[routeModelId(binding.model)],
    ) ?? [];
  const results = await Promise.allSettled(
    missing.map(async (binding) => ({
      id: routeModelId(binding.model),
      options: await sceneKeys(binding.model),
    })),
  );
  if (!alive || run !== keyGeneration || !canRead.value) return;
  for (const result of results) {
    if (result.status === 'fulfilled')
      keys.value[result.value.id] = result.value.options;
    else error.value = '部分 Key 候选未读到，已保存限制仍保留。';
  }
}
function changePolicy(next: SceneModelPolicy) {
  if (canWrite.value && !saving.value && !unknown.value) policy.value = next;
}
async function save() {
  if (
    !canWrite.value ||
    saving.value ||
    loading.value ||
    !current.value ||
    (!policy.value && !businessModel.value)
  )
    return;
  if (
    !pending &&
    (!dirty.value || (!businessModel.value && !policy.value?.models.length))
  )
    return;
  const routePolicy =
    !businessModel.value && policy.value ? copyRoute(policy.value) : null;
  pending ??= {
    sceneKey: current.value.sceneKey,
    body: {
      expectedRevision: current.value.revision,
      clientMutationId: crypto.randomUUID(),
      modelPolicy: routePolicy,
      ...(businessModel.value ? { businessModel: businessModel.value } : {}),
    },
  };
  const attempt = pending;
  const run = generation;
  saving.value = true;
  error.value = '';
  message.value = '';
  try {
    const result = await saveSceneRouting(attempt.sceneKey, attempt.body);
    if (!alive || run !== generation || !canWrite.value) return;
    if (
      result.clientMutationId !== attempt.body.clientMutationId ||
      result.routing.sceneKey !== attempt.sceneKey ||
      result.routing.revision <= attempt.body.expectedRevision ||
      (!result.routing.modelPolicy && !result.routing.businessModel)
    )
      throw new Error('Unconfirmed routing acknowledgement');
    current.value = result.routing;
    policy.value = result.routing.modelPolicy
      ? copyRoute(result.routing.modelPolicy)
      : undefined;
    baseline.value = policy.value ? JSON.stringify(policy.value) : '';
    businessModel.value = result.routing.businessModel ?? '';
    baselineBusinessModel.value = businessModel.value;
    pending = undefined;
    unknown.value = false;
    message.value = '调用顺序已保存。';
  } catch (error_) {
    if (!alive || run !== generation) return;
    const status = (error_ as null | { response?: { status?: number } })
      ?.response?.status;
    unknown.value = !status || status >= 500;
    if (!unknown.value) pending = undefined;
    if (unknown.value) error.value = '保存结果未确认，可重试原保存。';
    else if (status === 409)
      error.value = '场景已有更新，请重新读取后再调整；当前输入保留。';
    else error.value = '保存未通过，请检查当前权限与模型组合。';
  } finally {
    if (alive && run === generation) saving.value = false;
  }
}
watch(
  () =>
    policy.value?.models
      .map((binding) => routeModelId(binding.model))
      .join('|'),
  loadKeys,
);
watch(
  () => props.initialSceneKey,
  (key) => {
    if (canRead.value && key && key !== selected.value) void loadScene(key);
  },
  { immediate: true },
);
watch(
  identity,
  () => {
    generation++;
    keyGeneration++;
    listGeneration++;
    selectionGeneration++;
    clearTimeout(searchTimer);
    selected.value = '';
    scenes.value = [];
    current.value = undefined;
    policy.value = undefined;
    businessModel.value = '';
    baselineBusinessModel.value = '';
    businessModels.value = [];
    keys.value = {};
    models.value = [];
    pending = undefined;
    baseline.value = '';
    unknown.value = false;
    saving.value = false;
    loading.value = false;
    error.value = '';
    message.value = '';
    if (canRead.value) {
      void loadScenes();
      if (props.initialSceneKey) void loadScene(props.initialSceneKey);
    }
  },
  { immediate: true },
);
onBeforeRouteLeave(discardAllowed);
onBeforeUnmount(() => {
  alive = false;
  generation++;
  keyGeneration++;
  listGeneration++;
  selectionGeneration++;
  clearTimeout(searchTimer);
  pending = undefined;
});
</script>
<template>
  <section class="scene-routing-workspace" aria-label="场景调用顺序">
    <header>
      <div>
        <h2>场景调用顺序</h2>
        <p>在此维护渠道、Key 范围与调用先后顺序。</p>
      </div>
    </header>
    <ElEmpty
      v-if="!canRead"
      description="需要渠道与场景的查看权限"
      :image-size="60"
    />
    <template v-else>
      <div class="routing-toolbar">
        <ElSelect
          :model-value="selected"
          aria-label="选择调用场景"
          filterable
          remote
          :remote-method="searchScenes"
          placeholder="选择场景"
          :disabled="saving"
          @update:model-value="loadScene"
        >
          <ElOption
            v-for="scene in sceneOptions"
            :key="scene.sceneKey"
            :value="scene.sceneKey"
            :label="scene.name"
          />
        </ElSelect>
        <ElButton :disabled="!selected || saving" @click="loadScene(selected)">
          重新读取
        </ElButton>
        <ElButton
          v-if="canWrite && (policy || businessModel)"
          type="primary"
          :disabled="saving || loading || (!dirty && !unknown)"
          :loading="saving"
          @click="save"
        >
          {{ unknown ? '重试原保存' : '保存调用顺序' }}
        </ElButton>
      </div>
      <ElAlert
        v-if="error || message"
        :title="error || message"
        :type="error ? 'warning' : 'success'"
        closable
        @close="
          error = '';
          message = '';
        "
      />
      <ElSkeleton v-if="loading" :rows="4" animated />
      <ElSelect
        v-if="current && !loading"
        v-model="businessModel"
        :disabled="!canWrite || saving || unknown"
        aria-label="场景逻辑业务模型"
        filterable
        placeholder="选择业务模型"
      >
        <ElOption v-if="policy" value="" label="保留历史精确调用顺序" />
        <ElOption
          v-for="model in businessModels"
          :key="model.modelId"
          :value="model.slug"
          :label="model.name"
        />
        <ElOption
          v-if="
            businessModel &&
            !businessModels.some((model) => model.slug === businessModel)
          "
          :value="businessModel"
          :label="`已保存业务模型 · ${businessModel}`"
        />
      </ElSelect>
      <SceneRouteEditor
        v-if="!loading && policy && !businessModel"
        :value="policy"
        :models="models"
        :keys="keys"
        :readonly="!canWrite || saving || unknown"
        @change="changePolicy"
      />
      <p v-else-if="businessModel" class="routing-business-description">
        供应商顺序、Key 与故障切换由模型中心统一维护，提示词正文独立保存。
      </p>
      <ElEmpty
        v-else-if="!loading"
        :description="
          current
            ? '请先在提示词页选择初始模型并保存场景'
            : '选择一个场景查看调用顺序'
        "
        :image-size="60"
      />
    </template>
  </section>
</template>
<style scoped>
.scene-routing-workspace {
  display: grid;
  gap: 20px;
  padding: 8px 0 20px;
}

h2 {
  font-size: 18px;
  font-weight: 600;
}

p {
  margin-top: 6px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.routing-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.routing-toolbar :deep(.el-select) {
  width: min(380px, 100%);
}

.routing-toolbar :deep(.el-button) {
  margin-left: 0;
}
</style>
