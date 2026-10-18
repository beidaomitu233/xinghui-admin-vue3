<script setup lang="ts">
import type { DatabaseRecord } from '#/api/system/ai-database';
import type {
  SceneDefinition,
  SceneModelOption,
  ScenePreview,
  SceneRequest,
  SceneSubmission,
} from '#/api/system/ai-scene';

import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';

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
  ElOption,
  ElSelect,
  ElTabPane,
  ElTabs,
  ElTag,
} from 'element-plus';

import { subscribeAiRequest } from '#/api/system/ai-application';
import { getConversation } from '#/api/system/ai-conversation';
import { aiErrorMessage, aiFailureInfo } from '#/api/system/ai-runtime-errors';
import {
  cancelSceneRequest,
  getSceneRequest,
  previewScene,
  sceneEntries,
  testScene,
} from '#/api/system/ai-scene';

import DatabaseRecordPicker from './DatabaseRecordPicker.vue';

const props = defineProps<{
  businessRef?: SceneSubmission['businessRef'];
  definition: SceneDefinition;
  models?: SceneModelOption[];
  prepare?: () => Promise<boolean>;
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
const expanded = ref(false);
const opening = ref(false);
const requirement = ref('');
const confirmedCosts = ref(false);
const preview = ref<ScenePreview>();
const request = ref<SceneRequest>();
const output = ref('');
const error = ref('');
const busy = ref(false);
const modelIndex = ref(0);
const activeTab = ref('answer');
const record = ref<DatabaseRecord | null>(null);
const contextReady = ref(!props.definition.sqlBindings?.length);
const contextRequired = ref(false);
const queryContextSource = ref('');
const prepared = ref(true);
const currentSource = computed(() => {
  if (queryContextSource.value) return queryContextSource.value;
  const binding = props.definition.dataBindings?.find(
    (binding) => binding.row?.currentRecord,
  );
  if (binding) return binding.sourceKey;
  const formId = props.definition.dataObjects[0]?.formId;
  return formId ? `lowcode.${formId}` : '';
});
const businessRef = computed(
  () => props.businessRef ?? record.value?.businessRef,
);
const active = computed(() =>
  Boolean(
    request.value && ['QUEUED', 'RUNNING'].includes(request.value.status),
  ),
);
const ready = computed(() =>
  Boolean(
    props.versionId &&
    canRun.value &&
    prepared.value &&
    contextReady.value &&
    ((!currentSource.value && !contextRequired.value) || businessRef.value),
  ),
);
const statusLabels: Record<string, string> = {
  CANCELLED: '已取消',
  FAILED: '生成失败',
  INCOMPLETE: '生成未完成',
  QUEUED: '等待生成',
  RUNNING: '正在生成',
  SUCCEEDED: '已完成',
  TIMED_OUT: '生成超时',
};
let generation = 0;
let disposed = false;
let stream: AbortController | undefined;
let pending:
  | undefined
  | {
      expectedRevision: number;
      modelIndex: number;
      sceneKey: string;
      submission: SceneSubmission;
    };
function modelLabel(index: number) {
  const binding = props.definition.modelPolicy.models[index];
  const option = props.models?.find(
    (model) =>
      model.model.modelRef === binding?.model.modelRef &&
      model.model.configVersion === binding?.model.configVersion,
  );
  return option
    ? `${option.configName} · ${option.modelCode}`
    : `已保存组合 ${index + 1}`;
}
async function openTrial() {
  if (!canRun.value || opening.value) return;
  opening.value = true;
  prepared.value = false;
  error.value = '';
  const run = generation;
  try {
    if (props.prepare && !(await props.prepare())) {
      error.value = '请先处理未保存内容。';
      return;
    }
    await nextTick();
    if (disposed || run !== generation) return;
    if (props.definition.sqlBindings?.length) {
      contextReady.value = false;
      const entries = await sceneEntries();
      if (disposed || run !== generation) return;
      const entry = entries.find((entry) => entry.sceneKey === props.sceneKey);
      if (
        !entry ||
        entry.revision !== props.revision ||
        typeof entry.contextRequired !== 'boolean'
      ) {
        error.value = '当前场景上下文未读到，请重新读取场景后试运行。';
        return;
      }
      contextRequired.value = entry.contextRequired;
      queryContextSource.value = entry.contextSourceKey ?? '';
      contextReady.value = true;
    } else contextReady.value = true;
    prepared.value = true;
    if (!disposed) expanded.value = true;
  } catch {
    if (!disposed) error.value = '保存尚未确认，请检查后重试。';
  } finally {
    if (!disposed && run === generation) {
      opening.value = false;
      if (error.value) expanded.value = true;
    }
  }
}
function input(): SceneSubmission {
  return {
    businessRef: businessRef.value,
    inputs: { user_request: requirement.value },
    idempotencyKey: crypto.randomUUID(),
  };
}
async function showPreview() {
  if (!ready.value || busy.value || active.value) return;
  const run = generation;
  busy.value = true;
  error.value = '';
  try {
    const submission = input();
    const value = await previewScene(props.sceneKey, {
      expectedRevision: props.revision,
      businessRef: submission.businessRef,
      inputs: submission.inputs,
    });
    if (!disposed && run === generation) {
      preview.value = value;
      activeTab.value = 'preview';
    }
  } catch (error_) {
    if (!disposed && run === generation)
      error.value = aiErrorMessage(aiFailureInfo(error_).code);
  } finally {
    if (!disposed && run === generation) busy.value = false;
  }
}
async function readPersisted(value: SceneRequest, run: number) {
  if (!value.conversationId) return;
  const conversation = await getConversation(value.conversationId);
  if (
    disposed ||
    run !== generation ||
    request.value?.requestId !== value.requestId
  )
    return;
  const message = conversation.messages.find(
    (item) => item.requestId === value.requestId && item.role === 'ASSISTANT',
  );
  if (message) output.value = message.content;
}
async function refresh() {
  if (!request.value) return;
  const id = request.value.requestId;
  const run = generation;
  try {
    const value = await getSceneRequest(id);
    if (!disposed && run === generation && request.value?.requestId === id) {
      request.value = value;
      await readPersisted(value, run);
    }
  } catch {
    if (!disposed && run === generation)
      error.value = '状态暂未读到，请重试查询。';
  }
}
async function cancel() {
  if (!request.value) return;
  const run = generation;
  const id = request.value.requestId;
  try {
    const value = await cancelSceneRequest(id);
    if (!disposed && run === generation && request.value?.requestId === id) {
      request.value = value;
      stream?.abort();
      await readPersisted(value, run);
    }
  } catch {
    if (!disposed && run === generation)
      error.value = '取消尚未确认，请查询原请求。';
  }
}
async function closeTrial(done?: () => void) {
  if (busy.value && !active.value) return;
  if (active.value) await cancel();
  if (active.value) return;
  stream?.abort();
  expanded.value = false;
  done?.();
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
  pending ??= {
    sceneKey: props.sceneKey,
    expectedRevision: props.revision,
    modelIndex: modelIndex.value,
    submission: input(),
  };
  const run = generation;
  busy.value = true;
  error.value = '';
  output.value = '';
  activeTab.value = 'answer';
  try {
    const accepted = await testScene(pending.sceneKey, {
      expectedRevision: pending.expectedRevision,
      confirmedCosts: true,
      modelIndex: pending.modelIndex,
      submission: pending.submission,
    });
    if (disposed || run !== generation) {
      await cancelSceneRequest(accepted.requestId);
      return;
    }
    pending = undefined;
    request.value = accepted;
    busy.value = false;
    if (!['QUEUED', 'RUNNING'].includes(accepted.status)) {
      await readPersisted(accepted, run);
      if (!accepted.conversationId) error.value = '旧记录未保留对话。';
      return;
    }
    stream = new AbortController();
    let sequence = 0;
    await subscribeAiRequest(
      accepted.requestId,
      (event) => {
        if (
          disposed ||
          run !== generation ||
          !request.value ||
          !active.value ||
          event.sequence <= sequence
        )
          return;
        sequence = event.sequence;
        if (event.type === 'delta') {
          if (output.value.length + (event.text?.length ?? 0) > 262_144)
            throw new Error('OUTPUT_LIMIT');
          output.value += event.text ?? '';
          request.value.status = 'RUNNING';
        }
        if (event.type === 'completed') request.value.status = 'SUCCEEDED';
        if (event.type === 'failed' || event.type === 'cancelled') {
          request.value.status = event.status as SceneRequest['status'];
          error.value = aiErrorMessage(event.errorCode);
        }
      },
      stream.signal,
    );
    if (!disposed && run === generation && request.value?.conversationId)
      await refresh();
  } catch (error_) {
    if (
      !disposed &&
      run === generation &&
      request.value?.status !== 'CANCELLED'
    ) {
      error.value = request.value
        ? '实时连接中断，可查询已保存消息。'
        : '受理尚未确认，重试仍使用原请求。';
      if (request.value) await refresh();
      else {
        const code = aiFailureInfo(error_).code;
        if (code) error.value = aiErrorMessage(code);
      }
    }
  } finally {
    if (!disposed && run === generation) busy.value = false;
  }
}
watch(
  () => [props.sceneKey, access.accessToken, canRun.value],
  () => {
    generation++;
    stream?.abort();
    if (active.value && request.value)
      void cancelSceneRequest(request.value.requestId).catch(() => {});
    request.value = undefined;
    pending = undefined;
    preview.value = undefined;
    output.value = '';
    error.value = '';
    busy.value = false;
    confirmedCosts.value = false;
    modelIndex.value = 0;
    record.value = null;
    contextReady.value = !props.definition.sqlBindings?.length;
    contextRequired.value = false;
    queryContextSource.value = '';
    prepared.value = true;
    expanded.value = false;
  },
);
onBeforeUnmount(() => {
  disposed = true;
  generation++;
  stream?.abort();
  if (active.value && request.value)
    void cancelSceneRequest(request.value.requestId).catch(() => {});
});
</script>
<template>
  <span class="scene-trial-entry">
    <ElButton
      :disabled="!canRun || !versionId"
      :loading="opening"
      @click="openTrial"
    >
      试运行
    </ElButton>
    <ElDrawer
      :model-value="expanded"
      title="场景试运行"
      size="min(800px, 100vw)"
      :close-on-click-modal="false"
      :before-close="closeTrial"
    >
      <ElForm label-position="top" class="trial-form">
        <ElFormItem label="试运行组合">
          <ElSelect
            v-model="modelIndex"
            aria-label="试运行组合"
            :disabled="busy || active || Boolean(pending)"
          >
            <ElOption
              v-for="(_, index) in definition.modelPolicy.models"
              :key="index"
              :value="index"
              :label="modelLabel(index)"
            />
          </ElSelect>
        </ElFormItem>
        <p class="trial-hint">测试所选组合；正式对话按场景优先级自动切换。</p>
        <ElFormItem
          v-if="currentSource && !props.businessRef"
          label="业务记录"
          required
        >
          <DatabaseRecordPicker
            v-model="record"
            :source-key="currentSource"
            :readonly="busy || active || Boolean(pending)"
            label="选择试运行记录"
          />
        </ElFormItem>
        <p v-else-if="businessRef" class="trial-hint">沿用已选择的业务记录。</p>
        <p v-else-if="contextRequired && !currentSource" class="trial-hint">
          此场景需要业务入口提供记录，请从对应业务记录调用。
        </p>
        <ElFormItem label="用户要求">
          <ElInput
            v-model="requirement"
            type="textarea"
            :rows="4"
            aria-label="试运行要求"
            :disabled="busy || active || Boolean(pending)"
            maxlength="2048"
            placeholder="输入本次要验证的问题"
          />
        </ElFormItem>
      </ElForm>
      <ElAlert
        v-if="error"
        :title="error"
        type="warning"
        show-icon
        closable
        @close="error = ''"
      />
      <ElTabs v-model="activeTab" class="trial-results">
        <ElTabPane label="回答" name="answer">
          <div v-if="request" class="trial-result-heading">
            <ElTag :type="request.status === 'SUCCEEDED' ? 'success' : 'info'">
              {{ statusLabels[request.status] || '处理中' }}
            </ElTag>
            <ElButton link @click="refresh">查询原请求</ElButton>
            <ElButton v-if="active" link @click="cancel">取消生成</ElButton>
            <router-link
              v-if="request.conversationId && !active"
              :to="{
                path: '/ai/requests',
                query: { conversation: request.conversationId },
              }"
            >
              查看完整对话并追问
            </router-link>
          </div>
          <pre v-if="output" class="trial-output">{{ output }}</pre>
          <ElEmpty
            v-else
            :description="
              active
                ? '正在生成回答…'
                : request
                  ? '本轮尚无完整回答'
                  : '试运行后在此查看回答'
            "
            :image-size="60"
          />
          <p
            v-if="output && request?.status !== 'SUCCEEDED'"
            class="trial-hint"
          >
            当前是未完成的回答，不会作为完整问答使用。
          </p>
        </ElTabPane>
        <ElTabPane label="发送预览" name="preview">
          <template v-if="preview">
            <p class="trial-hint">
              来自当前保存快照的授权数据预览，未调用模型。
            </p>
            <article
              v-for="receipt in preview.reads ?? []"
              :key="receipt.variable"
              class="trial-data"
            >
              <h3>
                {{
                  definition.dataBindings?.find(
                    (binding) => binding.variable === receipt.variable,
                  )?.label ?? receipt.variable
                }}
                <ElTag size="small" effect="plain">
                  {{ receipt.rowCount }} 行{{
                    receipt.truncated ? ' · 已截断' : ''
                  }}
                </ElTag>
              </h3>
              <pre>{{
                JSON.stringify(preview.dataValues?.[receipt.variable], null, 2)
              }}</pre>
            </article>
            <div
              v-for="(item, index) in preview.renderedMessages"
              :key="index"
              class="trial-message"
            >
              <ElTag effect="plain" size="small">
                {{ item.role === 'SYSTEM' ? '系统指令' : '输入内容' }}
              </ElTag>
              <pre>{{ item.content }}</pre>
            </div>
          </template>
          <ElEmpty
            v-else
            description="点击授权预览查看实际发送内容"
            :image-size="60"
          />
        </ElTabPane>
        <ElTabPane label="执行信息" name="trace">
          <p v-if="request" class="trial-hint">
            请求 {{ request.requestId }} · 执行快照 {{ request.sceneVersionId }}
          </p>
          <p v-if="preview" class="trial-hint">
            已校验快照 {{ preview.sceneVersionId }}
          </p>
          <ElEmpty
            v-if="!request && !preview"
            description="暂无执行信息"
            :image-size="60"
          />
        </ElTabPane>
      </ElTabs>
      <template #footer>
        <div class="trial-footer">
          <ElCheckbox v-model="confirmedCosts" :disabled="busy || active">
            确认主动试运行可能产生模型费用
          </ElCheckbox>
          <div>
            <ElButton :disabled="busy && !active" @click="closeTrial()">
              {{ active ? '取消并关闭' : '关闭' }}
            </ElButton>
            <ElButton
              :disabled="!ready || busy || active || Boolean(pending)"
              @click="showPreview"
            >
              授权预览
            </ElButton>
            <ElButton
              type="primary"
              :loading="busy"
              :disabled="(!ready && !pending) || active || !confirmedCosts"
              @click="runTest"
            >
              {{ pending ? '重试原请求' : '主动试运行' }}
            </ElButton>
          </div>
        </div>
      </template>
    </ElDrawer>
  </span>
</template>
<style scoped>
.scene-trial-entry {
  display: inline-flex;
}

.trial-form {
  display: grid;
  gap: 4px;
}

.trial-form :deep(.el-select) {
  width: 100%;
}

.trial-hint {
  margin-bottom: 14px;
  font-size: 12px;
  line-height: 1.7;
  color: hsl(var(--muted-foreground));
}

.trial-results {
  margin-top: 20px;
}

.trial-result-heading {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin: 12px 0;
}

.trial-output,
.trial-data pre,
.trial-message pre {
  padding: 18px;
  font-size: 14px;
  line-height: 1.9;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  background: hsl(var(--muted) / 45%);
  border-radius: 8px;
}

.trial-data,
.trial-message {
  margin: 20px 0;
}

h3 {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 10px;
  font-size: 14px;
  font-weight: 600;
}

.trial-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
}

.trial-footer :deep(.el-checkbox) {
  white-space: normal;
}

@media (max-width: 700px) {
  .trial-footer > div {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .trial-footer :deep(.el-button) {
    margin: 0;
  }
}
</style>
