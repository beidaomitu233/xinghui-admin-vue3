<script setup lang="ts">
import type { SceneSummary } from '#/api/system/ai-scene';

import { ElButton, ElEmpty, ElInput, ElSkeleton, ElTag } from 'element-plus';

defineProps<{
  activeKey: null | string;
  canCreate: boolean;
  loading: boolean;
  page: number;
  scenes: SceneSummary[];
  search: string;
  total: string;
}>();
defineEmits<{
  create: [];
  page: [value: number];
  select: [key: string];
  'update:search': [value: string];
}>();
</script>
<template>
  <aside class="scene-sidebar">
    <div class="sidebar-heading">
      <h2>提示词场景</h2>
      <ElButton
        v-if="canCreate"
        type="primary"
        size="small"
        @click="$emit('create')"
      >
        新建场景
      </ElButton>
    </div>
    <ElInput
      aria-label="搜索场景"
      placeholder="搜索场景"
      clearable
      :model-value="search"
      @update:model-value="$emit('update:search', $event)"
    />
    <ElSkeleton v-if="loading" :rows="5" animated />
    <ElEmpty
      v-else-if="scenes.length === 0"
      description="暂无匹配场景"
      :image-size="48"
    />
    <nav v-else aria-label="场景列表" class="scene-list">
      <ElButton
        v-for="scene in scenes"
        :key="scene.sceneKey"
        text
        class="scene-item"
        :class="{ 'is-selected': activeKey === scene.sceneKey }"
        :aria-current="activeKey === scene.sceneKey ? 'page' : undefined"
        @click="$emit('select', scene.sceneKey)"
      >
        <strong>{{ scene.name }}</strong>
        <span>
          {{
            scene.purpose ||
            (scene.kind === 'RECORD_SUMMARY' ? '记录摘要' : '通用场景')
          }}
        </span>
        <ElTag
          size="small"
          effect="plain"
          :type="scene.enabled && scene.currentVersionId ? 'success' : 'info'"
        >
          {{
            !scene.enabled
              ? '已停用'
              : scene.currentVersionId
                ? '已配置'
                : '待配置'
          }}
        </ElTag>
      </ElButton>
    </nav>
    <div class="scene-pages">
      <ElButton
        text
        size="small"
        :disabled="loading || page <= 1"
        @click="$emit('page', page - 1)"
      >
        上一页
      </ElButton>
      <span>{{ page }}</span>
      <ElButton
        text
        size="small"
        :disabled="loading || BigInt(page * 100) >= BigInt(total)"
        @click="$emit('page', page + 1)"
      >
        下一页
      </ElButton>
    </div>
  </aside>
</template>
<style scoped>
.scene-sidebar {
  display: flex;
  flex-shrink: 0;
  flex-direction: column;
  gap: 18px;
  width: 230px;
  padding: 20px 14px;
  background: hsl(var(--muted) / 30%);
  border-right: 1px solid hsl(var(--border));
}

.sidebar-heading {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}

h2 {
  font-size: 15px;
  font-weight: 600;
}

.scene-list {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
  overflow: auto;
}

.scene-item {
  height: auto;
  padding: 14px 10px;
  margin: 0;
  text-align: left;
  white-space: normal;
}

.scene-item :deep(> span) {
  display: grid;
  gap: 8px;
  width: 100%;
}

.scene-item strong {
  font-size: 14px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.scene-item span {
  font-size: 12px;
  line-height: 1.6;
  color: hsl(var(--muted-foreground));
}

.scene-item :deep(.el-tag) {
  justify-self: start;
}

.scene-item.is-selected {
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 10%);
}

.scene-pages {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

@media (max-width: 900px) {
  .scene-sidebar {
    width: 100%;
    border-right: 0;
    border-bottom: 1px solid hsl(var(--border));
  }

  .scene-list {
    flex-direction: row;
    max-height: 130px;
  }

  .scene-item {
    flex-shrink: 0;
    width: 210px;
  }

  .scene-pages {
    justify-content: flex-end;
  }
}
</style>
