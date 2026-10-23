<script setup lang="ts">
import { Page } from '@vben/common-ui';

import { ElButton, ElInput, ElTabPane, ElTabs } from 'element-plus';

defineProps<{
  busy?: boolean;
  canAddChannel: boolean;
  canAddModel: boolean;
  count: string;
  query: string;
  view: 'models' | 'suppliers';
}>();
const emit = defineEmits<{
  addChannel: [];
  addModel: [];
  search: [query: string];
  selectView: [view: 'models' | 'suppliers'];
}>();
const panes = [
  { value: 'models', label: '模型' },
  { value: 'suppliers', label: '供应商' },
] as const;
</script>

<template>
  <Page
    auto-content-height
    header-class="flex-wrap gap-3"
    title="AI 配置"
    description="管理业务模型、供应商与接入渠道"
  >
    <template #extra>
      <div class="flex flex-wrap gap-2">
        <slot name="header-actions"></slot>
        <ElButton
          v-if="canAddChannel"
          :disabled="busy"
          @click="emit('addChannel')"
        >
          添加渠道
        </ElButton>
        <ElButton
          v-if="canAddModel"
          type="primary"
          :disabled="busy"
          @click="emit('addModel')"
        >
          添加模型
        </ElButton>
      </div>
    </template>
    <section class="model-hub" aria-label="AI 配置工作区">
      <div class="hub-workspace">
        <aside class="hub-sidebar">
          <div class="hub-sidebar-heading">
            <ElTabs
              :model-value="view"
              aria-label="管理对象"
              @tab-change="emit('selectView', $event as 'models' | 'suppliers')"
            >
              <ElTabPane
                v-for="item in panes"
                :key="item.value"
                :name="item.value"
                :label="item.label"
                :disabled="busy"
              />
            </ElTabs>
            <span class="hub-count">{{ count }}</span>
          </div>
          <ElInput
            :model-value="query"
            :aria-label="view === 'models' ? '搜索模型' : '搜索供应商或渠道'"
            :placeholder="view === 'models' ? '搜索模型' : '搜索供应商或渠道'"
            clearable
            :disabled="busy"
            class="hub-search"
            @update:model-value="emit('search', $event)"
          />
          <nav
            class="hub-list"
            :aria-label="view === 'models' ? '业务模型' : '供应商渠道'"
          >
            <slot name="sidebar"></slot>
          </nav>
          <footer class="hub-sidebar-footer">
            <slot name="sidebar-footer"></slot>
          </footer>
        </aside>
        <section
          class="hub-detail"
          :aria-label="view === 'models' ? '当前模型配置' : '当前供应商配置'"
        >
          <slot></slot>
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

.hub-sidebar {
  display: flex;
  flex: 0 0 240px;
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
