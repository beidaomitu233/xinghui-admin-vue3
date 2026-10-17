<script setup lang="ts">
import type { ConversationMessage } from './view-model';

import { nextTick, ref, watch } from 'vue';

import { ElEmpty, ElSkeleton, ElTag } from 'element-plus';

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
    <ElSkeleton v-if="loading" :rows="6" animated aria-label="正在读取对话" />
    <ElEmpty
      v-else-if="historyUnavailable"
      description="旧记录未保留对话"
      :image-size="80"
    />
    <ElEmpty
      v-else-if="messages.length === 0"
      description="发送问题，开始第一轮对话"
      :image-size="90"
    >
      <p class="empty-hint">回答会保存到当前会话，稍后可以继续追问。</p>
    </ElEmpty>
    <div v-else class="message-list">
      <article
        v-for="message in messages"
        :key="message.key"
        class="message"
        :class="[`message-${message.role}`, `message-${message.state}`]"
        :aria-label="message.role === 'user' ? '用户消息' : '助手消息'"
      >
        <header>
          <strong>{{ message.role === 'user' ? '你' : 'AI 助手' }}</strong>
          <time :datetime="message.createdAt">
            {{ conversationTime(message.createdAt) }}
          </time>
        </header>
        <div class="message-bubble">
          <div v-if="message.body" class="message-body">{{ message.body }}</div>
          <span
            v-else-if="message.state === 'pending'"
            class="typing-indicator"
            aria-label="正在生成"
          >
            ● ● ●
          </span>
          <p
            v-else-if="['failed', 'cancelled'].includes(message.state)"
            class="message-empty"
          >
            本轮未获得完整回答
          </p>
          <p
            v-if="message.state !== 'complete'"
            class="message-state"
            role="status"
          >
            <ElTag
              :type="message.state === 'failed' ? 'danger' : 'info'"
              size="small"
              effect="plain"
            >
              {{ states[message.state] }}
            </ElTag>
            <span v-if="message.state === 'partial'">不会作为完整回答使用</span>
          </p>
          <p v-if="message.failure" class="message-failure">
            {{ message.failure }}
          </p>
        </div>
      </article>
    </div>
  </section>
</template>
<style scoped>
.conversation-timeline {
  flex: 1;
  min-width: 0;
  min-height: 160px;
  padding: 24px 28px;
  overflow: auto;
  overscroll-behavior: contain;
}

.message-list {
  display: grid;
  gap: 26px;
  max-width: 1040px;
  margin: 0 auto;
}

.message {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 0;
}

.message-user {
  align-items: flex-end;
}

.message header {
  display: flex;
  gap: 10px;
  align-items: center;
  margin: 0 4px 8px;
  font-size: 12px;
}

.message-user header {
  flex-direction: row-reverse;
}

.message strong {
  font-weight: 600;
}

time,
.empty-hint {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.message-bubble {
  max-width: 90%;
  padding: 16px 20px;
  background: hsl(var(--muted) / 55%);
  border-radius: 4px 16px 16px;
}

.message-user .message-bubble {
  background: hsl(var(--primary) / 12%);
  border-radius: 16px 4px 16px 16px;
}

.message-body {
  font-size: 14px;
  line-height: 1.9;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.message-state {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-top: 12px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.message-empty {
  font-size: 13px;
  color: hsl(var(--muted-foreground));
}

.message-failure {
  margin-top: 10px;
  font-size: 12px;
  color: hsl(var(--destructive));
}

.typing-indicator {
  font-size: 12px;
  color: hsl(var(--primary));
  letter-spacing: 5px;
}

@media (max-width: 700px) {
  .conversation-timeline {
    padding: 20px 16px;
  }

  .message-bubble {
    max-width: 96%;
    padding: 14px 16px;
  }
}
</style>
