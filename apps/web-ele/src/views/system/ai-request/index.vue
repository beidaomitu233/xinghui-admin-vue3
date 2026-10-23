<script setup lang="ts">
import { Page } from '@vben/common-ui';

import AdminPageHeader from '#/components/admin-page-header.vue';

import MonitorWorkspace from './MonitorWorkspace.vue';
</script>
<template>
  <Page content-class="admin-page">
    <AdminPageHeader
      title="调用监控"
      description="查看对话记录与模型调用情况"
    />
    <MonitorWorkspace />
  </Page>
</template>
