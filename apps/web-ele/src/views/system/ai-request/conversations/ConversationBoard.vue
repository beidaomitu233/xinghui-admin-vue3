<script setup lang="ts">
import type {
  ConversationAcceptance,
  ConversationDraft,
  ConversationItem,
  ConversationMessage,
  ConversationScene,
} from './view-model';

import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';

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
      <header>
        <h1>对话记录</h1>
        <button v-if="canCreate" type="button" @click="emit('create')">
          新对话
        </button>
      </header>
      <form
        class="conversation-search"
        @submit.prevent="emit('search', search)"
      >
        <input
          v-model="search"
          aria-label="搜索对话"
          placeholder="搜索标题或内容"
        />
        <button type="submit">搜索</button>
      </form>
      <p v-if="listLoading" role="status">正在读取会话…</p>
      <p v-else-if="conversations.length === 0" class="muted">暂无对话记录</p>
      <nav aria-label="会话列表">
        <button
          v-for="item in conversations"
          :key="item.key"
          type="button"
          class="conversation-item"
          :aria-current="selected?.key === item.key ? 'page' : undefined"
          @click="emit('select', item.key)"
        >
          <strong>{{ item.title }}</strong>
          <span>
            {{ item.sceneLabel
            }}{{ item.sourceLabel ? ` · ${item.sourceLabel}` : '' }}
          </span>
          <p>{{ item.excerpt || '暂无消息摘要' }}</p>
          <small>
            {{ conversationTime(item.updatedAt) }} {{ labels[item.state] }}
          </small>
        </button>
      </nav>
    </aside>
    <main class="conversation-main">
      <header class="conversation-heading">
        <div>
          <h2>{{ selected?.title || '新对话' }}</h2>
          <p class="muted">
            {{ selected?.sceneLabel || '选择场景，开始第一轮问答'
            }}{{ selected?.sourceLabel ? ` · ${selected.sourceLabel}` : '' }}
          </p>
        </div>
        <div class="heading-actions">
          <button type="button" @click="emit('refresh')">刷新记录</button>
          <button v-if="canSettings" type="button" @click="emit('settings')">
            Key 与模型
          </button>
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
        <label v-if="!selected">
          对话场景
          <select
            v-model="newSceneKey"
            aria-label="对话场景"
            :disabled="sending.has(context) || unconfirmed.has(context)"
            @change="emit('scene', newSceneKey)"
          >
            <option value="" disabled>选择场景</option>
            <option v-for="scene in scenes" :key="scene.key" :value="scene.key">
              {{ scene.label }}
            </option>
          </select>
        </label>
        <slot
          v-if="!selected"
          name="context"
          :locked="sending.has(context) || unconfirmed.has(context)"
        ></slot>
        <label>
          {{ selected ? '继续提问' : '你的问题' }}
          <textarea
            v-model="text"
            aria-label="消息内容"
            :readonly="messageLoading"
            placeholder="输入问题或继续追问…"
            maxlength="2048"
            @keydown.ctrl.enter.prevent="send"
          ></textarea>
        </label>
        <label v-if="requiresCostConfirmation" class="trial-confirmation">
          <input v-model="confirmedCosts" type="checkbox" />
          我确认本轮试运行可能产生模型费用
        </label>
        <p v-if="errors.get(context)" class="composer-error" role="alert">
          {{ errors.get(context) }}
        </p>
        <p
          v-if="unconfirmed.has(context) && !sending.has(context)"
          class="muted"
        >
          重试使用原消息；此后编辑的内容仍保留在输入框中。
        </p>
        <div class="composer-actions">
          <span class="muted">Ctrl + Enter 发送</span>
          <button
            v-if="working && canCancel"
            type="button"
            @click="emit('cancel')"
          >
            取消生成
          </button>
          <button
            type="submit"
            :disabled="
              blocked ||
              (!unconfirmed.has(context) && (!text.trim() || !sceneKey))
            "
          >
            {{ sendLabel }}
          </button>
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
        <summary>调用详情与统计</summary>
        <slot v-if="detailsOpen" name="details"></slot>
      </details>
    </main>
  </div>
</template>
<style scoped>
.conversation-board {
  display: flex;
  min-height: calc(100vh - 150px);
  margin: 16px;
  background: hsl(var(--background));
  border: 1px solid hsl(var(--border));
  border-radius: 12px;
}

.conversation-sidebar {
  flex-shrink: 0;
  width: 290px;
  padding: 20px;
  border-right: 1px solid hsl(var(--border));
}

.conversation-sidebar header,
.conversation-heading,
.heading-actions,
.composer-actions {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
}

h1,
h2 {
  font-size: 18px;
  font-weight: 600;
}

button {
  color: hsl(var(--primary));
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.conversation-search {
  display: flex;
  gap: 12px;
  margin: 20px 0;
}

input,
select,
textarea {
  width: 100%;
  padding: 10px 12px;
  color: inherit;
  background: hsl(var(--background));
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

nav {
  display: grid;
  gap: 8px;
}

.conversation-item {
  display: grid;
  gap: 7px;
  padding: 14px;
  color: inherit;
  text-align: left;
  border: 1px solid transparent;
  border-radius: 9px;
}

.conversation-item[aria-current='page'] {
  background: hsl(var(--accent));
  border-color: hsl(var(--primary));
}

.conversation-item p {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversation-item span,
.conversation-item p,
.conversation-item small,
.muted {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.conversation-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.conversation-heading {
  padding: 22px 28px;
  border-bottom: 1px solid hsl(var(--border));
}

.conversation-heading p {
  margin-top: 8px;
}

.conversation-composer {
  display: grid;
  gap: 12px;
  padding: 20px 28px;
  border-top: 1px solid hsl(var(--border));
}

label {
  display: grid;
  gap: 8px;
  font-size: 13px;
}

textarea {
  min-height: 100px;
  resize: vertical;
}

.composer-error {
  font-size: 13px;
  color: hsl(var(--destructive));
}

.readonly-message,
.conversation-details {
  padding: 18px 28px;
  font-size: 13px;
  color: hsl(var(--muted-foreground));
  border-top: 1px solid hsl(var(--border));
}

summary {
  cursor: pointer;
}

@media (max-width: 1100px) {
  .conversation-sidebar {
    width: 235px;
    padding: 16px;
  }

  .conversation-heading {
    align-items: flex-start;
    padding: 18px;
  }

  .heading-actions {
    flex-wrap: wrap;
    justify-content: flex-end;
  }
}

@media (max-width: 760px) {
  .conversation-board {
    flex-direction: column;
  }

  .conversation-sidebar {
    width: 100%;
    border-right: 0;
    border-bottom: 1px solid hsl(var(--border));
  }

  nav {
    max-height: 240px;
    overflow: auto;
  }

  .conversation-heading,
  .conversation-composer {
    padding: 16px;
  }
}
</style>
