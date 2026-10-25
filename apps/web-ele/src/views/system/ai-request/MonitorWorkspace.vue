<script setup lang="ts">
import { ref } from 'vue';

import { ElCard, ElTabPane, ElTabs } from 'element-plus';

import CallLogPanel from './CallLogPanel.vue';
import AgentConversationHistory from './conversations/AgentConversationHistory.vue';
import ConversationWorkspace from './conversations/ConversationWorkspace.vue';

defineProps<{ initialKeySettings?: boolean }>();
const tab = ref('conversations');
const logsVisited = ref(false);
const agentVisited = ref(false);
</script>
<template>
  <section class="monitor-workspace">
    <ElCard class="monitor-navigation" shadow="never">
      <ElTabs
        v-model="tab"
        class="monitor-tabs"
        @tab-change="
          (value) => {
            if (value === 'logs') logsVisited = true;
            if (value === 'agent') agentVisited = true;
          }
        "
      >
        <ElTabPane label="对话记录" name="conversations" />
        <ElTabPane label="工作台对话" name="agent" />
        <ElTabPane label="请求日志" name="logs" />
      </ElTabs>
    </ElCard>
    <div
      v-show="tab === 'conversations'"
      class="monitor-pane monitor-conversations"
    >
      <ConversationWorkspace :initial-key-settings="initialKeySettings" />
    </div>
    <div v-if="logsVisited" v-show="tab === 'logs'" class="monitor-pane">
      <CallLogPanel :active="tab === 'logs'" />
    </div>
    <div v-if="agentVisited" v-show="tab === 'agent'" class="monitor-pane">
      <AgentConversationHistory :active="tab === 'agent'" />
    </div>
  </section>
</template>

<style scoped>
.monitor-workspace {
  display: flex;
  flex-direction: column;
  gap: 16px;
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

.monitor-navigation {
  flex: none;
}

.monitor-navigation :deep(.el-card__body) {
  padding: 0 16px;
}

.monitor-navigation :deep(.el-tabs__header) {
  margin-bottom: 0;
}

@media (max-width: 767px) {
  .monitor-workspace {
    height: auto;
    min-height: 0;
  }
}
</style>
