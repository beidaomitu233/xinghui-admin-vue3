<script setup lang="ts">
import type { AgentImage } from '#/api/system/ai-workbench';

import { onBeforeUnmount, ref, watch } from 'vue';

import { useAccessStore } from '@vben/stores';

import { ElButton, ElImage } from 'element-plus';

import { readAgentImage } from '#/api/system/ai-workbench';

const props = defineProps<{ image: AgentImage; sessionId: string }>();
const access = useAccessStore();
const url = ref('');
const failed = ref(false);
let generation = 0;
function clear() {
  if (url.value) URL.revokeObjectURL(url.value);
  url.value = '';
}
async function load() {
  const ticket = ++generation;
  clear();
  failed.value = false;
  try {
    const blob = await readAgentImage(props.sessionId, props.image.id);
    if (ticket === generation) url.value = URL.createObjectURL(blob);
  } catch {
    if (ticket === generation) failed.value = true;
  }
}
watch(
  () => [props.sessionId, props.image.id, access.accessToken],
  () => void load(),
  { immediate: true },
);
onBeforeUnmount(() => {
  generation++;
  clear();
});
</script>
<template>
  <ElImage
    v-if="url"
    :src="url"
    :alt="image.name"
    :preview-src-list="[url]"
    fit="cover"
    preview-teleported
    class="agent-image"
  />
  <ElButton v-else-if="failed" size="small" @click="load">重试图片</ElButton>
  <span v-else class="agent-image text-xs text-muted-foreground">
    读取图片…
  </span>
</template>
<style scoped>
.agent-image {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 80px;
  height: 80px;
  vertical-align: middle;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
}
</style>
