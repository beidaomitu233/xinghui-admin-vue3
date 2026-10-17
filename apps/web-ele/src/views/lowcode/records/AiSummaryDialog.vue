<script setup lang="ts">
import type { FormField } from '#/api/lowcode/forms';
import type { SceneRequest } from '#/api/system/ai-scene';

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { ElMessage } from 'element-plus';

import { subscribeAiRequest } from '#/api/system/ai-application';
import { aiErrorMessage, aiFailureInfo } from '#/api/system/ai-runtime-errors';
import {
  cancelSceneRequest,
  getSceneRequest,
  submitScene,
} from '#/api/system/ai-scene';

const props = defineProps<{
  fields: FormField[];
  formId: string;
  modelValue: boolean;
  recordId: string;
  sceneKey: string;
  writable: boolean;
}>();
const emit = defineEmits<{
  adopt: [fieldKey: string, text: string];
  'update:modelValue': [value: boolean];
}>();
const requirement = ref('请概括这条记录的主要信息。');
const text = ref('');
const request = ref<SceneRequest>();
const submitting = ref(false);
const connected = ref(false);
const completed = ref(false);
const error = ref('');
const traceId = ref('');
const fieldKey = ref('');
let generation = 0;
let stream: AbortController | undefined;
let streamStopped = false;
let pendingInput: Parameters<typeof submitScene>[1] | undefined;
const storageKey = () =>
  `ai-scene-summary:${props.sceneKey}:${props.formId}:${props.recordId}`;
const active = computed(() =>
  ['QUEUED', 'RUNNING'].includes(request.value?.status ?? ''),
);
const busy = computed(() => submitting.value || active.value);
const adoptable = computed(
  () => completed.value && request.value?.status === 'SUCCEEDED',
);
const fields = computed(() =>
  props.fields.filter(
    (field) =>
      ['text', 'textarea'].includes(field.type) &&
      field.maxLength >= text.value.length,
  ),
);
const statusLabel = computed(() => {
  const labels: Record<string, string> = {
    CANCELLED: '已取消',
    FAILED: '生成失败',
    INCOMPLETE: '生成未完成',
    QUEUED: '等待生成',
    RUNNING: '正在生成',
    SUCCEEDED: '生成成功',
    TIMED_OUT: '请求超时',
  };
  return labels[request.value?.status ?? ''] ?? '尚未提交';
});

async function refresh() {
  if (!request.value) return;
  const run = generation;
  const requestId = request.value.requestId;
  try {
    const original = await getSceneRequest(requestId);
    if (run === generation && request.value?.requestId === requestId)
      request.value = original;
  } catch {
    if (run === generation) error.value = '查询失败，请保留请求 ID。';
  }
}

async function restore() {
  try {
    const requestId = sessionStorage.getItem(storageKey());
    if (!requestId || !/^[1-9]\d{0,18}$/.test(requestId)) return;
    const run = generation;
    const original = await getSceneRequest(requestId);
    if (run !== generation) return;
    if (
      original.sceneKey !== props.sceneKey ||
      original.businessRef?.type !== 'lowcode.record' ||
      original.businessRef.id !== `${props.formId}:${props.recordId}`
    )
      return;
    request.value = original;
    error.value = '原请求已恢复，历史正文未保留。';
  } catch {
    // Private browsing or another identity may make stored metadata unavailable.
  }
}

async function generate() {
  if (busy.value || import.meta.env.VITE_APP_DEMO === 'true') return;
  if (!pendingInput || request.value) {
    pendingInput = {
      businessRef: {
        id: `${props.formId}:${props.recordId}`,
        type: 'lowcode.record',
      },
      idempotencyKey: crypto.randomUUID(),
      inputs: { user_request: requirement.value },
    };
    text.value = '';
    request.value = undefined;
    traceId.value = '';
  }
  const run = ++generation;
  submitting.value = true;
  completed.value = false;
  error.value = '';
  try {
    const accepted = await submitScene(props.sceneKey, pendingInput);
    if (run !== generation) {
      await cancelSceneRequest(accepted.requestId);
      return;
    }
    request.value = accepted;
    traceId.value = accepted.requestId;
    try {
      // Store only the server ID, never the prompt, user input or generated content.
      sessionStorage.setItem(storageKey(), accepted.requestId);
    } catch {
      // Request tracking still works in the open dialog if browser storage is unavailable.
    }
    submitting.value = false;
    pendingInput = undefined;
    if (!['QUEUED', 'RUNNING'].includes(accepted.status)) {
      error.value = '已返回原请求，历史正文未保留。';
      return;
    }
    stream = new AbortController();
    streamStopped = false;
    connected.value = true;
    await subscribeAiRequest(
      accepted.requestId,
      (event) => {
        if (run !== generation || !request.value || streamStopped) return;
        if (event.type === 'delta') {
          if (!['QUEUED', 'RUNNING'].includes(request.value.status)) return;
          if (text.value.length + (event.text?.length ?? 0) > 65_536) {
            throw new Error('OUTPUT_LIMIT');
          }
          text.value += event.text ?? '';
          request.value.status = 'RUNNING';
        }
        if (event.type === 'usage') {
          request.value.inputTokens = event.inputTokens ?? null;
          request.value.outputTokens = event.outputTokens ?? null;
        }
        if (event.type === 'completed') {
          request.value.status = 'SUCCEEDED';
          completed.value = true;
          streamStopped = true;
        }
        if (event.type === 'failed' || event.type === 'cancelled') {
          request.value.status = event.status as SceneRequest['status'];
          error.value = aiErrorMessage(event.errorCode);
          streamStopped = true;
        }
      },
      stream.signal,
    );
  } catch (error_) {
    if (run === generation && request.value?.status !== 'CANCELLED') {
      completed.value = false;
      const info = aiFailureInfo(error_);
      if (!request.value && info.requestId) {
        traceId.value = info.requestId;
        error.value = aiErrorMessage(info.code);
        if (/^[1-9]\d{0,18}$/.test(info.requestId)) {
          try {
            const original = await getSceneRequest(info.requestId);
            if (run !== generation) return;
            request.value = original;
            pendingInput = undefined;
            sessionStorage.setItem(storageKey(), original.requestId);
          } catch {
            /* The trace is still useful when metadata cannot be read. */
          }
        }
        return;
      }
      error.value = request.value
        ? '连接中断，请查询原请求。'
        : '受理未确认，请确认原受理结果。';
      if (request.value) await refresh();
    }
  } finally {
    if (run === generation) {
      submitting.value = false;
      connected.value = false;
    }
  }
}

