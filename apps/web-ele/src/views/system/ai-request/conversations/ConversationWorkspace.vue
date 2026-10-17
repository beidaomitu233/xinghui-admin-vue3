<script setup lang="ts">
import type { ConversationDraft } from './view-model';

import type {
  ConversationAccepted,
  ConversationContinue,
  ConversationDetail,
  ConversationStart,
  ConversationSummary,
} from '#/api/system/ai-conversation';
import type { DatabaseRecord } from '#/api/system/ai-database';
import type { SceneEntry, SceneSubmission } from '#/api/system/ai-scene';

import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowReactive,
  watch,
} from 'vue';
import { useRoute } from 'vue-router';

import { useAccessStore } from '@vben/stores';

import { requestClient } from '#/api/request';
import { subscribeAiRequest } from '#/api/system/ai-application';
import {
  continueConversation,
  getConversation,
  listConversations,
  startConversation,
} from '#/api/system/ai-conversation';
import { aiFailureInfo } from '#/api/system/ai-runtime-errors';
import { cancelSceneRequest } from '#/api/system/ai-scene';

import SimpleSettingsPanel from '../../ai-config/SimpleSettingsPanel.vue';
import DatabaseRecordPicker from '../../ai-template/workspace/DatabaseRecordPicker.vue';
import { conversationItem, conversationMessage } from './adapter';
import ConversationBoard from './ConversationBoard.vue';
import { ConversationSendFailure } from './view-model';

const props = defineProps<{ initialKeySettings?: boolean }>();
const access = useAccessStore();
const route = useRoute();
const can = (code: string) => access.accessCodes.includes(code);
const scope = ref<'AUDIT' | 'OWN'>('OWN');
const page = ref(1);
const total = ref('0');
const search = ref('');
const rows = ref<ConversationSummary[]>([]);
const detail = ref<ConversationDetail>();
const selected = ref<ConversationSummary | null>(null);
const sceneOptions = ref<SceneEntry[]>([]);
const listLoading = ref(false);
const messageLoading = ref(false);
const error = ref('');
const notice = ref('');
const settingsOpen = ref(
  Boolean(props.initialKeySettings || route.query.settings === 'keys'),
);
const businessRef = ref<SceneSubmission['businessRef']>(null);
const newSceneKey = ref('');
const contextSource = ref('');
const contextRecord = ref<DatabaseRecord | null>(null);
const contextLoading = ref(false);
const contextInvalid = ref(false);
const identityVersion = ref(0);
const availableScenes = computed(() =>
  sceneOptions.value.filter((scene) => scene.canStartFromMonitor === true),
);
let contextGeneration = 0;
const pendingRequests = shallowReactive(
  new Map<string, { requestId: string; stop: AbortController }>(),
);
const frozen = new Map<
  string,
  {
    body: ConversationContinue | ConversationStart;
    conversationId: null | string;
  }
