<script setup lang="ts">
import type {
  ConversationAcceptance,
  ConversationDraft,
  ConversationItem,
  ConversationMessage,
  ConversationScene,
} from './view-model';

import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';

import {
  ElAlert,
  ElButton,
  ElCheckbox,
  ElEmpty,
  ElInput,
  ElOption,
  ElSelect,
  ElSkeleton,
  ElTag,
} from 'element-plus';

import ConversationTimeline from './ConversationTimeline.vue';
import { ConversationSendFailure, conversationTime } from './view-model';

const props = defineProps<{
  canCancel: boolean;
  canCreate: boolean;
  canReply: boolean;
  canSettings: boolean;
  conversations: ConversationItem[];
  historyUnavailable: boolean;
  listLoading: boolean;
  messageLoading: boolean;
  messages: ConversationMessage[];
  readonlyReason: string;
  requiresCostConfirmation?: boolean;
  scenes: ConversationScene[];
  scope?: 'AUDIT' | 'OWN';
  selected: ConversationItem | null;
  sendDisabled?: boolean;
  submit: (draft: ConversationDraft) => Promise<ConversationAcceptance>;
  working: boolean;
}>();
const emit = defineEmits<{
  cancel: [];
  create: [];
  refresh: [];
  scene: [key: string];
  search: [value: string];
  select: [key: string];
  settings: [];
}>();
const search = ref('');
const newSceneKey = ref('');
const confirmedCosts = ref(false);
const detailsOpen = ref(false);
const drafts = reactive(new Map<string, string>());
const errors = reactive(new Map<string, string>());
const sending = reactive(new Set<string>());
const unconfirmed = reactive(
  new Map<string, { command: ConversationDraft; raw: string }>(),
);
const context = computed(() => props.selected?.key ?? '__new_conversation__');
const text = computed({
  get: () => drafts.get(context.value) ?? '',
  set: (value) => drafts.set(context.value, value),
});
const writable = computed(() =>
  props.selected ? props.canReply : props.canCreate,
);
const sceneKey = computed(() => props.selected?.sceneKey ?? newSceneKey.value);
const blocked = computed(
  () =>
    !writable.value ||
    props.messageLoading ||
    props.working ||
    props.sendDisabled ||
    sending.has(context.value) ||
    (props.requiresCostConfirmation && !confirmedCosts.value),
);
watch(
  () => props.selected?.key,
  () => {
    confirmedCosts.value = false;
  },
);
const sendLabel = computed(() => {
  if (sending.has(context.value)) return '正在发送…';
  return unconfirmed.has(context.value) ? '重试原消息' : '发送';
});
let alive = true;
async function send() {
  const key = context.value;
  if (
    blocked.value ||
    (!unconfirmed.has(key) && (!text.value.trim() || !sceneKey.value))
  )
    return;
  let original = unconfirmed.get(key);
  if (!original) {
    original = {
      raw: text.value,
      command: {
        conversationKey: props.selected?.key ?? null,
        sceneKey: sceneKey.value,
        text: text.value.trim(),
        token: crypto.randomUUID(),
      },
    };
    unconfirmed.set(key, original);
  }
  sending.add(key);
  errors.delete(key);
  try {
    const accepted = await props.submit({ ...original.command });
    if (!alive) return;
    if (drafts.get(key) === original.raw) drafts.delete(key);
    else if (
      original.command.conversationKey === null &&
      !drafts.get(accepted.conversationKey)
    ) {
      drafts.set(accepted.conversationKey, drafts.get(key) ?? '');
      drafts.delete(key);
    }
    unconfirmed.delete(key);
  } catch (error) {
    if (!alive) return;
    if (error instanceof ConversationSendFailure) {
      errors.set(key, error.message);
      if (error.outcome === 'rejected') unconfirmed.delete(key);
    } else errors.set(key, '消息受理尚未确认，请重试原消息。');
  } finally {
    if (alive) sending.delete(key);
  }
}
onBeforeUnmount(() => {
  alive = false;
});
const labels: Record<ConversationItem['state'], string> = {
  cancelled: '已取消',
  failed: '有失败消息',
  idle: '',
  replying: '正在回答',
};
</script>
<template>
  <div class="conversation-board">
    <aside class="conversation-sidebar">
      <header class="sidebar-heading">
        <h2>{{ scope === 'AUDIT' ? '审计对话' : '我的对话' }}</h2>
        <ElButton v-if="canCreate" type="primary" @click="emit('create')">
          新对话
        </ElButton>
      </header>
      <form
        class="conversation-search"
        @submit.prevent="emit('search', search)"
      >
        <ElInput
          v-model="search"
          aria-label="搜索对话"
          placeholder="搜索对话标题"
          clearable
          @clear="emit('search', '')"
        />
        <ElButton native-type="submit">搜索</ElButton>
      </form>
      <ElSkeleton
        v-if="listLoading"
        :rows="4"
        animated
        aria-label="正在读取会话"
      />
      <ElEmpty
        v-else-if="conversations.length === 0"
        description="暂无对话记录"
        :image-size="52"
      />
      <nav v-else aria-label="会话列表" class="conversation-list">
        <ElButton
          v-for="item in conversations"
          :key="item.key"
          text
          class="conversation-item"
          :class="{ 'is-selected': selected?.key === item.key }"
          :aria-current="selected?.key === item.key ? 'page' : undefined"
          @click="emit('select', item.key)"
        >
          <strong>{{ item.title }}</strong>
          <span class="conversation-source">
            {{ item.sceneLabel
            }}{{ item.sourceLabel ? ` · ${item.sourceLabel}` : '' }}
          </span>
          <p>{{ item.excerpt || '暂无消息摘要' }}</p>
          <span class="conversation-meta">
            <time>{{ conversationTime(item.updatedAt) }}</time>
            <ElTag
              v-if="labels[item.state]"
              :type="item.state === 'failed' ? 'danger' : 'info'"
              size="small"
              effect="plain"
            >
              {{ labels[item.state] }}
            </ElTag>
          </span>
        </ElButton>
      </nav>
    </aside>
    <main class="conversation-main">
      <header class="conversation-heading">
        <div>
          <h2>
            {{
              selected?.title ||
              (scope === 'AUDIT' ? '请选择会话' : '开始新对话')
            }}
          </h2>
          <p>
            {{
              selected?.sceneLabel ||
              (scope === 'AUDIT'
                ? '选择会话查看历史消息'
                : '选择场景，发送第一条消息')
            }}{{ selected?.sourceLabel ? ` · ${selected.sourceLabel}` : '' }}
          </p>
        </div>
        <div class="heading-actions">
          <ElButton @click="emit('refresh')">刷新</ElButton>
          <ElButton v-if="canSettings" @click="emit('settings')">
            AI 配置
          </ElButton>
        </div>
      </header>
      <ConversationTimeline
        :messages="messages"
        :history-unavailable="historyUnavailable"
        :loading="messageLoading"
      />
      <form
        v-if="writable"
        class="conversation-composer"
        @submit.prevent="send"
      >
        <div v-if="!selected" class="conversation-context">
          <ElSelect
            v-model="newSceneKey"
            aria-label="对话场景"
            placeholder="选择对话场景"
            filterable
            :disabled="sending.has(context) || unconfirmed.has(context)"
            @change="emit('scene', newSceneKey)"
          >
            <ElOption
              v-for="scene in scenes"
              :key="scene.key"
              :value="scene.key"
              :label="scene.label"
            />
          </ElSelect>
          <slot
            name="context"
            :locked="sending.has(context) || unconfirmed.has(context)"
          ></slot>
        </div>
        <ElInput
          v-model="text"
          type="textarea"
          :autosize="{ minRows: 3, maxRows: 8 }"
          aria-label="消息内容"
          :readonly="messageLoading"
          :placeholder="selected ? '继续提问…' : '输入你的问题…'"
          maxlength="2048"
          resize="none"
          @keydown.ctrl.enter.prevent="send"
        />
        <ElCheckbox
          v-if="requiresCostConfirmation"
          v-model="confirmedCosts"
          class="trial-confirmation"
        >
          我确认本轮试运行可能产生模型费用
        </ElCheckbox>
        <ElAlert
          v-if="errors.get(context)"
          :title="errors.get(context)"
          type="error"
          show-icon
          closable
          @close="errors.delete(context)"
        />
        <p
          v-if="unconfirmed.has(context) && !sending.has(context)"
          class="composer-hint"
        >
          重试使用原消息；此后编辑的内容仍保留在输入框中。
        </p>
        <div class="composer-actions">
          <span class="composer-hint">Ctrl + Enter 发送</span>
          <div>
            <ElButton v-if="working && canCancel" @click="emit('cancel')">
              取消生成
            </ElButton>
            <ElButton
              native-type="submit"
              type="primary"
              :loading="sending.has(context)"
              :disabled="
                blocked ||
                (!unconfirmed.has(context) && (!text.trim() || !sceneKey))
              "
            >
              {{ sendLabel }}
            </ElButton>
          </div>
        </div>
      </form>
      <p v-else class="readonly-message">
        {{ readonlyReason || '当前会话仅供查看，不能代替会话主人继续提问。' }}
      </p>
      <details
        v-if="$slots.details"
        class="conversation-details"
        @toggle.self="detailsOpen = ($event.target as HTMLDetailsElement).open"
      >
        <summary>对话信息</summary>
        <slot v-if="detailsOpen" name="details"></slot>
      </details>
    </main>
  </div>
