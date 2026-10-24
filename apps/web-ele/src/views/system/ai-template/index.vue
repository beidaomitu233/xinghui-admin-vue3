<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';

import { Page } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';

import { ElButton } from 'element-plus';

import LegacyWorkspace from './LegacyWorkspace.vue';
import SceneWorkspace from './workspace/SceneWorkspace.vue';

const access = useAccessStore();
const route = useRoute();
const initialSceneKey = computed(() =>
  typeof route.query.sceneKey === 'string' ? route.query.sceneKey : undefined,
);
const workspace = ref<InstanceType<typeof SceneWorkspace>>();
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
  <Page
    auto-content-height
    header-class="flex-wrap gap-3"
    title="提示词配置"
    description="维护场景提示词、数据引用与试运行配置"
    content-class="flex min-h-0 flex-col gap-4"
  >
    <div
      v-if="sceneAccess"
      class="flex shrink-0 flex-wrap gap-2"
      aria-label="提示词操作"
    >
      <ElButton @click="workspace?.refresh()">刷新</ElButton>
      <ElButton
        v-if="access.accessCodes.includes('ai:scene:add')"
        type="primary"
        @click="workspace?.openCreate()"
      >
        新建场景
      </ElButton>
    </div>
    <SceneWorkspace
      v-if="sceneAccess"
      ref="workspace"
      :initial-scene-key="initialSceneKey"
      class="min-h-0 flex-1"
    />
    <LegacyWorkspace v-else-if="legacyAccess" />
    <div v-else class="text-muted-foreground">暂无提示词配置访问权限</div>
  </Page>
</template>
