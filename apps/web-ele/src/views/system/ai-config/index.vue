<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import { Page } from '@vben/common-ui';

import { ElButton } from 'element-plus';

import ModelHubWorkspace from './ModelHubWorkspace.vue';
import SceneRoutingWorkspace from './SceneRoutingWorkspace.vue';

const route = useRoute();
const sceneKey = computed(() =>
  typeof route.query.sceneKey === 'string' ? route.query.sceneKey : '',
);
const routing = ref(Boolean(sceneKey.value));
const routingWorkspace = ref<InstanceType<typeof SceneRoutingWorkspace>>();
async function returnToModels() {
  if (await routingWorkspace.value?.canLeave()) routing.value = false;
}
watch(sceneKey, (value) => {
  if (value) routing.value = true;
});
</script>
<template>
  <Page auto-content-height>
    <div v-if="routing" class="hub-routing-workspace">
      <ElButton @click="returnToModels">← 返回模型设置</ElButton>
      <SceneRoutingWorkspace
        ref="routingWorkspace"
        :initial-scene-key="sceneKey"
      />
    </div>
    <ModelHubWorkspace v-else @routing="routing = true" />
  </Page>
</template>
<style scoped>
.hub-routing-workspace {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
}

.hub-routing-workspace > :deep(.el-button) {
  align-self: flex-start;
}
</style>
