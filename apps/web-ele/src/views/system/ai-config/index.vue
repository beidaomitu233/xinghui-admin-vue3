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
  <Page
    header-class="flex-wrap gap-3"
    v-if="routing"
    title="AI 配置"
    description="维护业务模型与场景调用顺序"
  >
    <template #extra>
      <ElButton @click="returnToModels">返回模型设置</ElButton>
    </template>
    <SceneRoutingWorkspace
      ref="routingWorkspace"
      :initial-scene-key="sceneKey"
    />
  </Page>
  <ModelHubWorkspace v-else @routing="routing = true" />
</template>