</template>
<style scoped>
.conversation-board {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  height: min(80vh, 1000px);
  min-height: 600px;
  overflow: auto;
  color: hsl(var(--foreground));
  background: hsl(var(--background));
  border-radius: 10px;
}

.conversation-sidebar {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;
  padding: 20px 12px;
  background: hsl(var(--muted) / 35%);
  border-right: 1px solid hsl(var(--border));
}

.sidebar-heading,
.conversation-heading,
.composer-actions,
.conversation-meta {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}

.sidebar-heading,
.conversation-search {
  padding: 0 8px;
}

h2 {
  font-size: 16px;
  font-weight: 600;
  line-height: 24px;
}

.conversation-search {
  display: flex;
  gap: 8px;
}

.conversation-list {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
  overflow: auto;
}

.conversation-item {
  height: auto;
  padding: 14px 12px;
  margin: 0;
  text-align: left;
  white-space: normal;
}

.conversation-item :deep(> span) {
  display: grid;
  gap: 7px;
  width: 100%;
}

.conversation-item strong {
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 600;
  white-space: nowrap;
}

.conversation-item.is-selected {
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 10%);
}

.conversation-source,
.conversation-item p,
.conversation-meta {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  line-height: 1.5;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}

.conversation-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.conversation-heading {
  flex-shrink: 0;
  padding: 20px 24px;
  border-bottom: 1px solid hsl(var(--border));
}

