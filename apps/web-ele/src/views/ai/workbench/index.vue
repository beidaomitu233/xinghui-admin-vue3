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
.hub-chat :deep([class$='-sessions-header-left'] img) {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
}
.hub-loading {
  position: absolute;
  inset: 48px;
  z-index: 1;
  pointer-events: none;
}
</style>
