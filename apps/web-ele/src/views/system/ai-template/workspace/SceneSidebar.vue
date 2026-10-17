<script setup lang="ts">
import type { SceneSummary } from '#/api/system/ai-scene';

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
      <h2>提示词配置</h2>
      <button v-if="canCreate" type="button" @click="$emit('create')">
        新建场景
      </button>
    </div>
    <input
      aria-label="搜索场景"
      placeholder="搜索场景"
      type="search"
      :value="search"
      @input="$emit('update:search', ($event.target as HTMLInputElement).value)"
    />
    <p v-if="loading" role="status">正在读取场景…</p>
    <p v-else-if="scenes.length === 0" class="empty">暂无匹配的场景</p>
    <nav aria-label="场景列表">
      <button
        v-for="scene in scenes"
        :key="scene.sceneKey"
        type="button"
        class="scene-item"
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
        <small>
          {{
            !scene.enabled
              ? '已停用'
              : scene.currentVersionId
                ? '已配置'
                : '待配置'
          }}
        </small>
      </button>
    </nav>
    <div class="pages">
      <button
        type="button"
        :disabled="loading || page <= 1"
        @click="$emit('page', page - 1)"
      >
        上一页
      </button>
      <span>第 {{ page }} 页</span>
      <button
        type="button"
        :disabled="loading || BigInt(page * 100) >= BigInt(total)"
        @click="$emit('page', page + 1)"
      >
        下一页
      </button>
    </div>
  </aside>
</template>

<style scoped>
.scene-sidebar {
  width: 260px;
  flex-shrink: 0;
  padding: 20px;
  border-right: 1px solid hsl(var(--border));
}
.pages {
  display: flex;
  justify-content: space-between;
  margin-top: 20px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}
.pages button:disabled {
  opacity: 0.45;
}
.sidebar-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 20px;
}
h2 {
  font-size: 16px;
  font-weight: 600;
}
input {
  width: 100%;
  padding: 9px 12px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  background: transparent;
}
nav {
  margin-top: 16px;
  display: grid;
  gap: 8px;
}
button {
  text-align: left;
}
.sidebar-heading button {
  color: hsl(var(--primary));
  font-size: 12px;
}
.scene-item {
  display: grid;
  gap: 6px;
  padding: 14px;
  border: 1px solid transparent;
  border-radius: 10px;
  overflow-wrap: anywhere;
}
.scene-item:hover {
  background: hsl(var(--accent));
}
.scene-item[aria-current='page'] {
  border-color: hsl(var(--primary));
  background: hsl(var(--accent));
}
.scene-item span,
.scene-item small,
.empty {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}
.empty {
  margin: 24px 0;
}
@media (max-width: 1100px) {
  .scene-sidebar {
    width: 220px;
    padding: 16px;
  }
}
@media (max-width: 720px) {
  .scene-sidebar {
    width: 100%;
    border-right: 0;
    border-bottom: 1px solid hsl(var(--border));
  }
  nav {
    max-height: 200px;
    overflow: auto;
  }
}
</style>
