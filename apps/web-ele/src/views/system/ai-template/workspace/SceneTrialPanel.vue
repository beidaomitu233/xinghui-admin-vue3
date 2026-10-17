<script setup lang="ts">
import type {
  SceneDefinition,
  ScenePreview,
  SceneRequest,
  SceneSubmission,
} from '#/api/system/ai-scene';
import type { SceneDataSample } from '#/api/system/ai-scene-data';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { useAccessStore } from '@vben/stores';

import { subscribeAiRequest } from '#/api/system/ai-application';
import {
  cancelSceneRequest,
  getSceneRequest,
  previewScene,
  testScene,
} from '#/api/system/ai-scene';
import { sceneDataSamples } from '#/api/system/ai-scene-data';

const props = defineProps<{
  businessRef?: SceneSubmission['businessRef'];
  definition: SceneDefinition;
  revision: number;
  sceneKey: string;
  versionId: null | string;
}>();
const access = useAccessStore();
const canRun = computed(() =>
  ['ai:scene:test', 'ai:scene:invoke'].every((code) =>
    access.accessCodes.includes(code),
  ),
);
const canSamples = computed(() =>
  ['lowcode:record:list', 'lowcode:record:query'].every((code) =>
    access.accessCodes.includes(code),
  ),
);
const expanded = ref(false);
const keyword = ref('');
const samples = ref<SceneDataSample[]>([]);
const sampleId = ref('');
const samplePage = ref(1);
const sampleTotal = ref('0');
const requirement = ref('');
const confirmedCosts = ref(false);
const preview = ref<ScenePreview>();
const previewInputNames = computed(() =>
  Object.keys(preview.value?.inputSummary ?? {}),
);
const previewObjectNames = computed(() =>
  Object.keys(preview.value?.resourceSummary ?? {}),
);
const request = ref<SceneRequest>();
const output = ref('');
const error = ref('');
const busy = ref(false);
const sampleLoading = ref(false);
const formId = computed(() => props.definition.dataObjects[0]?.formId);
const active = computed(
  () => request.value && ['QUEUED', 'RUNNING'].includes(request.value.status),
);
const needsRecord = computed(
  () =>
    props.definition.dataObjects.length > 0 ||
    props.definition.dataBindings?.some(
      (binding) => binding.row?.currentRecord,
    ),
);
const ready = computed(() =>
  Boolean(
    props.versionId &&
    canRun.value &&
    (!needsRecord.value ||
      props.businessRef ||
      (canSamples.value &&
        samples.value.some((sample) => sample.recordId === sampleId.value))),
  ),
);
let generation = 0;
let sampleGeneration = 0;
let disposed = false;
let stream: AbortController | undefined;
let pending:
  | undefined
  | { expectedRevision: number; sceneKey: string; submission: SceneSubmission };
