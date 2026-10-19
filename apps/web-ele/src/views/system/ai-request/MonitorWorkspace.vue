<script setup lang="ts">
import { ref } from 'vue';

import CallLogPanel from './CallLogPanel.vue';
import ConversationWorkspace from './conversations/ConversationWorkspace.vue';

defineProps<{ initialKeySettings?: boolean }>();
const tab = ref('conversations');
const logsVisited = ref(false);
</script>
<template>
  <section class="monitor-workspace">
    <nav class="monitor-tabs" aria-label="调用监控视图">
      <button
        :aria-pressed="tab === 'conversations'"
        @click="tab = 'conversations'"
      >
        我的对话
      </button>
      <button
        :aria-pressed="tab === 'logs'"
        @click="
          logsVisited = true;
          tab = 'logs';
        "
      >
        请求日志
      </button>
    </nav>
    <div
      v-show="tab === 'conversations'"
      class="monitor-pane monitor-conversations"
    >
      <ConversationWorkspace :initial-key-settings="initialKeySettings" />
    </div>
    <div v-if="logsVisited" v-show="tab === 'logs'" class="monitor-pane">
      <CallLogPanel :active="tab === 'logs'" />
    </div>
  </section>
</template>

<style scoped>
.monitor-workspace {
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: calc(100dvh - 144px);
  min-height: 0;
  overflow: hidden;
}

.monitor-pane {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.monitor-conversations :deep(.conversation-workspace) {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.monitor-conversations :deep(.conversation-board) {
  flex: 1;
  height: auto;
  min-height: 0;
}

.monitor-tabs {
  display: flex;
  flex: none;
  gap: 8px;
  padding: 12px 20px;
  border-bottom: 1px solid hsl(var(--border));
}

.monitor-tabs button {
  padding: 8px 16px;
  color: hsl(var(--muted-foreground));
  border-radius: 6px;
}

.monitor-tabs button[aria-pressed='true'] {
  color: hsl(var(--primary));
  background: hsl(var(--muted));
}
</style>
