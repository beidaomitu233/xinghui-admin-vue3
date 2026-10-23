<script setup lang="ts">
import { computed, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';

import { ElButton } from 'element-plus';

import AdminPageHeader from '#/components/admin-page-header.vue';

import LegacyWorkspace from './LegacyWorkspace.vue';
import SceneWorkspace from './workspace/SceneWorkspace.vue';

const access = useAccessStore();
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
  <Page content-class="admin-page">
    <AdminPageHeader
      title="提示词配置"
      description="维护场景提示词、数据引用与试运行配置"
    >
      <template v-if="sceneAccess" #actions>
        <ElButton @click="workspace?.refresh()">刷新</ElButton>
        <ElButton
          v-if="access.accessCodes.includes('ai:scene:add')"
          type="primary"
          @click="workspace?.openCreate()"
        >
          新建场景
        </ElButton>
      </template>
    </AdminPageHeader>
    <SceneWorkspace v-if="sceneAccess" ref="workspace" />
    <LegacyWorkspace v-else-if="legacyAccess" />
    <div v-else class="text-muted-foreground">暂无提示词配置访问权限</div>
  </Page>
</template>
