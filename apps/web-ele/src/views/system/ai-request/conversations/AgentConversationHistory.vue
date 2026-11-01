<script setup lang="ts">
import type {
  ConversationDetail,
  ConversationSummary,
} from '#/api/system/ai-conversation';
import type { AgentSession } from '#/api/system/ai-workbench';

import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import { useAccessStore } from '@vben/stores';

import {
  ElAlert,
  ElButton,
  ElEmpty,
  ElInput,
  ElMenu,
  ElMenuItem,
  ElScrollbar,
  ElSkeleton,
  ElTag,
} from 'element-plus';

import {
  getConversation,
  listConversations,
} from '#/api/system/ai-conversation';
import { getAgentEvents, listAgentSessions } from '#/api/system/ai-workbench';
import AgentImagePreview from '#/views/ai/workbench/AgentImagePreview.vue';
import {
  applyEvents,
  emptyHistory,
  runLabels,
} from '#/views/ai/workbench/history';
import MarkdownMessage from '#/views/ai/workbench/MarkdownMessage.vue';

import { conversationMessage } from './adapter';
import ConversationTimeline from './ConversationTimeline.vue';

const props = defineProps<{ active: boolean }>();
const route = useRoute();
const access = useAccessStore();
const can = (code: string) =>
  Boolean(access.accessToken) && access.accessCodes.includes(code);
const scope = computed(() =>
  can('ai:request:list') && can('ai:request:audit') ? 'AUDIT' : 'OWN',
);
const agentAllowed = computed(() => can('ai:agent:invoke'));
const legacyAllowed = computed(
  () => can('ai:scene:invoke') || can('ai:request:list'),
);
const allowed = computed(() => agentAllowed.value || legacyAllowed.value);
const sessions = ref<AgentSession[]>([]);
const legacy = ref<ConversationSummary[]>([]);
const legacyDetail = ref<ConversationDetail>();
const page = ref(1);
const total = ref('0');
const selected = ref('');
const search = ref('');
const appliedSearch = ref('');
const history = reactive(emptyHistory());
const listLoading = ref(false);
const loading = ref(false);
const moreLoading = ref(false);
const error = ref('');
let generation = 0;
let selection = 0;
let alive = true;
const valid = (ticket: number) =>
  alive && ticket === generation && props.active && allowed.value;
