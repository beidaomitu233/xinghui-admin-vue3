<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import { Page } from '@vben/common-ui';

import { ElTabPane, ElTabs } from 'element-plus';

import ChannelWorkspace from './ChannelWorkspace.vue';
import SceneRoutingWorkspace from './SceneRoutingWorkspace.vue';

const route = useRoute();
const sceneKey = computed(() =>
  typeof route.query.sceneKey === 'string' ? route.query.sceneKey : '',
);
const tab = ref(sceneKey.value ? 'routing' : 'channels');
watch(sceneKey, (value) => {
  if (value) tab.value = 'routing';
});
</script>
<template>
  <Page auto-content-height>
    <ElTabs v-model="tab">
      <ElTabPane label="渠道与密钥" name="channels" lazy>
        <ChannelWorkspace />
      </ElTabPane>
      <ElTabPane label="场景调用顺序" name="routing" lazy>
        <SceneRoutingWorkspace :initial-scene-key="sceneKey" />
      </ElTabPane>
    </ElTabs>
  </Page>
</template>
