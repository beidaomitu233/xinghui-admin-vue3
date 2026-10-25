<script setup lang="ts">
import type { AgentSession } from '#/api/system/ai-workbench';

import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';

import { useAccessStore } from '@vben/stores';

import {
  ElAlert,
  ElButton,
  ElEmpty,
  ElMenu,
  ElMenuItem,
  ElScrollbar,
  ElSkeleton,
  ElTag,
} from 'element-plus';

import { getAgentEvents, listAgentSessions } from '#/api/system/ai-workbench';
import AgentImagePreview from '#/views/ai/workbench/AgentImagePreview.vue';
import {
  applyEvents,
  emptyHistory,
  runLabels,
} from '#/views/ai/workbench/history';
import MarkdownMessage from '#/views/ai/workbench/MarkdownMessage.vue';

const props = defineProps<{ active: boolean }>();
const access = useAccessStore();
const allowed = computed(
  () =>
    Boolean(access.accessToken) &&
    access.accessCodes.includes('ai:agent:invoke'),
);
const sessions = ref<AgentSession[]>([]);
const selected = ref('');
const history = reactive(emptyHistory());
const loading = ref(false);
const error = ref('');
let generation = 0;
let alive = true;
const valid = (ticket: number) =>
  alive && ticket === generation && props.active && allowed.value;
async function read(id: string) {
  const ticket = ++generation;
  selected.value = id;
  loading.value = true;
  error.value = '';
  Object.assign(history, emptyHistory());
  try {
    for (;;) {
      const events = await getAgentEvents(id, history.cursor);
      if (!valid(ticket)) return;
      applyEvents(history, events);
      if (events.length < 200) break;
    }
  } catch {
    if (valid(ticket)) error.value = '对话记录加载失败，请重试。';
  } finally {
    if (valid(ticket)) loading.value = false;
  }
}
async function refresh() {
  const ticket = ++generation;
  loading.value = true;
  error.value = '';
  try {
    const result = await listAgentSessions();
    if (!valid(ticket)) return;
    sessions.value = result;
    const id = result.some((item) => item.id === selected.value)
      ? selected.value
      : result[0]?.id;
    if (id) await read(id);
    else Object.assign(history, emptyHistory());
  } catch {
    if (valid(ticket)) error.value = '会话列表加载失败，请重试。';
  } finally {
    if (valid(ticket)) loading.value = false;
  }
}
watch(
  () => [props.active, access.accessToken, allowed.value],
  () => {
    generation++;
    sessions.value = [];
    selected.value = '';
    loading.value = false;
    error.value = '';
    Object.assign(history, emptyHistory());
    if (props.active && allowed.value) void refresh();
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  alive = false;
  generation++;
});
</script>

<template>
  <section class="agent-history" aria-label="工作台对话记录">
    <div class="flex shrink-0 items-center justify-between gap-3">
      <span class="text-muted-foreground">工作台会话</span>
      <ElButton :loading="loading" :disabled="!allowed" @click="refresh">
        刷新
      </ElButton>
    </div>
    <ElAlert v-if="error" :title="error" type="error" :closable="false" />
    <ElEmpty v-if="!allowed" description="暂无工作台会话访问权限" />
    <div v-else class="history-layout">
      <ElScrollbar class="history-sessions">
        <ElMenu :default-active="selected" @select="read">
          <ElMenuItem
            v-for="item in sessions"
            :key="item.id"
            :index="item.id"
            :title="item.title"
          >
            <span class="truncate">{{ item.title }}</span>
          </ElMenuItem>
        </ElMenu>
        <ElEmpty
          v-if="!loading && sessions.length === 0"
          :image-size="56"
          description="暂无会话"
        />
      </ElScrollbar>
      <div class="history-thread">
        <header
          class="flex items-center justify-between gap-3 border-b px-5 py-4"
        >
          <h2>
            {{
              sessions.find((item) => item.id === selected)?.title ?? '对话记录'
            }}
          </h2>
          <ElTag v-if="history.status" size="small">
            {{ runLabels[history.status] }}
          </ElTag>
        </header>
        <ElScrollbar class="min-h-0 flex-1">
          <div class="history-messages">
            <ElSkeleton v-if="loading" :rows="4" animated />
            <ElEmpty
              v-else-if="history.messages.length === 0"
              description="暂无对话内容"
              :image-size="80"
            />
            <template v-for="message in history.messages" :key="message.id">
              <article
                v-if="message.role !== 'TOOL' && message.text.trim()"
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
                    :session-id="selected"
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
