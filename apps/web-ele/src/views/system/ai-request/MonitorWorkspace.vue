<script setup lang="ts">
import { ref } from 'vue';

import { ElTabPane, ElTabs } from 'element-plus';

import CallLogPanel from './CallLogPanel.vue';
import ConversationWorkspace from './conversations/ConversationWorkspace.vue';

defineProps<{ initialKeySettings?: boolean }>();
const tab = ref('conversations');
const logsVisited = ref(false);
</script>
<template>
  <section class="monitor-workspace">
    <ElTabs
      v-model="tab"
      class="monitor-tabs"
      @tab-change="
        (value) => {
          if (value === 'logs') logsVisited = true;
        }
      "
    >
      <ElTabPane label="我的对话" name="conversations" />
      <ElTabPane label="请求日志" name="logs" />
    </ElTabs>
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
  height: 100%;
  min-height: 0;
}

.monitor-pane {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: auto;
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
  flex: none;
}

@media (max-width: 767px) {
  .monitor-workspace {
    height: auto;
    min-height: 0;
  }
}
</style>
