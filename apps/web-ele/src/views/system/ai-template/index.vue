<script setup lang="ts">
import { computed } from 'vue';

import { useAccessStore } from '@vben/stores';

import LegacyWorkspace from './LegacyWorkspace.vue';
import SceneWorkspace from './workspace/SceneWorkspace.vue';

const access = useAccessStore();
const sceneAccess = computed(() =>
  access.accessCodes.includes('ai:scene:list'),
);
const legacyAccess = computed(() =>
  ['ai:template:list', 'ai:data:list'].some((code) =>
    access.accessCodes.includes(code),
  ),
);
</script>
<template>
  <SceneWorkspace v-if="sceneAccess" />
  <LegacyWorkspace v-else-if="legacyAccess" />
  <div v-else class="p-6 text-muted-foreground">暂无提示词配置访问权限</div>
</template>
