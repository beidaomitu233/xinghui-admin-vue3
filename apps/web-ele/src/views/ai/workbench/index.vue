<script setup lang="ts">
import {
  nextTick,
  onActivated,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';

import { Page } from '@vben/common-ui';
import { preferences } from '@vben/preferences';
import { useAccessStore } from '@vben/stores';

import { ElAlert, ElSkeleton } from 'element-plus';

import { mountHub } from './mount-hub';

defineOptions({ name: 'AiWorkbench' });
const host = ref<HTMLElement>();
const loading = ref(true);
const error = ref('');
const access = useAccessStore();
let handle: Awaited<ReturnType<typeof mountHub>> | undefined;
let mounting = false;
let disposed = false;
async function mount() {
  if (mounting || handle || disposed || !host.value) return;
  if (!access.accessCodes.includes('ai:agent:invoke')) {
    loading.value = false;
    error.value = '当前账号无权使用AI中台。';
    return;
  }
  mounting = true;
  loading.value = true;
  error.value = '';
  try {
    const value = await mountHub(
      host.value,
      document.documentElement.classList.contains('dark'),
      access.accessCodes,
    );
    if (disposed) value.dispose();
    else handle = value;
  } catch {
    error.value = 'AI中台暂时无法加载，请稍后重试。';
  } finally {
    mounting = false;
    loading.value = false;
  }
}
onMounted(mount);
onActivated(mount);
onBeforeUnmount(() => {
  disposed = true;
  handle?.dispose();
});
watch(
  () => preferences.theme.mode,
  async () => {
    await nextTick();
    handle?.setTheme(document.documentElement.classList.contains('dark'));
  },
);
</script>
<template>
  <Page auto-content-height content-class="!p-0">
    <section class="hub-page" aria-label="AI 中台">
      <ElAlert v-if="error" :title="error" type="error" :closable="false" />
      <ElSkeleton v-if="loading" class="hub-loading" :rows="7" animated />
      <div ref="host" class="hub-chat"></div>
    </section>
  </Page>
</template>
<style scoped>
@media (max-width: 780px) {
  .hub-chat {
    --hub-welcome-columns: 2;
  }
}

.hub-page {
  position: relative;
  height: 100%;
  min-height: 360px;
  overflow: hidden;
}

.hub-chat {
  height: 100%;
  min-height: 360px;
}

/* Adjust native component spacing; keep its layout, messages and interactions. */
.hub-chat :deep([class$='-conversations-list'] [class*='-conversations-item']) {
  padding-inline-start: 0;
}

.hub-chat :deep([class$='-conversations-content']) {
  padding-inline-start: calc(8px + 1em);
}

.hub-chat :deep([class$='-welcome-prompts-prompts']) {
  display: grid;
  grid-template-columns: repeat(var(--hub-welcome-columns, 3), minmax(0, 1fr));
  gap: 12px;
  width: min(720px, 100%);
  margin-top: 28px;
}

.hub-chat :deep([class$='-welcome-prompts-prompt']) {
  height: 56px;
}

.hub-chat :deep([class$='-welcome-prompts-prompt-icon']) {
  display: none;
}

.hub-chat :deep(.hub-answer) {
  padding-block: 12px;
}

.hub-chat :deep([data-role='user'] [class$='-bubble-content-filled']) {
  padding: 12px 20px;
  background: #edf3ff;
  border-radius: 22px;
}

.hub-chat :deep(.hub-message-actions) {
  margin-top: 8px;
}

:global(.dark)
  .hub-chat
  :deep([data-role='user'] [class$='-bubble-content-filled']) {
  background: #23324d;
}

.hub-chat :deep(.hub-task-output) {
  width: 100%;
  max-width: 720px;
  margin-block: 16px 8px;
}

.hub-chat :deep(.hub-progress-card),
.hub-chat :deep(.hub-change-card),
.hub-chat :deep(.hub-change-summary) {
  width: 100%;
  box-shadow: none;
}

.hub-chat :deep(.hub-change-card),
.hub-chat :deep(.hub-change-summary) {
  margin-top: 12px;
}

.hub-chat :deep(.hub-change-summary .hub-change-card) {
  margin-top: 0;
}

.hub-chat :deep(.hub-card-title) {
  min-width: 0;
  font-weight: 500;
}

.hub-chat :deep(.hub-card-icon) {
  display: inline-flex;
  flex: 0 0 28px;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 8%);
  border-radius: 6px;
}

.hub-chat :deep(.hub-step-count) {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: hsl(var(--muted-foreground));
}

.hub-chat :deep(.hub-phase-description) {
  display: block;
  font-size: 13px;
  line-height: 1.7;
  color: hsl(var(--muted-foreground));
}

.hub-loading {
  position: absolute;
  inset: 48px;
  z-index: 1;
  pointer-events: none;
}
</style>
