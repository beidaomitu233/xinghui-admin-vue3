<script setup lang="ts">
import type { SavePhase } from './ordered-autosave';

import { ElButton } from 'element-plus';

defineProps<{ error: null | string; phase: SavePhase }>();
defineEmits<{ conflict: []; retry: [] }>();
const labels: Record<SavePhase, string> = {
  conflict: '版本冲突，本地输入已保留',
  error: '保存失败，本地输入已保留',
  idle: '无待保存修改',
  invalid: '请修正后保存，原有效配置继续使用',
  readonly: '只读',
  saved: '已保存',
  saving: '正在保存…',
  waiting: '有未保存的修改',
};
</script>
<template>
  <div class="save-status" role="status" aria-live="polite" :data-phase="phase">
    <span>{{ error || labels[phase] }}</span>
    <ElButton
      v-if="phase === 'error' || phase === 'invalid'"
      type="primary"
      link
      size="small"
      @click="$emit('retry')"
    >
      重试保存
    </ElButton>
    <ElButton
      v-if="phase === 'conflict'"
      type="primary"
      link
      size="small"
      @click="$emit('conflict')"
    >
      处理冲突
    </ElButton>
  </div>
</template>
<style scoped>
.save-status {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.save-status[data-phase='saved'] {
  color: var(--el-color-success);
}

.save-status[data-phase='error'],
.save-status[data-phase='conflict'],
.save-status[data-phase='invalid'] {
  color: var(--el-color-warning);
}
</style>