>();
let listGeneration = 0;
let selectionGeneration = 0;
let alive = true;
const canSettings = computed(() =>
  access.accessCodes.some((code) =>
    /^ai:(?:config|model):(?:list|query|add|edit|test|enable)$/.test(code),
  ),
);
const activeMessage = computed(() =>
  [...(detail.value?.messages ?? [])]
    .toReversed()
    .find(
      (message) =>
        message.role === 'ASSISTANT' &&
        ['QUEUED', 'RUNNING'].includes(message.status),
    ),
);
const working = computed(() =>
  Boolean(
    activeMessage.value ||
    (selected.value && pendingRequests.has(selected.value.conversationId)),
  ),
);
const canReply = computed(
  () =>
    scope.value === 'OWN' &&
    Boolean(selected.value?.canContinue) &&
    can('ai:scene:invoke') &&
    (selected.value?.kind !== 'TEST' || can('ai:scene:test')),
);
async function loadList() {
  if (!can('ai:request:list')) return;
  const run = ++listGeneration;
  listLoading.value = true;
  const session = access.accessToken;
  try {
    const result = await listConversations({
      scope: scope.value,
      search: search.value,
      pageNum: page.value,
      pageSize: 20,
    });
    if (!alive || run !== listGeneration || access.accessToken !== session)
      return;
    rows.value = result.records;
    total.value = result.total;
  } catch {
    if (alive && run === listGeneration)
      error.value = '对话列表读取失败，请重试。';
  } finally {
    if (alive && run === listGeneration) listLoading.value = false;
  }
}
function updateSummary(summary: ConversationSummary) {
  const index = rows.value.findIndex(
    (row) => row.conversationId === summary.conversationId,
  );
  if (index === -1 && scope.value === 'OWN') rows.value.unshift(summary);
  else if (index !== -1) rows.value[index] = summary;
}
async function selectConversation(id: string, reset = true) {
  const run = ++selectionGeneration;
  if (reset) {
    detail.value = undefined;
    selected.value =
      rows.value.find((row) => row.conversationId === id) ?? null;
  }
  messageLoading.value = true;
  try {
    const result = await getConversation(id, scope.value);
    if (!alive || run !== selectionGeneration) return;
    detail.value = result;
    selected.value = result.conversation;
    updateSummary(result.conversation);
    if (result.notice) notice.value = result.notice;
    const active = [...result.messages]
      .toReversed()
      .find(
        (message) =>
          message.role === 'ASSISTANT' &&
          ['QUEUED', 'RUNNING'].includes(message.status),
      );
    if (active && scope.value === 'OWN' && can('ai:scene:invoke'))
      void track(result.conversation.conversationId, active.requestId);
  } catch {
    if (alive && run === selectionGeneration)
      error.value = '对话读取失败或已无访问权限，请重试。';
  } finally {
    if (alive && run === selectionGeneration) messageLoading.value = false;
  }
}
async function refreshSelected(id: string) {
  if (!alive || scope.value !== 'OWN') return;
  const session = access.accessToken;
  try {
    const result = await getConversation(id);
    if (!alive || scope.value !== 'OWN' || session !== access.accessToken)
      return;
    updateSummary(result.conversation);
    if (selected.value?.conversationId === id) {
      detail.value = result;
      selected.value = result.conversation;
    }
  } catch {
    if (alive && selected.value?.conversationId === id)
      error.value = '请求已受理，对话记录暂未读到，请刷新原对话。';
  }
}
async function track(conversationId: string, requestId: string) {
  if (pendingRequests.get(conversationId)?.requestId === requestId) return;
  pendingRequests.get(conversationId)?.stop.abort();
  const stop = new AbortController();
  const token = { requestId, stop };
  pendingRequests.set(conversationId, token);
  let sequence = 0;
  let streamed = '';
  try {
    await subscribeAiRequest(
      requestId,
      (event) => {
        if (
          !alive ||
          pendingRequests.get(conversationId) !== token ||
          scope.value !== 'OWN' ||
          event.sequence <= sequence
        )
          return;
        sequence = event.sequence;
        if (selected.value?.conversationId === conversationId) {
          const assistant = detail.value?.messages.find(
            (message) =>
              message.requestId === requestId && message.role === 'ASSISTANT',
          );
          if (assistant && event.type === 'delta') {
            if (streamed.length + (event.text?.length ?? 0) > 131_072)
              throw new Error('OUTPUT_LIMIT');
            streamed += event.text ?? '';
            if (streamed.length >= assistant.content.length)
              assistant.content = streamed;
            assistant.status = 'RUNNING';
          }
          if (assistant && event.type === 'completed')
            assistant.status = 'SUCCEEDED';
          if (assistant && ['cancelled', 'failed'].includes(event.type)) {
            assistant.partial = Boolean(assistant.content);
            assistant.status = event.status as typeof assistant.status;
            assistant.errorCode = event.errorCode ?? null;
          }
        }
      },
      stop.signal,
    );
  } catch {
    if (
      alive &&
      !stop.signal.aborted &&
      selected.value?.conversationId === conversationId
    )
      error.value = '实时连接中断，正在读取已保存的消息。';
  } finally {
    if (pendingRequests.get(conversationId) === token)
      pendingRequests.delete(conversationId);
    if (alive && !stop.signal.aborted) {
      await refreshSelected(conversationId);
      void loadList();
    }
  }
}
function status(error: unknown) {
  return (error as null | { response?: { status?: number } })?.response?.status;
}
async function submit(draft: ConversationDraft) {
  if (!can('ai:scene:invoke') || scope.value !== 'OWN')
    throw new ConversationSendFailure(
      'rejected',
      '当前会话只能查看，不能继续提问。',
    );
  if (
    !draft.conversationKey &&
    (contextLoading.value ||
      contextInvalid.value ||
      (contextSource.value && !contextRecord.value))
  )
    throw new ConversationSendFailure(
      'rejected',
      '请先选择该场景所需的业务记录。',
    );
  const session = access.accessToken;
  const selectionAtSubmit = selectionGeneration;
  let attempt = frozen.get(draft.token);
  if (!attempt) {
    if (draft.conversationKey) {
      if (
        selected.value?.conversationId !== draft.conversationKey ||
        !canReply.value
      )
        throw new ConversationSendFailure(
          'rejected',
          '请先读取可继续提问的本人会话。',
        );
      const test =
        selected.value.kind === 'TEST'
          ? sceneOptions.value.find(
              (scene) => scene.sceneKey === draft.sceneKey,
            )
          : undefined;
      if (selected.value.kind === 'TEST' && !test)
        throw new ConversationSendFailure(
          'rejected',
          '当前场景暂不可继续试运行，请刷新。',
        );
      attempt = {
        conversationId: draft.conversationKey,
        body: {
          expectedRevision: selected.value.revision,
          message: draft.text,
          clientMutationId: draft.token,
          test: test
            ? {
                expectedSceneRevision: test.revision,
                modelIndex: 0,
                confirmedCosts: true,
              }
            : null,
        },
      };
    } else {
      attempt = {
        conversationId: null,
        body: {
          sceneKey: draft.sceneKey,
          kind: 'BUSINESS',
          message: draft.text,
          clientMutationId: draft.token,
          businessRef: businessRef.value ? { ...businessRef.value } : null,
          test: null,
        },
      };
    }
    frozen.set(draft.token, attempt);
  }
  let accepted: ConversationAccepted;
  try {
    accepted = attempt.conversationId
      ? await continueConversation(
          attempt.conversationId,
          attempt.body as ConversationContinue,
        )
      : await startConversation(attempt.body as ConversationStart);
  } catch (error_) {
    const code = status(error_);
    if (code && [400, 401, 403, 404, 409, 413, 429].includes(code)) {
      frozen.delete(draft.token);
      if (draft.conversationKey) void refreshSelected(draft.conversationKey);
      let message = '消息未被受理，请检查输入后重试。';
      const errorCode = aiFailureInfo(error_).code;
      if (errorCode === 'CONVERSATION_FULL')
        message = '此对话已达长度上限，请新建对话；已有历史仍可查看。';
      else if (code === 409) message = '该会话正在回答或已更新，请刷新后继续。';
      else if (code === 403) message = '当前无调用或数据读取权限。';
      throw new ConversationSendFailure('rejected', message);
    }
    throw new ConversationSendFailure(
      'unknown',
      '受理结果尚未确认，重试会使用原消息。',
    );
  }
  frozen.delete(draft.token);
  if (!alive || session !== access.accessToken || scope.value !== 'OWN')
    return { conversationKey: accepted.conversationId };
  if (accepted.contextTruncated)
    notice.value = '本轮上下文按长度保留了最近的成功问答，完整历史仍可查看。';
  if (
    !draft.conversationKey &&
    selected.value === null &&
    selectionAtSubmit === selectionGeneration
  )
    selected.value = {
      conversationId: accepted.conversationId,
      title: '正在读取新对话',
      sceneKey: draft.sceneKey,
      sceneName:
        sceneOptions.value.find((scene) => scene.sceneKey === draft.sceneKey)
          ?.name ?? '对话场景',
      kind: 'BUSINESS',
      businessRef: (attempt.body as ConversationStart).businessRef,
      sourceLabel: '',
      revision: accepted.revision,
      status: accepted.status,
      lastMessage: '',
      updatedAt: new Date().toISOString(),
      history: 'COMPLETE',
      canContinue: false,
    };
  await refreshSelected(accepted.conversationId);
  if (alive) {
    if (['QUEUED', 'RUNNING'].includes(accepted.status))
      void track(accepted.conversationId, accepted.requestId);
    void loadList();
  }
  return { conversationKey: accepted.conversationId };
}
async function cancel() {
  const id = selected.value?.conversationId;
  const requestId =
    activeMessage.value?.requestId ??
    (id ? pendingRequests.get(id)?.requestId : undefined);
  if (!id || !requestId || scope.value !== 'OWN') return;
  try {
    await cancelSceneRequest(requestId);
    pendingRequests.get(id)?.stop.abort();
    pendingRequests.delete(id);
    await refreshSelected(id);
  } catch {
    if (alive) error.value = '取消尚未确认，请刷新原对话查看。';
  }
}
function create() {
  selectionGeneration++;
  detail.value = undefined;
  selected.value = null;
  messageLoading.value = false;
  error.value = '';
  notice.value = '';
  businessRef.value = null;
  contextRecord.value = null;
}
async function chooseScene(key: string) {
  const run = ++contextGeneration;
  newSceneKey.value = key;
  contextSource.value = '';
  contextRecord.value = null;
  businessRef.value = null;
  contextInvalid.value = false;
  contextLoading.value = true;
  const scene = sceneOptions.value.find((item) => item.sceneKey === key);
  try {
    if (!scene?.canStartFromMonitor || scene.contextRequired === undefined)
      contextInvalid.value = true;
    else if (scene.contextRequired) {
      contextSource.value = scene.contextSourceKey ?? '';
      contextInvalid.value = !contextSource.value;
    }
  } catch {
    if (alive && run === contextGeneration) {
      contextInvalid.value = true;
      error.value =
        '无法确认该场景的业务记录来源，请从有权业务入口或试运行建立会话。';
    }
  } finally {
    if (alive && run === contextGeneration) contextLoading.value = false;
  }
}
watch(contextRecord, (record) => {
  businessRef.value = record?.businessRef ?? null;
});
async function loadScenes() {
  if (!can('ai:scene:invoke')) return;
  const session = access.accessToken;
  try {
    const result = await requestClient.get<SceneEntry[]>('/ai/scenes');
    if (alive && session === access.accessToken) sceneOptions.value = result;
  } catch {
    if (alive && session === access.accessToken)
      error.value = '可用场景读取失败，请刷新。';
  }
}
watch(
  () => access.accessToken,
  () => {
    identityVersion.value++;
    settingsOpen.value = false;
    scope.value = 'OWN';
    page.value = 1;
    search.value = '';
    error.value = '';
    notice.value = '';
    newSceneKey.value = '';
    contextSource.value = '';
    contextInvalid.value = false;
    contextLoading.value = false;
    listGeneration++;
    selectionGeneration++;
    contextGeneration++;
    rows.value = [];
    selected.value = null;
    detail.value = undefined;
    sceneOptions.value = [];
    businessRef.value = null;
    contextRecord.value = null;
    frozen.clear();
    for (const request of pendingRequests.values()) request.stop.abort();
    pendingRequests.clear();
    if (access.accessToken) {
      void loadList();
      void loadScenes();
    }
  },
);
watch(scope, () => {
  selectionGeneration++;
  detail.value = undefined;
  selected.value = null;
  rows.value = [];
  page.value = 1;
  for (const request of pendingRequests.values()) request.stop.abort();
  pendingRequests.clear();
  void loadList();
});
watch(
  () => route.query.settings,
  (value) => {
    if (value === 'keys') settingsOpen.value = true;
  },
);
onMounted(async () => {
  await loadList();
  await loadScenes();
  if (alive && typeof route.query.conversation === 'string')
    await selectConversation(route.query.conversation);
});
onBeforeUnmount(() => {
  alive = false;
  selectionGeneration++;
  listGeneration++;
  for (const request of pendingRequests.values()) request.stop.abort();
  pendingRequests.clear();
  frozen.clear();
});
</script>
<template>
  <div>
    <div class="conversation-toolbar">
      <label v-if="can('ai:request:audit')">
        范围
        <select v-model="scope" aria-label="会话范围">
          <option value="OWN">我的对话</option>
          <option value="AUDIT">审计查看</option>
        </select>
      </label>
      <p v-if="error" role="alert">
        {{ error }}
        <button type="button" @click="error = ''">关闭</button>
      </p>
      <p v-if="notice" role="status">
        {{ notice }}
        <button type="button" @click="notice = ''">关闭</button>
      </p>
    </div>
    <ConversationBoard
      :key="identityVersion"
      :conversations="rows.map(conversationItem)"
      :selected="selected ? conversationItem(selected) : null"
      :messages="(detail?.messages ?? []).map(conversationMessage)"
      :scenes="
        availableScenes.map((scene) => ({
          key: scene.sceneKey,
          label: scene.name,
        }))
      "
      :can-create="
        scope === 'OWN' && can('ai:scene:invoke') && availableScenes.length > 0
      "
      :can-reply="canReply"
      :can-settings="canSettings"
      :can-cancel="scope === 'OWN' && can('ai:scene:invoke')"
      :history-unavailable="detail?.conversation.history === 'LEGACY_NO_BODY'"
      :list-loading="listLoading"
      :message-loading="messageLoading"
      :working="working"
      :submit="submit"
      :send-disabled="
        !selected &&
        (contextLoading ||
          contextInvalid ||
          Boolean(contextSource && !contextRecord))
      "
      :requires-cost-confirmation="selected?.kind === 'TEST'"
      :readonly-reason="
        scope === 'AUDIT'
          ? '审计查看不能代替会话主人继续提问。'
          : '可从有权业务记录的摘要或场景试运行建立会话，再回到这里继续提问。'
      "
      @create="create"
      @select="selectConversation"
      @scene="chooseScene"
      @search="
        search = $event;
        page = 1;
        loadList();
      "
      @refresh="
        selected ? selectConversation(selected.conversationId) : loadList()
      "
      @cancel="cancel"
      @settings="settingsOpen = true"
    >
      <template #context="{ locked }">
        <p v-if="selected">
          沿用原会话的业务关联{{
            selected.sourceLabel ? `：${selected.sourceLabel}` : ''
          }}
        </p>
        <p v-if="!selected && contextLoading" role="status">
          正在读取业务记录来源…
        </p>
        <DatabaseRecordPicker
          v-if="!selected && contextSource"
          :key="contextSource"
          v-model="contextRecord"
          :source-key="contextSource"
          :readonly="locked"
          :label="`为「${sceneOptions.find((scene) => scene.sceneKey === newSceneKey)?.name || '当前场景'}」选择业务记录`"
        />
      </template>
      <template #details>
        <p>当前对话 {{ detail?.messages.length ?? 0 }} 条消息</p>
        <p v-if="activeMessage">当前请求 {{ activeMessage.requestId }}</p>
      </template>
    </ConversationBoard>
    <div class="conversation-paging">
      <button
        type="button"
        :disabled="page <= 1 || listLoading"
        @click="
          page--;
          loadList();
        "
      >
        上一页
      </button>
      <span>第 {{ page }} 页</span>
      <button
        type="button"
        :disabled="BigInt(page * 20) >= BigInt(total) || listLoading"
        @click="
          page++;
          loadList();
        "
      >
        下一页
      </button>
    </div>
    <el-drawer
      v-if="canSettings"
      v-model="settingsOpen"
      title="Key 与模型"
      size="min(760px, 96vw)"
      destroy-on-close
      :close-on-click-modal="false"
    >
      <SimpleSettingsPanel
        v-if="settingsOpen"
        @close="settingsOpen = false"
        @changed="loadScenes"
      />
    </el-drawer>
  </div>
</template>
<style scoped>
.conversation-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  padding: 12px 20px 0;
  font-size: 13px;
}

.conversation-toolbar label {
  display: flex;
  gap: 8px;
  align-items: center;
}

.conversation-toolbar select {
  padding: 6px;
  background: hsl(var(--background));
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
}

.conversation-paging {
  display: flex;
  gap: 20px;
  justify-content: center;
  padding: 12px;
  font-size: 13px;
}

button {
  color: hsl(var(--primary));
}

button:disabled {
  opacity: 0.5;
}
</style>
