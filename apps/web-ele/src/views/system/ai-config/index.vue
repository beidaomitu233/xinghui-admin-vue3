<script setup lang="ts">
import { watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import ModelHubWorkspace from './ModelHubWorkspace.vue';

const route = useRoute();
const router = useRouter();
function configureScenes() {
  const sceneKey =
    typeof route.query.sceneKey === 'string' ? route.query.sceneKey : undefined;
  void router.push({
    path: '/ai/templates',
    query: sceneKey ? { sceneKey } : {},
  });
}
watch(
  () => route.query.sceneKey,
  (value) => {
    if (typeof value === 'string' && value) configureScenes();
  },
  { immediate: true },
);
</script>
<template>
  <ModelHubWorkspace @routing="configureScenes" />
</template>