const items = computed(() =>
  [
    ...sessions.value.map((item) => ({
      key: `agent:${item.id}`,
      title: item.title,
      updatedAt: item.updatedAt,
      source: '中台',
    })),
    ...legacy.value.map((item) => ({
      key: `legacy:${item.conversationId}`,
      title: item.title,
      updatedAt: item.updatedAt,
      source: item.sceneName,
    })),
  ]
    .filter((item) =>
      item.title
        .toLocaleLowerCase()
        .includes(appliedSearch.value.toLocaleLowerCase()),
    )
    .toSorted((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
);
const current = computed(() =>
  items.value.find((item) => item.key === selected.value),
);
const isLegacy = computed(() => selected.value.startsWith('legacy:'));
const agentSession = computed(() => selected.value.slice(6));
async function read(key: string) {
  const ticket = generation;
  const request = ++selection;
  selected.value = key;
  loading.value = true;
  legacyDetail.value = undefined;
  Object.assign(history, emptyHistory());
  try {
    if (key.startsWith('legacy:')) {
      const value = await getConversation(key.slice(7), scope.value);
      if (valid(ticket) && request === selection) legacyDetail.value = value;
    } else {
      for (;;) {
        const events = await getAgentEvents(key.slice(6), history.cursor);
        if (!valid(ticket) || request !== selection) return;
        applyEvents(history, events);
        if (events.length < 200) break;
      }
    }
  } catch {
    if (valid(ticket) && request === selection)
      error.value = '对话记录加载失败，请重试。';
  } finally {
    if (valid(ticket) && request === selection) loading.value = false;
  }
}
async function refresh() {
  const ticket = ++generation;
  selection++;
  listLoading.value = true;
  error.value = '';
  try {
    const [agents, conversations] = await Promise.allSettled([
      agentAllowed.value ? listAgentSessions() : Promise.resolve([]),
      legacyAllowed.value
        ? listConversations({
            scope: scope.value,
            search: appliedSearch.value,
            pageNum: 1,
            pageSize: 20,
          })
        : Promise.resolve({ records: [], total: '0' }),
    ]);
    if (!valid(ticket)) return;
    sessions.value = agents.status === 'fulfilled' ? agents.value : [];
    legacy.value =
      conversations.status === 'fulfilled' ? conversations.value.records : [];
    total.value =
      conversations.status === 'fulfilled' ? conversations.value.total : '0';
    page.value = 1;
    if (agents.status === 'rejected' || conversations.status === 'rejected')
      error.value = '部分对话列表读取失败，可重试。';
    const linked =
      typeof route.query.conversation === 'string' && legacyAllowed.value
        ? `legacy:${route.query.conversation}`
        : '';
    const key = items.value.some((item) => item.key === selected.value)
      ? selected.value
      : linked || items.value[0]?.key;
    if (key) await read(key);
    else {
      selected.value = '';
      legacyDetail.value = undefined;
      Object.assign(history, emptyHistory());
      loading.value = false;
    }
  } finally {
    if (valid(ticket)) listLoading.value = false;
  }
}
async function more() {
  if (moreLoading.value || listLoading.value) return;
  const ticket = generation;
  moreLoading.value = true;
  try {
    const value = await listConversations({
      scope: scope.value,
      search: appliedSearch.value,
      pageNum: page.value + 1,
      pageSize: 20,
    });
    if (!valid(ticket)) return;
    const known = new Set(legacy.value.map((item) => item.conversationId));
    legacy.value.push(
      ...value.records.filter((item) => !known.has(item.conversationId)),
    );
    page.value++;
    total.value = value.total;
  } catch {
    if (valid(ticket)) error.value = '更多对话读取失败，请重试。';
  } finally {
    if (valid(ticket)) moreLoading.value = false;
  }
}
function searchConversations() {
  appliedSearch.value = search.value.trim();
  void refresh();
}
watch(
  () => [props.active, access.accessToken, ...access.accessCodes],
  () => {
    generation++;
    selection++;
    sessions.value = [];
    legacy.value = [];
    legacyDetail.value = undefined;
    selected.value = '';
    error.value = '';
    loading.value = false;
    listLoading.value = false;
    moreLoading.value = false;
    Object.assign(history, emptyHistory());
    if (props.active && allowed.value) void refresh();
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  alive = false;
  generation++;
  selection++;
});
</script>
<template>
  <section class="agent-history" aria-label="对话记录">
    <ElAlert v-if="error" :title="error" type="error" :closable="false">
      <ElButton link @click="refresh">重试</ElButton>
    </ElAlert>
    <ElEmpty v-if="!allowed" description="暂无对话记录访问权限" />
    <div v-else class="history-layout">
      <div class="history-sessions flex min-h-0 flex-col">
        <form class="p-4" @submit.prevent="searchConversations">
          <ElInput
            v-model="search"
            aria-label="搜索对话记录"
            placeholder="搜索对话"
            clearable
            @clear="searchConversations"
          >
            <template #append>
              <ElButton native-type="submit">搜索</ElButton>
            </template>
          </ElInput>
        </form>
        <ElScrollbar class="min-h-0 flex-1">
          <ElSkeleton v-if="listLoading" :rows="4" animated class="p-4" />
          <ElMenu v-else :default-active="selected" @select="read">
            <ElMenuItem
              v-for="item in items"
              :key="item.key"
              :index="item.key"
              :title="item.title"
            >
              <span class="truncate">{{ item.title }}</span>
            </ElMenuItem>
          </ElMenu>
          <ElEmpty
            v-if="!listLoading && items.length === 0"
            :image-size="56"
            description="暂无会话"
          />
          <ElButton
            v-if="legacy.length < Number(total)"
            class="m-4"
            :loading="moreLoading"
            @click="more"
          >
            加载更多
          </ElButton>
        </ElScrollbar>
      </div>
      <div class="history-thread">
        <header
          class="flex items-center justify-between gap-3 border-b px-5 py-4"
        >
          <h2>{{ current?.title || '对话记录' }}</h2>
          <ElTag v-if="!isLegacy && history.status" size="small">
            {{ runLabels[history.status] }}
          </ElTag>
        </header>
        <ConversationTimeline
          v-if="isLegacy"
          :messages="(legacyDetail?.messages || []).map(conversationMessage)"
          :history-unavailable="
            legacyDetail?.conversation.history === 'LEGACY_NO_BODY'
          "
          :loading="loading"
        />
        <ElScrollbar v-else class="min-h-0 flex-1">
          <div class="history-messages">
            <ElSkeleton v-if="loading" :rows="4" animated />
            <ElEmpty
              v-else-if="history.messages.length === 0"
              description="暂无对话内容"
              :image-size="80"
            />
            <template v-for="message in history.messages" :key="message.id">
              <article
                v-if="
                  message.role !== 'TOOL' &&
                  (message.text.trim() || message.images?.length)
                "
                class="history-message"
                :class="{ 'user-message': message.role === 'USER' }"
              >
                <h3>{{ message.role === 'USER' ? '用户' : 'AI' }}</h3>
                <MarkdownMessage
                  v-if="message.role === 'ASSISTANT'"
                  :text="message.text"
                />
                <p v-else class="whitespace-pre-wrap">{{ message.text }}</p>
                <div
                  v-if="message.images?.length"
                  class="mt-3 flex flex-wrap gap-2"
                >
                  <AgentImagePreview
                    v-for="image in message.images"
                    :key="image.id"
                    :image="image"
                    :session-id="agentSession"
                  />
                </div>
              </article>
            </template>
          </div>
        </ElScrollbar>
      </div>
    </div>
  </section>
</template>
<style scoped>
.agent-history {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  min-height: 0;
}
.history-layout {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  gap: 16px;
  flex: 1;
  min-height: 0;
}
.history-sessions {
  background: hsl(var(--card));
  border-radius: 6px;
}
.history-thread {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  background: hsl(var(--card));
  border-radius: 6px;
}
.history-messages {
  max-width: 900px;
  margin: auto;
  padding: 24px;
}
.history-message {
  margin-bottom: 24px;
}
.history-message h3 {
  font-size: 12px;
  margin-bottom: 8px;
  color: hsl(var(--muted-foreground));
}
.user-message {
  padding: 16px;
  background: hsl(var(--muted) / 40%);
  border-radius: 6px;
}
.tool-record {
  margin: 8px 0;
  font-size: 12px;
}
@media (max-width: 767px) {
  .history-layout {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: 140px minmax(300px, 1fr);
  }
}
</style>
