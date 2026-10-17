<script setup lang="ts">
import type { ConversationMessage } from './view-model';

import { nextTick, ref, watch } from 'vue';

import { conversationTime } from './view-model';

const props = defineProps<{
  historyUnavailable: boolean;
  loading: boolean;
  messages: ConversationMessage[];
}>();
const timeline = ref<HTMLElement>();
const nearBottom = ref(true);
function trackScroll() {
  const node = timeline.value;
  if (node)
    nearBottom.value =
      node.scrollHeight - node.scrollTop - node.clientHeight < 80;
}
watch(
  () =>
    props.messages
      .map(
        (message) => `${message.key}:${message.body.length}:${message.state}`,
      )
      .join('|'),
  async () => {
    if (!nearBottom.value) return;
    await nextTick();
    if (timeline.value) timeline.value.scrollTop = timeline.value.scrollHeight;
  },
);
const states: Record<ConversationMessage['state'], string> = {
  cancelled: '已取消',
  complete: '',
  failed: '生成失败',
  partial: '未完成的回答',
  pending: '正在生成…',
};
</script>
<template>
  <section
    ref="timeline"
    class="conversation-timeline"
    aria-label="连续对话"
    aria-live="polite"
    @scroll="trackScroll"
  >
    <p v-if="loading" class="timeline-empty" role="status">正在读取对话…</p>
    <p v-else-if="historyUnavailable" class="timeline-empty">
      旧记录未保留对话
    </p>
    <p v-else-if="messages.length === 0" class="timeline-empty">
      发送问题开始对话。回答会按轮次显示在这里。
    </p>
    <article
      v-for="message in messages"
      v-else
      :key="message.key"
      class="message"
      :class="[`message-${message.role}`, `message-${message.state}`]"
      :aria-label="message.role === 'user' ? '用户消息' : '助手消息'"
    >
      <header>
        <strong>{{ message.role === 'user' ? '你' : '助手' }}</strong>
        <time :datetime="message.createdAt">
          {{ conversationTime(message.createdAt) }}
        </time>
      </header>
      <div v-if="message.body" class="message-body">{{ message.body }}</div>
      <p
        v-if="message.state !== 'complete'"
        class="message-state"
        role="status"
      >
        {{ states[message.state]
        }}{{ message.state === 'partial' ? '，不会作为完整回答使用' : '' }}
      </p>
      <p v-if="message.failure" class="message-failure">
        {{ message.failure }}
      </p>
      <p
        v-if="
          message.role === 'assistant' &&
          !message.body &&
          ['failed', 'cancelled'].includes(message.state)
        "
        class="message-state"
      >
        本轮未获得完整回答
      </p>
    </article>
  </section>
</template>
<style scoped>
.conversation-timeline {
  flex: 1;
  min-height: 280px;
  padding: 28px;
  overflow: auto;
}

.timeline-empty {
  margin: 80px auto;
  color: hsl(var(--muted-foreground));
  text-align: center;
}

.message {
  max-width: 850px;
  padding: 18px 20px;
  margin-bottom: 20px;
  border: 1px solid hsl(var(--border));
  border-radius: 12px;
}

.message-user {
  margin-left: auto;
  background: hsl(var(--accent));
}

.message-assistant {
  margin-right: auto;
  background: hsl(var(--background));
}

.message header {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin-bottom: 10px;
}

time {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.message-body {
  line-height: 1.8;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.message-state,
.message-failure {
  margin-top: 10px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.message-partial,
.message-failed {
  border-style: dashed;
}

@media (max-width: 760px) {
  .conversation-timeline {
    padding: 16px;
  }

  .message {
    padding: 14px;
  }
}
</style>
