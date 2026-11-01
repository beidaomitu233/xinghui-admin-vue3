<script setup lang="ts">
import { Page } from '@vben/common-ui';

import { ElButton, ElInput, ElTabPane, ElTabs } from 'element-plus';

defineProps<{
  busy?: boolean;
  canAddChannel: boolean;
  canAddModel: boolean;
  canReadModels: boolean;
  count: string;
  query: string;
  view: 'agent' | 'models' | 'suppliers';
}>();
const emit = defineEmits<{
  addChannel: [];
  addModel: [];
  search: [query: string];
  selectView: [view: 'agent' | 'models' | 'suppliers'];
}>();
const panes = [
  { value: 'models', label: '模型' },
  { value: 'suppliers', label: '供应商' },
  { value: 'agent', label: '中台设置' },
] as const;
</script>

<template>
  <Page
    auto-content-height
    header-class="flex-wrap gap-3"
    title="AI 配置"
    description="管理模型、供应商与中台助手"
  >
    <section class="model-hub" aria-label="AI 配置工作区">
      <div
        class="hub-workspace"
        :class="{ 'is-agent-settings': view === 'agent' }"
      >
        <aside class="hub-sidebar">
          <div class="hub-sidebar-heading">
            <ElTabs
              :model-value="view"
              aria-label="管理对象"
              @tab-change="
                emit('selectView', $event as 'agent' | 'models' | 'suppliers')
              "
            >
              <ElTabPane
                v-for="item in panes"
                :key="item.value"
                :name="item.value"
                :label="item.label"
                :disabled="busy || (item.value !== 'agent' && !canReadModels)"
              />
            </ElTabs>
            <span v-if="view !== 'agent'" class="hub-count">{{ count }}</span>
          </div>
          <ElInput
            v-if="view !== 'agent'"
            :model-value="query"
            :aria-label="view === 'models' ? '搜索模型' : '搜索供应商或渠道'"
            :placeholder="view === 'models' ? '搜索模型' : '搜索供应商或渠道'"
            clearable
            :disabled="busy"
            class="hub-search"
            @update:model-value="emit('search', $event)"
          />
          <ElButton
            v-if="
              view !== 'agent' &&
              (view === 'models' ? canAddModel : canAddChannel)
            "
            type="primary"
            :disabled="busy"
            @click="view === 'models' ? emit('addModel') : emit('addChannel')"
          >
            {{ view === 'models' ? '添加模型' : '添加渠道' }}
          </ElButton>
          <nav
            v-if="view !== 'agent'"
            class="hub-list"
            :aria-label="view === 'models' ? '业务模型' : '供应商渠道'"
          >
            <slot name="sidebar"></slot>
          </nav>
        </aside>
        <section
          class="hub-detail"
          :aria-label="
            view === 'agent'
              ? '中台设置'
              : view === 'models'
                ? '当前模型配置'
                : '当前供应商配置'
          "
        >
          <slot v-if="view === 'agent'" name="agent"></slot>
          <slot v-else></slot>
        </section>
      </div>
    </section>
  </Page>
</template>

<style scoped>
.model-hub {
  --hub-accent: hsl(var(--primary));

  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
  height: 100%;
  min-height: 0;
  color: hsl(var(--foreground));
}

:global(.dark .model-hub) {
  --hub-accent: color-mix(in srgb, hsl(var(--primary)) 55%, white);
}

.model-hub :deep(.el-button--primary.is-link) {
  color: var(--hub-accent);
}

.hub-sidebar-heading {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}

.hub-count,
.hub-sidebar-footer {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
}

.hub-workspace {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  background: hsl(var(--background));
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
}

.hub-workspace.is-agent-settings {
  flex-direction: column;
}

.is-agent-settings .hub-sidebar {
  flex: 0 0 auto;
  padding: 12px 24px 0;
  border-right: 0;
  border-bottom: 1px solid hsl(var(--border));
}

.hub-sidebar {
  display: flex;
  flex: 0 0 250px;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
  min-height: 0;
  padding: 24px 16px 0;
  border-right: 1px solid hsl(var(--border));
}

.hub-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.hub-sidebar-footer {
  padding: 16px 0;
  border-top: 1px solid hsl(var(--border));
}

.hub-detail {
  flex: 1;
  min-width: 0;
  min-height: 0;
  padding: 28px 30px;
  overflow: auto;
}

@media (max-width: 1000px) {
  .hub-sidebar {
    flex-basis: 205px;
  }

  .hub-detail {
    padding: 20px;
  }
}

@media (max-width: 700px) {
  .model-hub {
    height: auto;
    min-height: 0;
  }

  .hub-workspace {
    flex-direction: column;
  }

  .hub-sidebar {
    flex-basis: auto;
    max-height: 300px;
    border-right: 0;
    border-bottom: 1px solid hsl(var(--border));
  }

  .hub-sidebar-footer {
    padding: 12px 0;
  }
}
</style>