.conversation-heading p {
  margin-top: 6px;
  font-size: 13px;
  color: hsl(var(--muted-foreground));
}

.heading-actions {
  display: flex;
  flex-shrink: 0;
  gap: 8px;
}

.conversation-composer {
  display: grid;
  flex-shrink: 0;
  gap: 12px;
  padding: 16px 24px 20px;
}

.conversation-context {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.conversation-context > :deep(.el-select) {
  max-width: 260px;
}

.composer-hint {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.readonly-message {
  flex-shrink: 0;
  width: auto;
  margin: 12px 24px 20px;
}

.conversation-details {
  flex-shrink: 0;
  padding: 0 24px 16px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.conversation-details summary {
  cursor: pointer;
}

@media (max-width: 850px) {
  .conversation-board {
    grid-template-columns: minmax(0, 1fr);
    height: auto;
    min-height: 75vh;
  }

  .conversation-sidebar {
    gap: 12px;
    padding: 14px 12px;
    border-right: 0;
    border-bottom: 1px solid hsl(var(--border));
  }

  .conversation-list {
    flex-direction: row;
    max-height: 112px;
  }

  .conversation-item {
    flex-shrink: 0;
    width: 220px;
  }

  .conversation-main {
    min-height: 560px;
  }

  .conversation-heading {
    flex-wrap: wrap;
    padding: 16px;
  }

  .conversation-composer {
    padding: 16px;
  }

  .composer-hint {
    max-width: 55%;
  }
}
</style>