async function cancel() {
  if (!request.value) return;
  const run = generation;
  const requestId = request.value.requestId;
  const currentStream = stream;
  try {
    const original = await cancelSceneRequest(requestId);
    if (run === generation && request.value?.requestId === requestId) {
      request.value = original;
      streamStopped = true;
      currentStream?.abort();
      connected.value = false;
    }
  } catch {
    if (run === generation) error.value = '取消尚未确认，请查询原请求状态。';
  }
}

async function close() {
  if (submitting.value) return;
  if (active.value) await cancel();
  if (active.value) return;
  stream?.abort();
  streamStopped = true;
  emit('update:modelValue', false);
}

async function copy() {
  try {
    await navigator.clipboard.writeText(text.value);
    ElMessage.success('摘要已复制');
  } catch {
    ElMessage.warning('复制失败，可手动选择摘要内容复制');
  }
}

function adopt() {
  if (
    !props.writable ||
    !adoptable.value ||
    !fields.value.some((field) => field.fieldKey === fieldKey.value)
  )
    return;
  emit('adopt', fieldKey.value, text.value);
  emit('update:modelValue', false);
}

watch(
  () => [props.sceneKey, props.formId, props.recordId],
  () => {
    if (active.value && request.value) {
      void cancelSceneRequest(request.value.requestId).catch(() => {});
    }
    generation++;
    stream?.abort();
    request.value = undefined;
    pendingInput = undefined;
    text.value = '';
    error.value = '';
    traceId.value = '';
    completed.value = false;
    submitting.value = false;
    fieldKey.value = '';
    void restore();
  },
);
onMounted(restore);
onBeforeUnmount(() => {
  generation++;
  stream?.abort();
  if (active.value && request.value) {
    void cancelSceneRequest(request.value.requestId).catch(() => {});
  }
});
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="AI 记录摘要"
    width="min(760px,92vw)"
    :close-on-click-modal="false"
    :show-close="!submitting"
    :close-on-press-escape="!submitting"
    :before-close="close"
  >
    <el-alert
      title="仅用授权字段，结果不会自动保存。"
      type="info"
      closable
      class="mb-3"
    />
    <el-input
      v-model="requirement"
      type="textarea"
      :rows="3"
      :disabled="busy || !!pendingInput"
      maxlength="2048"
      aria-label="摘要要求"
      show-word-limit
    />
    <div class="my-3 flex flex-wrap items-center gap-2">
      <el-button
        type="primary"
        :disabled="busy || !requirement.trim()"
        @click="generate"
      >
        {{
          pendingInput ? '确认原受理结果' : request ? '重新生成' : '生成摘要'
        }}
      </el-button>
      <el-button v-if="active" @click="cancel">取消生成</el-button>
      <el-button v-if="request" @click="refresh">查询原请求</el-button>
      <span>{{ statusLabel }}{{ connected ? ' · 已连接' : '' }}</span>
    </div>
    <el-alert
      v-if="error"
      :title="error"
      type="warning"
      closable
      class="mb-3"
      @close="error = ''"
    />
    <p v-if="request" class="mb-2 break-all text-sm">
      请求 ID：{{ request.requestId }} · 场景版本：{{ request.sceneVersionId }}
    </p>
    <p v-else-if="traceId" class="mb-2 break-all text-sm">
      追踪 ID：{{ traceId }}
    </p>
    <el-input
      :model-value="text"
      type="textarea"
      :rows="12"
      readonly
      aria-label="摘要结果"
    />
    <el-alert
      v-if="request && !connected && !completed"
      class="mt-2 text-sm text-muted-foreground"
      title="正文不保留，刷新后仅能查询状态。"
      type="info"
      closable
    />
    <div
      v-if="writable && adoptable && fields.length > 0"
      class="mt-3 flex flex-wrap gap-2"
    >
      <el-select
        v-model="fieldKey"
        placeholder="选择填入编辑草稿的文字字段"
        class="w-72"
        aria-label="采纳目标字段"
      >
        <el-option
          v-for="field in fields"
          :key="field.fieldKey"
          :label="field.label"
          :value="field.fieldKey"
        />
      </el-select>
      <el-button :disabled="!fieldKey" @click="adopt">填入编辑草稿</el-button>
      <span class="text-sm text-muted-foreground">
        检查后仍需在编辑窗口点击保存。
      </span>
    </div>
    <template #footer>
      <el-button :disabled="submitting" @click="close">关闭</el-button>
      <el-button :disabled="!text" @click="copy">复制当前内容</el-button>
    </template>
  </el-dialog>
</template>