async function loadSamples() {
  const run = ++sampleGeneration;
  samples.value = [];
  sampleId.value = '';
  if (!canRun.value || !canSamples.value || !formId.value) return;
  sampleLoading.value = true;
  try {
    const result = await sceneDataSamples({
      objectKey: 'lowcode.record',
      formId: formId.value,
      keyword: keyword.value,
      pageNum: samplePage.value,
      pageSize: 20,
    });
    if (!disposed && run === sampleGeneration) {
      samples.value = result.records;
      sampleTotal.value = result.total;
    }
  } catch {
    if (!disposed && run === sampleGeneration)
      error.value = '授权样例读取失败，请重试。';
  } finally {
    if (!disposed && run === sampleGeneration) sampleLoading.value = false;
  }
}
function input(): SceneSubmission {
  let businessRef = props.businessRef;
  if (!businessRef && needsRecord.value && formId.value) {
    businessRef = {
      type: 'lowcode.record',
      id: `${formId.value}:${sampleId.value}`,
    };
  }
  return {
    ...(businessRef ? { businessRef } : {}),
    inputs: { user_request: requirement.value },
    idempotencyKey: crypto.randomUUID(),
  };
}
async function showPreview() {
  if (!ready.value || busy.value || active.value) return;
  const run = generation;
  busy.value = true;
  error.value = '';
  const submission = input();
  try {
    const result = await previewScene(props.sceneKey, {
      expectedRevision: props.revision,
      businessRef: submission.businessRef,
      inputs: submission.inputs,
    });
    if (!disposed && run === generation) preview.value = result;
  } catch {
    if (!disposed && run === generation)
      error.value = '预览失败，请检查当前授权和已保存配置。';
  } finally {
    if (!disposed && run === generation) busy.value = false;
  }
}
async function refresh() {
  if (!request.value) return;
  const id = request.value.requestId;
  const run = generation;
  try {
    const result = await getSceneRequest(id);
    if (!disposed && run === generation && request.value?.requestId === id)
      request.value = result;
  } catch {
    if (!disposed && run === generation)
      error.value = '状态查询失败，请保留请求 ID。';
  }
}
async function cancel() {
  if (!request.value) return;
  const run = generation;
  const id = request.value.requestId;
  try {
    const result = await cancelSceneRequest(id);
    if (!disposed && run === generation && request.value?.requestId === id) {
      request.value = result;
      stream?.abort();
    }
  } catch {
    if (!disposed && run === generation)
      error.value = '取消尚未确认，请查询原请求。';
  }
}
async function runTest() {
  if (
    !canRun.value ||
    busy.value ||
    active.value ||
    !confirmedCosts.value ||
    (!pending && !ready.value)
  )
    return;
  // A lost acceptance retries the original saved revision and idempotency key.
  pending ??= {
    sceneKey: props.sceneKey,
    expectedRevision: props.revision,
    submission: input(),
  };
  const run = generation;
  busy.value = true;
  error.value = '';
  output.value = '';
  try {
    const accepted = await testScene(pending.sceneKey, {
      expectedRevision: pending.expectedRevision,
      confirmedCosts: true,
      modelIndex: 0,
      submission: pending.submission,
    });
    if (disposed || run !== generation) {
      await cancelSceneRequest(accepted.requestId);
      return;
    }
    pending = undefined;
    request.value = accepted;
    if (!['QUEUED', 'RUNNING'].includes(accepted.status)) {
      error.value = '已返回原请求，历史正文未保留。';
      return;
    }
    stream = new AbortController();
    await subscribeAiRequest(
      accepted.requestId,
      (event) => {
        if (
          disposed ||
          run !== generation ||
          !request.value ||
          !['QUEUED', 'RUNNING'].includes(request.value.status)
        )
          return;
        if (event.type === 'delta') {
          if (output.value.length + (event.text?.length ?? 0) > 65_536)
            throw new Error('OUTPUT_LIMIT');
          output.value += event.text ?? '';
          request.value.status = 'RUNNING';
        }
        if (event.type === 'completed') request.value.status = 'SUCCEEDED';
        if (event.type === 'failed' || event.type === 'cancelled')
          request.value.status = event.status as SceneRequest['status'];
      },
      stream.signal,
    );
  } catch {
    if (!disposed && run === generation)
      error.value = request.value
        ? '连接中断，请查询原请求。'
        : '受理未确认，重试将查询原幂等请求。';
  } finally {
    if (!disposed && run === generation) busy.value = false;
  }
}
watch([formId, canSamples, canRun], () => {
  sampleGeneration++;
  samples.value = [];
  sampleId.value = '';
  // Changing a saved definition clears stale candidates. Reading records still requires an explicit open/search.
});
watch(expanded, (value) => {
  if (value) void loadSamples();
});
watch(
  () => props.sceneKey,
  () => {
    generation++;
    sampleGeneration++;
    stream?.abort();
    if (active.value && request.value)
      void cancelSceneRequest(request.value.requestId).catch(() => {});
    request.value = undefined;
    pending = undefined;
    preview.value = undefined;
    output.value = '';
    busy.value = false;
    error.value = '';
    confirmedCosts.value = false;
  },
);
onBeforeUnmount(() => {
  disposed = true;
  generation++;
  sampleGeneration++;
  stream?.abort();
  if (active.value && request.value)
    void cancelSceneRequest(request.value.requestId).catch(() => {});
});
</script>
<template>
  <details
    class="trial-panel"
    :open="expanded"
    @toggle.self="expanded = ($event.target as HTMLDetailsElement).open"
  >
    <summary>同页试运行</summary>
    <p v-if="!canRun" class="hint">
      试运行需要场景测试、调用及相应业务数据权限。
    </p>
    <template v-else>
      <p class="hint">
        按已保存的第 {{ revision }} 次修订执行；自动保存不会发起试运行。
      </p>
      <p v-if="businessRef" class="hint">使用上方选择的业务记录试运行。</p>
      <template v-else-if="needsRecord && formId">
        <p v-if="!canSamples" class="hint">
          没有记录列表权限，无法选择试运行样例。
        </p>
        <template v-else>
          <form
            @submit.prevent="
              samplePage = 1;
              loadSamples();
            "
          >
            <input
              v-model="keyword"
              aria-label="搜索试运行样例"
              placeholder="按记录标题搜索"
              maxlength="100"
            />
            <button type="submit">搜索样例</button>
          </form>
          <select
            v-model="sampleId"
            aria-label="试运行样例"
            :disabled="sampleLoading || busy || Boolean(active)"
          >
            <option value="">选择授权记录</option>
            <option
              v-for="sample in samples"
              :key="sample.recordId"
              :value="sample.recordId"
            >
              {{ sample.label }}
            </option>
          </select>
          <div class="actions">
            <button
              type="button"
              :disabled="samplePage <= 1"
              @click="
                samplePage--;
                loadSamples();
              "
            >
              上一页
            </button>
            <span>第 {{ samplePage }} 页</span>
            <button
              type="button"
              :disabled="BigInt(samplePage * 20) >= BigInt(sampleTotal)"
              @click="
                samplePage++;
                loadSamples();
              "
            >
              下一页
            </button>
          </div>
        </template>
      </template>
      <label>
        用户要求
        <textarea
          v-model="requirement"
          :disabled="busy || Boolean(active) || Boolean(pending)"
          maxlength="2048"
        ></textarea>
      </label>
      <div class="actions">
        <button
          type="button"
          :disabled="!ready || busy || Boolean(active)"
          @click="showPreview"
        >
          查看授权预览
        </button>
        <label>
          <input v-model="confirmedCosts" type="checkbox" />
          我确认主动试运行可能产生模型费用
        </label>
        <button
          type="button"
          :disabled="
            (!ready && !pending) || busy || Boolean(active) || !confirmedCosts
          "
          @click="runTest"
        >
          {{ pending ? '重试原请求' : '主动试运行' }}
        </button>
      </div>
      <p v-if="error" role="alert">{{ error }}</p>
      <section v-if="preview" aria-label="授权预览">
        <h3>授权预览</h3>
        <dl class="preview-summary">
          <div>
            <dt>已校验的场景版本</dt>
            <dd>{{ preview.sceneVersionId }}</dd>
          </div>
          <div>
            <dt>输入变量</dt>
            <dd>
              {{
                previewInputNames.length > 0
                  ? previewInputNames.join('、')
                  : '无输入变量'
              }}
            </dd>
          </div>
          <div>
            <dt>数据对象</dt>
            <dd>
              {{
                previewObjectNames.length > 0
                  ? previewObjectNames.join('、')
                  : '无数据对象'
              }}
            </dd>
          </div>
        </dl>
        <p class="hint">
          测试值与记录正文已隐去。此预览仅校验授权与配置，未调用模型。
        </p>
        <details v-if="preview.originalMessages.length > 0">
          <summary>查看原提示词</summary>
          <p class="hint">
            以下是未替换变量的配置原文，不代表实际注入模型的消息。
          </p>
          <pre v-for="(item, index) in preview.originalMessages" :key="index">{{
            item.content
          }}</pre>
        </details>
        <p v-for="notice in preview.notices" :key="notice">{{ notice }}</p>
      </section>
      <section v-if="request">
        <router-link
          v-if="request.conversationId && !active"
          :to="{
            path: '/ai/requests',
            query: { conversation: request.conversationId },
          }"
        >
          查看完整对话并追问
        </router-link>
        <p>请求 {{ request.requestId }} · {{ request.status }}</p>
        <p>执行快照 {{ request.sceneVersionId }}</p>
        <div class="actions">
          <button type="button" @click="refresh">查询原请求</button>
          <button v-if="active" type="button" @click="cancel">
            取消后续生成
          </button>
        </div>
        <pre>{{ output }}</pre>
      </section>
    </template>
  </details>
</template>
<style scoped>
.trial-panel {
  padding-top: 20px;
  margin-top: 28px;
  border-top: 1px solid hsl(var(--border));
}

summary {
  font-weight: 600;
  cursor: pointer;
}

.hint {
  margin: 14px 0;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.preview-summary {
  display: grid;
  gap: 12px;
  margin: 16px 0;
}

.preview-summary dt {
  font-weight: 600;
}

.preview-summary dd {
  margin-top: 4px;
  overflow-wrap: anywhere;
}

label {
  display: grid;
  gap: 8px;
  margin: 12px 0;
}

textarea,
select,
input:not([type='checkbox']) {
  width: 100%;
  padding: 10px;
  background: hsl(var(--background));
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
}

textarea {
  min-height: 90px;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  align-items: center;
  margin: 14px 0;
}

.actions label {
  display: flex;
  align-items: center;
  font-size: 12px;
}

button {
  color: hsl(var(--primary));
}

button:disabled {
  opacity: 0.45;
}

pre {
  max-height: 360px;
  padding: 14px;
  margin: 10px 0;
  overflow: auto;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  background: hsl(var(--accent));
  border-radius: 8px;
}

[role='alert'] {
  color: #b66a19;
}
</style>
